import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { emailReady, sendEmail } from "./email";
import { entitlement } from "./entitlements";
import { enqueue, finish, retry, type Job } from "./jobs";
import { fileName, type PdfDesign } from "./pdf/design";
import type { AiPage, PdfParams, PdfSnapshot } from "./pdf/pages";
import { makeSnapshot } from "./pdf/server";
import { reportLimits } from "./plans";
import { reportEmail } from "./reportEmail";
import { senderName } from "./senderName";
import { dueWork, sendKey, sendStep, whenLine, type FileState, type SendRow, type When } from "./schedules";

// Scheduled reports (docs/reports.md, section 32.4). The worker's scheduler tick queues one send per schedule per
// due time; each send makes the PDFs on the PDF worker, waits for them, and emails them once.
//
// Nothing sends twice: report_sends has one row per schedule per due time (unique), the send job's key is the
// send's id, a send that is no longer "working" does nothing, and the email carries an idempotency key.

type Schedule = When & {
  id: string;
  workspace_id: string;
  brand_id: string;
  name: string;
  pages: AiPage[];
  design: PdfDesign;
  params: PdfParams;
  recipients: string[];
  subject: string | null;
  active: boolean;
  next_run_at: string | null;
  created_by: string | null;
};
const SCHEDULE_COLS = "id, workspace_id, brand_id, name, pages, design, params, cadence, weekday, monthday, hour, timezone, recipients, subject, active, next_run_at, created_by";
const WAIT_S = 15;

/** Queue a send for every schedule that is due. Safe to run twice at once: every write is keyed. */
export async function queueReportSends(db: SupabaseClient, now = Date.now()) {
  const { data, error } = await db.from("report_schedules").select(SCHEDULE_COLS).eq("active", true).lte("next_run_at", new Date(now).toISOString()).order("next_run_at").limit(200);
  if (error) {
    // Before supabase/046_report_files.sql there are no schedules.
    if (/report_schedules/.test(error.message)) return 0;
    throw new Error(error.message);
  }
  let queued = 0;
  for (const w of dueWork((data ?? []) as Schedule[], now)) {
    const s = w.schedule;
    // 1. One send row for this due time. A second tick finds the same row.
    await db.from("report_sends").upsert({ schedule_id: s.id, workspace_id: s.workspace_id, due_at: w.dueAt }, { onConflict: "schedule_id,due_at", ignoreDuplicates: true });
    const { data: send } = await db.from("report_sends").select("id").eq("schedule_id", s.id).eq("due_at", w.dueAt).maybeSingle();
    if (!send) continue;
    // 2. One job for that send.
    const id = (send as { id: string }).id;
    await enqueue("report_send", { sendId: id }, { workspaceId: s.workspace_id, key: `send:${id}`, maxAttempts: 5 });
    // 3. Only then move the schedule on, so a crash before this queues the same send again instead of skipping it.
    await db.from("report_schedules").update({ next_run_at: w.next, last_run_at: new Date(now).toISOString() }).eq("id", s.id).eq("next_run_at", s.next_run_at);
    queued++;
  }
  return queued;
}

type Send = SendRow & { id: string; schedule_id: string; workspace_id: string; due_at: string; attempts: number };
type FileRow = { id: string; status: FileState["status"]; error: string | null; job_id: number | null; pdf_path: string | null; title: string; snapshot: PdfSnapshot; created_at: string };

async function filesOf(db: SupabaseClient, ids: string[]) {
  if (!ids.length) return null;
  const { data } = await db.from("report_files").select("id, status, error, job_id, pdf_path, title, snapshot, created_at").in("id", ids);
  const rows = (data ?? []) as FileRow[];
  const jobs = rows.filter((f) => f.status === "making" && f.job_id).map((f) => f.job_id!);
  const { data: js } = jobs.length ? await db.from("jobs").select("id, status, last_error").in("id", jobs) : { data: [] };
  const dead = new Map(((js ?? []) as { id: number; status: string; last_error: string | null }[]).filter((j) => j.status === "dead").map((j) => [j.id, j.last_error]));
  // In the schedule's page order.
  const byId = new Map(rows.map((f) => [f.id, f]));
  return ids.map((id) => byId.get(id)).filter((f): f is FileRow => Boolean(f)).map((f) => ({ ...f, jobDead: f.job_id !== null && dead.has(f.job_id), error: f.error ?? (f.job_id !== null ? (dead.get(f.job_id) ?? null) : null) }));
}

/** Make the send's PDFs: one file per page, each printed by the PDF worker. */
async function makeFiles(db: SupabaseClient, s: Schedule, send: Send) {
  const ids: string[] = [];
  for (const page of s.pages) {
    const made = await makeSnapshot(db, s.workspace_id, s.brand_id, page, s.design, s.params);
    const { data: row, error } = await db
      .from("report_files")
      .insert({ workspace_id: s.workspace_id, brand_id: made.brandId, page, title: made.title, design: made.design, params: made.params, snapshot: made.snapshot, source: "schedule", schedule_id: s.id, created_by: s.created_by })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    const fileId = (row as { id: string }).id;
    const jobId = await enqueue("report_pdf", { fileId, workspaceId: s.workspace_id }, { workspaceId: s.workspace_id, key: `file:${fileId}`, maxAttempts: 3 });
    if (jobId) await db.from("report_files").update({ job_id: jobId }).eq("id", fileId);
    ids.push(fileId);
  }
  // Only the first run keeps its files. A run that raced here (a lease that ran out) removes the ones it made.
  const { data: saved } = await db.from("report_sends").update({ file_ids: ids }).eq("id", send.id).eq("file_ids", "{}").select("id");
  if (!saved?.length) await db.from("report_files").delete().in("id", ids);
}

/** Email the finished PDFs, once. */
async function email(db: SupabaseClient, s: Schedule, send: Send, files: FileRow[]) {
  const attachments = await Promise.all(
    files.map(async (f) => {
      const { data, error } = await db.storage.from("report-pdfs").download(f.pdf_path ?? "");
      if (error || !data) throw new Error(`A PDF could not be read: ${error?.message ?? "missing"}.`);
      return { filename: fileName(f.title, f.snapshot.brand?.name ?? "", new Date(f.created_at)), content: Buffer.from(await data.arrayBuffer()).toString("base64") };
    }),
  );
  const first = files[0].snapshot;
  const replyTo = s.created_by ? ((await db.auth.admin.getUserById(s.created_by).catch(() => null))?.data.user?.email ?? null) : null;
  const mail = reportEmail({
    maker: first.tokens.maker,
    accent: first.tokens.accent,
    brand: first.brand.name,
    name: s.name,
    subject: s.subject,
    when: whenLine(s),
    period: first.period,
    files: files.map((f) => f.title),
    date: new Date(send.due_at),
  });
  await sendEmail(s.recipients, mail.subject, mail.html, undefined, {
    text: mail.text,
    attachments,
    replyTo,
    // The brand design sends under the kit's name plus " via Arrowsterr"; the address stays the app's.
    fromName: first.tokens.design === "brand" ? senderName(first.tokens.maker) : undefined,
    idempotencyKey: sendKey(send.id),
  });
  const done = { status: "sent", sent_at: new Date().toISOString(), error: null };
  const { error } = await db.from("report_sends").update({ ...done, recipients: s.recipients }).eq("id", send.id);
  // Before supabase/056_report_schedules.sql there is no recipients column.
  if (error) await db.from("report_sends").update(done).eq("id", send.id);
}

/** One step of a scheduled send. Waiting on PDFs puts the job back without using an attempt. */
export async function reportSend(db: SupabaseClient, job: Job) {
  const { data } = await db.from("report_sends").select("id, schedule_id, workspace_id, due_at, status, file_ids, attempts, created_at").eq("id", String(job.payload.sendId ?? "")).maybeSingle();
  const send = data as Send | null;
  if (!send) return finish(job.id);
  const fail = async (error: string) => {
    await db.from("report_sends").update({ status: "failed", error: error.slice(0, 500) }).eq("id", send.id).eq("status", "working");
    await finish(job.id);
  };
  try {
    const { data: sRow } = await db.from("report_schedules").select(SCHEDULE_COLS).eq("id", send.schedule_id).maybeSingle();
    const s = sRow as Schedule | null;
    if (!s) return fail("The schedule was deleted.");
    const ent = await entitlement(send.workspace_id);
    const files = await filesOf(db, send.file_ids);
    const step = sendStep(send, files, { active: s.active, allowed: !ent.readOnly && reportLimits(ent.plan).schedules > 0, email: emailReady() });
    if (step.do === "done") return finish(job.id);
    if (step.do === "fail") return fail(step.error);
    if (step.do === "make") await makeFiles(db, s, send);
    if (step.do === "make" || step.do === "wait") return retry(job.id, "Waiting for the PDFs.", WAIT_S, { count: false });
    await db.from("report_sends").update({ attempts: send.attempts + 1 }).eq("id", send.id);
    await email(db, s, send, files!);
    await finish(job.id);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    // The last try: say why on the send, so its history shows it. Earlier tries go back to the worker's retry.
    if (job.attempts >= job.max_attempts) return fail(message);
    await db.from("report_sends").update({ error: message.slice(0, 500) }).eq("id", send.id);
    throw e;
  }
}
