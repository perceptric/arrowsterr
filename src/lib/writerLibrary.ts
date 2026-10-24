// The Agentic Writer's lists, read by the browser as the signed-in member (050 lets members read).
// Topics are calendar items imported into the writer; the Library holds every brief and draft of a brand.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { BriefStatus, WriterBrief } from "./writerBrief.ts";
import type { DraftStatus, ModuleState, Section } from "./writerDraft.ts";

const NOT_RUN = "Run supabase/050_agentic_writer.sql in Supabase.";
const check = <T>(r: { data: T; error: { message: string } | null }) => {
  if (r.error) throw new Error(/writer_/.test(r.error.message) ? NOT_RUN : r.error.message);
  return r.data;
};

/** When a topic went into the writer, or null. The older "Write now" mark counts too. */
export function inWriterAt(extra: Record<string, unknown> | null | undefined): string | null {
  const v = extra?.in_writer_at ?? extra?.write_queued_at;
  return typeof v === "string" && v ? v : null;
}

export type BriefLite = { id: string; item_id: string; status: BriefStatus; step: "research" | "writing" | "done"; error: string | null; version: number; research_run_id: string | null; title: string | null; updated_at: string };
export type DraftLite = { id: string; item_id: string; brief_id: string; doc_id: string | null; status: DraftStatus; step: string; error: string | null; version: number; words: number; ready_at: string | null; updated_at: string };
export type Topic = {
  id: string;
  keyword: string;
  status: "planned" | "brief" | "writing" | "review" | "published";
  stage: "bofu" | "mofu" | "tofu" | null;
  due_date: string | null;
  /** The live post's link, once published. */
  url: string | null;
  added: string;
  brief: BriefLite | null;
  draft: DraftLite | null;
};

const BRIEF_COLS = "id, item_id, status, step, error, version, research_run_id, updated_at, title:brief->>h1";
const DRAFT_COLS = "id, item_id, brief_id, doc_id, status, step, error, version, words, ready_at, updated_at";

/**
 * The Library's topics, newest first, with their brief and draft: every piece imported from the Editorial Calendar,
 * and every piece that has a brief or draft even if it was taken out, so nothing written goes missing.
 */
export async function listTopics(sb: SupabaseClient, siteId: string): Promise<Topic[]> {
  const [briefs, drafts] = await Promise.all([sb.from("writer_briefs").select(BRIEF_COLS).eq("site_id", siteId), sb.from("writer_drafts").select(DRAFT_COLS).eq("site_id", siteId)]);
  const b = (check(briefs) ?? []) as unknown as BriefLite[];
  const d = (check(drafts) ?? []) as unknown as DraftLite[];
  const written = [...new Set([...b, ...d].map((x) => x.item_id))];
  const cols = "id, keyword, stage, due_date, status, url, extra";
  const [imported, withDocs] = await Promise.all([
    sb.from("calendar_items").select(cols).eq("site_id", siteId).or("extra->>in_writer_at.not.is.null,extra->>write_queued_at.not.is.null"),
    written.length ? sb.from("calendar_items").select(cols).in("id", written) : Promise.resolve({ data: [], error: null }),
  ]);
  type Row = { id: string; keyword: string; stage: Topic["stage"]; status: Topic["status"]; due_date: string | null; url: string | null; extra: Record<string, unknown> | null };
  const items = new Map<string, Row>();
  for (const i of [...((check(imported) ?? []) as Row[]), ...((check(withDocs) ?? []) as Row[])]) items.set(i.id, i);
  const latest = (x: { updated_at: string } | undefined) => x?.updated_at ?? "";
  return [...items.values()]
    .map((i) => {
      const brief = b.find((x) => x.item_id === i.id) ?? null;
      const draft = d.find((x) => x.item_id === i.id) ?? null;
      return { id: i.id, keyword: i.keyword, status: i.status, stage: i.stage, due_date: i.due_date, url: i.url ?? null, added: inWriterAt(i.extra) ?? [latest(brief ?? undefined), latest(draft ?? undefined)].sort().pop() ?? "", brief, draft };
    })
    .sort((x, y) => y.added.localeCompare(x.added));
}

/** Every piece's brief and draft on a site, by calendar item id, for the Editorial Calendar's Write column. */
export async function writerStates(sb: SupabaseClient, siteId: string): Promise<Map<string, { brief: BriefLite | null; draft: DraftLite | null }>> {
  const [briefs, drafts] = await Promise.all([sb.from("writer_briefs").select(BRIEF_COLS).eq("site_id", siteId), sb.from("writer_drafts").select(DRAFT_COLS).eq("site_id", siteId)]);
  const out = new Map<string, { brief: BriefLite | null; draft: DraftLite | null }>();
  for (const b of (check(briefs) ?? []) as unknown as BriefLite[]) out.set(b.item_id, { brief: b, draft: out.get(b.item_id)?.draft ?? null });
  for (const d of (check(drafts) ?? []) as unknown as DraftLite[]) out.set(d.item_id, { brief: out.get(d.item_id)?.brief ?? null, draft: d });
  return out;
}

/** One topic's brief and draft, for the Keyword Deep Dive. Null when the writer has none yet. */
export async function writerStateFor(sb: SupabaseClient, itemId: string): Promise<{ brief: BriefLite | null; draft: DraftLite | null }> {
  const [briefs, drafts] = await Promise.all([sb.from("writer_briefs").select(BRIEF_COLS).eq("item_id", itemId).limit(1), sb.from("writer_drafts").select(DRAFT_COLS).eq("item_id", itemId).limit(1)]);
  const b = (check(briefs) ?? []) as unknown as BriefLite[];
  const d = (check(drafts) ?? []) as unknown as DraftLite[];
  return { brief: b[0] ?? null, draft: d[0] ?? null };
}

export type FullBrief = BriefLite & { keyword: string; brief: WriterBrief | null; notes: string; note: string | null; approved_at: string | null };
export const getBrief = async (sb: SupabaseClient, id: string) =>
  check(await sb.from("writer_briefs").select("id, item_id, status, step, error, version, research_run_id, updated_at, keyword, brief, notes, note, approved_at").eq("id", id).maybeSingle()) as FullBrief | null;

export type FullDraft = DraftLite & { sections: (Section | null)[]; modules: (ModuleState | null)[]; checked: unknown | null; note: string | null };
export const getDraft = async (sb: SupabaseClient, id: string) => check(await sb.from("writer_drafts").select(`${DRAFT_COLS}, sections, modules, checked, note`).eq("id", id).maybeSingle()) as FullDraft | null;

/** How far a research run is: its status, and pages read out of pages queued. */
export async function researchProgress(sb: SupabaseClient, runId: string): Promise<{ status: string; read: number; total: number; error: string | null } | null> {
  const [run, pages] = await Promise.all([sb.from("article_runs").select("status, error").eq("id", runId).maybeSingle(), sb.from("article_pages").select("status").eq("run_id", runId)]);
  if (run.error || !run.data) return null;
  const list = (pages.data ?? []) as { status: string }[];
  return { status: run.data.status, error: run.data.error, read: list.filter((p) => p.status === "done").length, total: list.length };
}

// ─────────────── labels ───────────────
const STATUS: Record<string, string> = { generating: "Generating", ready: "Ready", approved: "Approved", failed: "Failed" };
export const statusLabel = (s: string) => STATUS[s] ?? s;
