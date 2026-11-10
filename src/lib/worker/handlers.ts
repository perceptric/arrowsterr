import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { runAgent } from "../agent";
import { readAnswer } from "../answer";
import { runBrief } from "../brief";
import { BRAND_CHECK_VERSION, cleanMentions, notBrand } from "../brandNames";
import { askJson } from "../claude";
import type { Chat } from "../chats";
import { getTask, postTasks, type DfsAnswer, type DfsEngine } from "../dataforseo";
import { answerRows, saveAnswers, type Profile } from "../db";
import { askEngine, availableEngines, viaDfs, WEEKLY_ENGINES, type Engine } from "../engines";
import { entitlement } from "../entitlements";
import { enqueue, enqueueMany, finish, rateOk, retry, type Job } from "../jobs";
import { afterDaily, dispatch } from "../integrations";
import { emailJob } from "../notify";
import { briefEmail, planEmail } from "../emails";
import type { Brief } from "../briefTypes";
import type { AgentResult } from "../research";
import { articleResearchJob } from "../articleResearchServer";
import { writerBriefJob, writerDraftJob } from "../writerServer";
import { wpPublishJob } from "../wpSyncServer";
import { queueWeeklyAudits, runAudit } from "../audit";
import { queueCwvSyncs, syncCwv } from "../cwv";
import { queueGscSyncs, syncGsc } from "../gsc";
import { runOnpage } from "../onpageServer";
import { runMap } from "../contentMapServer";
import { collectScan, queueWeeklyScans } from "../localServer";
import { queueProfileReads, runProfileRead } from "../localProfileServer";
import { queueReviewPulls, runReviewPull } from "../localReviewsServer";
import { collectAiScan, queueAiScans } from "../localAiServer";
import { collectRecheck } from "../localAlertsServer";
import { queueReportSends } from "../scheduleServer";
import { applySet, preparePlay, undoSet } from "../plays";
import { checkDue, promptAllowance } from "../plans";
import { PERCEPTION_VERSION } from "../perception";
import type { PlanBrief } from "../research";

// What each kind of job does. A handler either finishes its job, or puts it back with retry().
// Throwing counts as a failed attempt: the worker retries it with a growing wait.

export const LIMIT = "Daily limit reached. This workspace used all its AI answers for today.";
const STALE_MS = 20 * 3600_000; // a daily run still open after this is closed
const GIVE_UP_MS = 3 * 3600_000; // a DataForSEO task still queued after this is marked failed
const WINDOW_MIN = 20 * 60; // daily checks start between 00:00 and 20:00 UTC, one slot per brand

const promptKey = (p: string) => p.toLowerCase().replace(/\s+/g, " ").trim();
const failed = (engine: string, prompt: string, error: string): Chat => ({ engine, prompt, text: "", sources: [], brands: [], error });
const slim = (c: Chat) => ({ ...c, answered: Boolean(c.text), text: "" }); // saved chats drop the long text
const seed = (id: string) => [...id].reduce((n, c) => (n * 31 + c.charCodeAt(0)) % 100003, 7);
const today = () => new Date().toISOString().slice(0, 10);

/** The minute of the day (UTC) a brand's daily check starts. Spreads the load over the day. */
export const slotOf = (brandId: string) => seed(brandId) % WINDOW_MIN;

// ─────────────── schedule: start today's runs that are due ───────────────
export async function schedule(db: SupabaseClient, job: Job) {
  // Scheduled reports due this tick (docs/reports.md, section 32.4). A failure here never holds up the daily checks.
  await queueReportSends(db).catch((e) => console.error("Report schedules failed:", e instanceof Error ? e.message : e));
  // Weekly site audits (docs/site-audit.md), for brands that already ran one. A failure here never holds up the daily checks.
  await queueWeeklyAudits(db).catch((e) => console.error("Weekly site audits failed:", e instanceof Error ? e.message : e));
  // Technical SEO: Search Console and Chrome UX Report syncs, once a day per brand (docs/technical-seo-plan.md).
  await queueGscSyncs(db).catch((e) => console.error("Search Console syncs failed:", e instanceof Error ? e.message : e));
  await queueCwvSyncs(db).catch((e) => console.error("Core Web Vitals syncs failed:", e instanceof Error ? e.message : e));
  // Local Research: each keyword's weekly Google Maps grid scan (docs/local-research.md).
  await queueWeeklyScans(db).catch((e) => console.error("Weekly local scans failed:", e instanceof Error ? e.message : e));
  await queueProfileReads(db).catch((e) => console.error("Weekly local profile reads failed:", e instanceof Error ? e.message : e));
  await queueReviewPulls(db).catch((e) => console.error("Weekly local review pulls failed:", e instanceof Error ? e.message : e));
  await queueAiScans(db).catch((e) => console.error("Monthly local AI grids failed:", e instanceof Error ? e.message : e));
  const engines = availableEngines();
  if (!engines.length) return finish(job.id);
  const now = new Date();
  const minute = now.getUTCHours() * 60 + now.getUTCMinutes();
  const dayStart = `${today()}T00:00:00Z`;

  // Close daily runs that never finished, so a crash never blocks tomorrow.
  await db.from("runs").update({ status: "done" }).eq("source", "daily").eq("status", "running").lt("at", new Date(Date.now() - STALE_MS).toISOString());

  const { data: brands, error } = await db.from("brands").select("id, workspace_id, name, domain, prompts, daily").order("created_at");
  if (error) throw new Error(error.message);
  const { data: ran } = await db.from("runs").select("brand_id").eq("source", "daily").gte("at", dayStart);
  const started = new Set((ran ?? []).map((r) => r.brand_id));
  const due = (brands ?? []).filter((b) => b.daily && b.prompts?.length && !started.has(b.id) && slotOf(b.id) <= minute);

  const allowance = new Map<string, Map<string, number>>();
  for (const b of due) {
    const e = await entitlement(b.workspace_id);
    if (e.readOnly) continue;
    // Only what the plan covers is checked. The rest stays paused until the plan grows.
    if (!allowance.has(b.workspace_id)) allowance.set(b.workspace_id, promptAllowance((brands ?? []).filter((x) => x.workspace_id === b.workspace_id), e.limits));
    const prompts: string[] = (b.prompts as string[]).slice(0, allowance.get(b.workspace_id)!.get(b.id) ?? 0);
    if (!prompts.length) continue;
    // Weekly plans check each brand on its own day of the week, so the load stays even.
    if (!checkDue(seed(b.id), e.limits.checkEvery)) continue;
    // Claude and Perplexity answer through their own paid APIs, so they are checked once a week, on the brand's own day.
    const list = engines.filter((en) => (!WEEKLY_ENGINES.includes(en) || checkDue(seed(b.id), 7)) && (!e.limits.engines || e.limits.engines.includes(en)));
    if (!list.length) continue;
    const { data: run, error: err } = await db
      .from("runs")
      .insert({ workspace_id: b.workspace_id, brand_id: b.id, source: "daily", status: "running", engines: list, prompts, chats: [], expected: list.length * prompts.length })
      .select("id")
      .single();
    if (err || !run) throw new Error(err?.message ?? "Could not start a run.");
    await enqueueMany(
      list.flatMap((engine) =>
        prompts.map((prompt, i) => ({
          kind: "check" as const,
          workspace_id: b.workspace_id,
          key: `check:${run.id}:${engine}:${i}`,
          payload: { runId: run.id, brandId: b.id, brand: b.name, domain: b.domain, engine, prompt, day: today() },
        })),
      ),
    );
  }
  // Perception (docs/perception.md): read each finished run's answers once, and ask the direct questions once a week
  // per brand, on the brand's own day. Before 059_perception.sql these queries fail, and nothing is queued.
  // The last 30 days are read once, newest first, so the page fills right away instead of waiting for new checks.
  const recent = new Date(Date.now() - 30 * 864e5).toISOString();
  const settled = new Date(Date.now() - 60 * 60_000).toISOString(); // a browser run saves its answers when it ends, within the hour
  const { data: unread } = await db.from("runs").select("id, workspace_id, source, status, at").lt("perception_read", PERCEPTION_VERSION).gte("at", recent).order("at", { ascending: false }).limit(40);
  const readable = (unread ?? []).filter((r) => (r.source === "daily" ? r.status !== "running" : r.at < settled));
  if (readable.length) await enqueueMany(readable.map((r) => ({ kind: "perception" as const, workspace_id: r.workspace_id, key: `perception:${PERCEPTION_VERSION}:${r.id}`, payload: { runId: r.id } })));
  const askable = (brands ?? []).filter((b) => b.daily && b.prompts?.length && checkDue(seed(b.id), 7) && slotOf(b.id) <= minute);
  if (askable.length) await enqueueMany(askable.map((b) => ({ kind: "perception_probe" as const, workspace_id: b.workspace_id, key: `perception_probe:${b.id}:${today()}`, payload: { brandId: b.id } })));

  // Brands whose saved answers predate the current brand check get one cleanup. Before the migration this does nothing.
  const { data: unchecked } = await db.from("brands").select("id, workspace_id").lt("brands_checked", BRAND_CHECK_VERSION).limit(50);
  if (unchecked?.length) {
    await enqueueMany(unchecked.map((b) => ({ kind: "clean_brands" as const, workspace_id: b.workspace_id, key: `clean_brands:${BRAND_CHECK_VERSION}:${b.id}`, payload: { brandId: b.id } })));
  }
  await finish(job.id);
}

// ─────────────── check: one prompt on one AI for one brand ───────────────
type CheckPayload = { runId: string; brandId: string; brand: string; domain: string; engine: Engine; prompt: string; day: string; taskId?: string | null; postedAt?: number; counted?: boolean };

async function shared(db: SupabaseClient, p: CheckPayload): Promise<DfsAnswer | null> {
  const { data } = await db.from("shared_answers").select("answer").eq("engine", p.engine).eq("prompt_key", promptKey(p.prompt)).eq("day", p.day).maybeSingle();
  return (data?.answer as DfsAnswer | undefined) ?? null;
}
async function share(db: SupabaseClient, p: CheckPayload, answer: DfsAnswer) {
  await db.from("shared_answers").upsert({ engine: p.engine, prompt_key: promptKey(p.prompt), day: p.day, answer }, { onConflict: "engine,prompt_key,market,day", ignoreDuplicates: true });
}

/** Save the chat to its run. When it was the run's last chat, queue its daily numbers. */
async function record(db: SupabaseClient, job: Job, p: CheckPayload, chat: Chat) {
  if (chat.text) await saveAnswers(db, answerRows([chat], { workspace_id: job.workspace_id!, brand_id: p.brandId, run_id: p.runId, at: new Date().toISOString() }));
  const { data: last, error } = await db.rpc("append_chat", { p_run: p.runId, p_chat: slim(chat) });
  if (error) throw new Error(error.message);
  if (last) await enqueue("rollup", { runId: p.runId }, { workspaceId: job.workspace_id, key: `rollup:${p.runId}` });
  await finish(job.id);
}

/** Count one answer against the workspace's daily limit, once per job. */
async function counted(db: SupabaseClient, job: Job, p: CheckPayload) {
  if (p.counted) return true;
  const { data, error } = await db.rpc("take_answer", { p_ws: job.workspace_id });
  if (error) throw new Error(error.message);
  if (data) p.counted = true;
  return Boolean(data);
}

export async function check(db: SupabaseClient, job: Job) {
  const p = job.payload as unknown as CheckPayload;
  if (job.attempts >= job.max_attempts) return record(db, job, p, failed(p.engine, p.prompt, `${p.engine}: gave up after ${job.attempts} tries.`));

  let answer = await shared(db, p);
  if (!answer && viaDfs(p.engine)) {
    const engine = p.engine as DfsEngine;
    if (!p.taskId) {
      // Queue the question at DataForSEO (the cheap way). The answer is ready in up to about 45 minutes.
      if (!(await rateOk("dataforseo"))) return retry(job.id, "rate limit", 20, { count: false });
      if (!(await counted(db, job, p))) return record(db, job, p, failed(p.engine, p.prompt, LIMIT));
      const [id] = await postTasks(engine, [p.prompt]);
      if (!id) return record(db, job, p, failed(p.engine, p.prompt, `${p.engine}: DataForSEO did not accept this task.`));
      return retry(job.id, "waiting on DataForSEO", 300, { payload: { ...p, taskId: id, postedAt: Date.now() }, count: false });
    }
    const t = await getTask(engine, p.taskId);
    if (t.state === "waiting") {
      if (Date.now() - (p.postedAt ?? Date.now()) > GIVE_UP_MS) return record(db, job, p, failed(p.engine, p.prompt, `${p.engine}: DataForSEO took too long.`));
      return retry(job.id, "waiting on DataForSEO", 180, { count: false });
    }
    if (t.state === "failed") return record(db, job, p, failed(p.engine, p.prompt, t.error));
    answer = t.answer;
    await share(db, p, answer);
  } else if (!answer) {
    const provider = { ChatGPT: "openai", Gemini: "gemini", Claude: "anthropic", Perplexity: "perplexity" }[p.engine as string] ?? "other";
    if (!(await rateOk(provider))) return retry(job.id, "rate limit", 15, { count: false });
    if (!(await counted(db, job, p))) return record(db, job, p, failed(p.engine, p.prompt, LIMIT));
    try {
      answer = await askEngine(p.engine, p.prompt);
    } catch (e) {
      // Keep the counted flag, so the retry does not count this answer twice.
      await retry(job.id, e instanceof Error ? e.message : String(e), 30 * 2 ** job.attempts, { payload: { ...p } });
      return;
    }
    await share(db, p, answer);
  } else if (!(await counted(db, job, p))) {
    return record(db, job, p, failed(p.engine, p.prompt, LIMIT));
  }
  // Only the brand reading runs per brand. The answer itself was paid for once.
  await record(db, job, p, await readAnswer(p.engine, p.prompt, answer, p.brand, p.domain));
}

// ─────────────── rollup: the daily numbers for a finished run ───────────────
export async function rollup(db: SupabaseClient, job: Job) {
  const { runId } = job.payload as { runId: string };
  const { data: run } = await db.from("runs").select("brand_id, workspace_id, at, chats").eq("id", runId).maybeSingle();
  if (!run) return finish(job.id);
  const { data: brand } = await db.from("brands").select("name").eq("id", run.brand_id).maybeSingle();
  const you = (brand?.name ?? "").toLowerCase();
  const day = String(run.at).slice(0, 10);
  type Row = { brand_id: string; workspace_id: string; day: string; engine: string; named: string; is_you: boolean; answers: number; mentions: number; position_sum: number; sentiment_sum: number };
  const rows = new Map<string, Row>();
  const row = (engine: string, named: string) => {
    const k = `${engine}\n${named}`;
    if (!rows.has(k)) rows.set(k, { brand_id: run.brand_id, workspace_id: run.workspace_id, day, engine, named, is_you: named.toLowerCase() === you, answers: 0, mentions: 0, position_sum: 0, sentiment_sum: 0 });
    return rows.get(k)!;
  };
  for (const c of (run.chats ?? []) as Chat[]) {
    if (c.error || !(c.answered ?? Boolean(c.text))) continue;
    row(c.engine, "").answers++;
    for (const b of cleanMentions(c.brands, [brand?.name ?? ""])) {
      const r = row(c.engine, b.name);
      r.mentions++;
      r.position_sum += b.position;
      r.sentiment_sum += b.sentiment;
    }
  }
  // Every brand row also carries the day's answer count for its AI, so a share is mentions / answers.
  for (const r of rows.values()) r.answers = rows.get(`${r.engine}\n`)?.answers ?? r.answers;
  const list = [...rows.values()];
  for (let i = 0; i < list.length; i += 500) {
    const { error } = await db.from("daily_metrics").upsert(list.slice(i, i + 500), { onConflict: "brand_id,day,engine,named" });
    if (error) throw new Error(error.message);
  }
  // Slack alerts and webhooks (Zapier) for the day's result. Never blocks the numbers.
  await afterDaily(db, run.workspace_id, run.brand_id, day).catch((e) => console.error("Daily alerts failed:", e instanceof Error ? e.message : e));
  await finish(job.id);
}

// ─────────────── brief and plan: long AI work, off the web server ───────────────
async function giveBack(db: SupabaseClient, ws: string | null, metric: string, period: string | undefined) {
  if (ws && period) await db.rpc("give_back", { p_ws: ws, p_metric: metric, p_period: period, p_n: 1 });
}

export async function brief(db: SupabaseClient, job: Job) {
  const { itemId, period, tasks, fromPack, userId } = job.payload as { itemId: string; period?: string; tasks?: number; fromPack?: number; userId?: string };
  await runBrief(db, itemId);
  // A brief that failed hands its tasks back.
  const { data } = await db.from("calendar_items").select("brief_status, brief_error, keyword, volume, difficulty, stage, brief").eq("id", itemId).maybeSingle();
  // Someone who pressed Stop already knows, so only real endings get an email.
  if (job.workspace_id && (data?.brief_status === "done" || (data?.brief_status === "failed" && data.brief_error !== "Stopped."))) {
    const ok = data.brief_status === "done";
    const doc = (data.brief as Brief | null)?.brief;
    const url = `${process.env.APP_URL?.trim().replace(/\/+$/, "") || "https://app.arrowsterr.com"}/editorial-calendar?item=${itemId}`;
    await emailJob(db, job.workspace_id, userId, (footer) =>
      briefEmail(
        {
          ok,
          keyword: data.keyword,
          volume: data.volume,
          difficulty: data.difficulty,
          stage: data.stage,
          outline: (doc?.outline ?? []).map((o) => o.h2).filter(Boolean),
          terms: doc?.terms?.length ?? 0,
          questions: doc?.questions?.length ?? 0,
          error: data.brief_error,
          tasks: ok || !period ? 0 : (tasks ?? 75), // the same count given back below
          url,
        },
        footer,
      ),
    ).catch((e) => console.error("Brief email failed:", e instanceof Error ? e.message : e));
  }
  if (data?.brief_status === "done" && job.workspace_id) {
    await dispatch(db, job.workspace_id, "brief.ready", { keyword: data.keyword, item_id: itemId, url: `${process.env.APP_URL?.trim() || "https://app.arrowsterr.com"}/editorial-calendar` }).catch(() => {});
  }
  if (data?.brief_status === "failed" && job.workspace_id && period) {
    const n = tasks ?? 75;
    const { error } = await db.rpc("give_back_tasks", { p_ws: job.workspace_id, p_period: period, p_plan_n: n - (fromPack ?? 0), p_pack_n: fromPack ?? 0 });
    if (error) await giveBack(db, job.workspace_id, "tasks", period);
  }
  await finish(job.id);
}

export async function plan(db: SupabaseClient, job: Job) {
  const { runId, site, period } = job.payload as { runId: string; site: { id: string; domain: string; name: string; profile: Profile; brief?: PlanBrief }; period?: string };
  await runAgent(db, runId, site);
  const { data } = await db.from("keyword_runs").select("status, error, created_by, result").eq("id", runId).maybeSingle();
  if (data?.status === "failed") await giveBack(db, job.workspace_id, "plans", period);
  if (job.workspace_id && (data?.status === "done" || (data?.status === "failed" && data.error !== "Stopped."))) {
    const ok = data.status === "done";
    const result = (data.result ?? {}) as AgentResult;
    const pages = [
      ...(result.groups ?? []).map((g) => ({ keyword: g.primary, volume: g.volume, stage: g.stage })),
      ...(result.updates ?? []).map((u) => ({ keyword: u.page.replace(/^https?:\/\/[^/]+/, "") || u.page, volume: u.volume ?? 0, stage: u.stage, update: true })),
    ];
    const url = `${process.env.APP_URL?.trim().replace(/\/+$/, "") || "https://app.arrowsterr.com"}/editorial-calendar`;
    await emailJob(db, job.workspace_id, data.created_by, (footer) => planEmail({ ok, site: site.domain, pages, error: data.error, url }, footer)).catch((e) =>
      console.error("Plan email failed:", e instanceof Error ? e.message : e),
    );
  }
  await finish(job.id);
}

// ─────────────── Zippie: site audits and change sets ───────────────
export async function audit(db: SupabaseClient, job: Job) {
  const { auditId, domain, part } = job.payload as { auditId: string; domain: string; part?: number };
  await runAudit(db, auditId, domain, part ?? 0);
  await finish(job.id);
}

// Local Research (docs/local-research.md): collect a grid scan's Google Maps answers, again until all are in.
export async function local_fetch(db: SupabaseClient, job: Job) {
  const { scanId, round } = job.payload as { scanId: string; round?: number };
  await collectScan(db, scanId, round ?? 0);
  await finish(job.id);
}

// Local Research profiles (docs/local-research-plan.md, 4.4): read now, then collect posts in later rounds.
export async function local_profile(db: SupabaseClient, job: Job) {
  await runProfileRead(db, job.payload as Parameters<typeof runProfileRead>[1]);
  await finish(job.id);
}

// Local Research reviews (docs/local-research-plan.md, 4.5): post the pulls, collect them, then read themes.
export async function local_reviews(db: SupabaseClient, job: Job) {
  await runReviewPull(db, job.payload as Parameters<typeof runReviewPull>[1]);
  await finish(job.id);
}

// Local Research AI answers (docs/local-research-plan.md, 4.6): collect an AI grid's answers until all are in.
export async function local_ai(db: SupabaseClient, job: Job) {
  const { scanId, round } = job.payload as { scanId: string; round?: number };
  await collectAiScan(db, scanId, round ?? 0);
  await finish(job.id);
}

// Local Research alerts (docs/local-research-plan.md, 4.8): the second read of a rank drop.
export async function local_alert(db: SupabaseClient, job: Job) {
  const { alertId, round } = job.payload as { alertId: string; round?: number };
  await collectRecheck(db, alertId, round ?? 0);
  await finish(job.id);
}

// Content Map (docs/content-map.md). A failed build saves its error and hands its tasks back itself.
export async function content_map(db: SupabaseClient, job: Job) {
  const { mapId } = job.payload as { mapId: string };
  await runMap(db, mapId);
  await finish(job.id);
}

// Link Building was removed: link checks still in the queue just finish.
export async function link_check(_db: SupabaseClient, job: Job) {
  await finish(job.id);
}

// On-page Audit (docs/onpage-audit.md). A failed audit saves its error and hands its tasks back itself.
export async function onpage(db: SupabaseClient, job: Job) {
  const { auditId } = job.payload as { auditId: string };
  await runOnpage(db, auditId);
  await finish(job.id);
}

export async function play(db: SupabaseClient, job: Job) {
  await preparePlay(db, (job.payload as { setId: string }).setId);
  await finish(job.id);
}

export async function apply(db: SupabaseClient, job: Job) {
  const { setId, undo } = job.payload as { setId: string; undo?: boolean };
  await (undo ? undoSet(db, setId) : applySet(db, setId));
  await finish(job.id);
}

// ─────────────── article research: steps 1 to 3 of an article (docs/content-v2.md) ───────────────
// Search results and AI answers here; the Fly worker reads the pages. The job waits until 5 or more are read.
export const article_research = articleResearchJob;

// ─────────────── Agentic Writer: the brief and the draft (supabase/050_agentic_writer.sql) ───────────────
export const writer_brief = writerBriefJob;
export const writer_draft = writerDraftJob;
// ─────────────── wp_publish: publish a scheduled article on its date (wpSync.ts) ───────────────
// Idempotent: it updates the article's one post, never makes a second.
export const wp_publish = wpPublishJob;

// ─────────────── clean_brands: take questions and steps out of a brand's saved answers ───────────────

const CHECK_MODEL = () => process.env.EXTRACT_MODEL || "claude-haiku-5-5";
const CHECK_SCHEMA = {
  type: "object",
  properties: { items: { type: "array", items: { type: "object", properties: { name: { type: "string" }, brand: { type: "boolean" } }, required: ["name", "brand"], additionalProperties: false } } },
  required: ["items"],
  additionalProperties: false,
};

/**
 * Every name a brand's saved answers count as a brand is checked once: by the rules in brandNames.ts, then by Claude
 * Haiku in batches. Names that aren't brands leave the saved runs (the rest move up a place) and the daily numbers.
 */
export async function clean_brands(db: SupabaseClient, job: Job) {
  const { brandId } = job.payload as { brandId: string };
  const { data: brand } = await db.from("brands").select("name, prompts").eq("id", brandId).maybeSingle();
  if (!brand) return finish(job.id);
  const own = String(brand.name ?? "");
  const PAGE = 100;

  // 1. Every name in the saved answers, once.
  const names = new Map<string, string>();
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db.from("runs").select("chats").eq("brand_id", brandId).order("at").range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    for (const r of data ?? []) for (const c of (r.chats ?? []) as Chat[]) for (const b of c.brands ?? []) if (b.name && b.name.toLowerCase() !== own.toLowerCase()) names.set(b.name.toLowerCase(), b.name);
    if (!data || data.length < PAGE) break;
  }

  // 2. The rules first, then Claude for the names they let through.
  const drop = new Set([...names.entries()].filter(([, n]) => notBrand(n)).map(([k]) => k));
  const ask = [...names.entries()].filter(([k]) => !drop.has(k)).map(([, n]) => n);
  const topic = ((brand.prompts as string[] | null) ?? []).slice(0, 5).join(" | ");
  for (let i = 0; i < ask.length; i += 150) {
    const batch = ask.slice(i, i + 150);
    const res = await askJson<{ items?: { name: string; brand: boolean }[] }>(
      `These names were taken from AI answers to questions like: ${topic || "(not given)"}.\n\nA brand is the name of a company, product, app, service, agency or organization. Questions, steps, tips, features, criteria, categories, generic phrases, headings and job titles are never brands.\n\nFor each name, say whether it is a brand. Return every name exactly as given.\n\n${JSON.stringify(batch)}`,
      CHECK_SCHEMA,
      { model: CHECK_MODEL(), maxTokens: 8000, effort: "low" },
    );
    for (const it of res.items ?? []) if (it && it.brand === false && typeof it.name === "string") drop.add(it.name.trim().toLowerCase());
  }

  // 3. Rewrite the runs that held one, and remove those names from the daily numbers.
  if (drop.size) {
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await db.from("runs").select("id, status, chats").eq("brand_id", brandId).order("at").range(from, from + PAGE - 1);
      if (error) throw new Error(error.message);
      for (const r of data ?? []) {
        // A run still taking answers is left alone, so a chat added meanwhile is never written over. Its new chats are
        // already checked, and the older ones are tidied wherever runs are read.
        if (r.status === "running") continue;
        const chats = (r.chats ?? []) as Chat[];
        let changed = false;
        const next = chats.map((c) => {
          const kept = cleanMentions((c.brands ?? []).filter((b) => b.name.toLowerCase() === own.toLowerCase() || !drop.has(b.name.toLowerCase())), [own]);
          if (kept.length === (c.brands ?? []).length) return c;
          changed = true;
          const quote = c.quote && drop.has(c.quote.brand.toLowerCase()) ? null : c.quote;
          return { ...c, brands: kept, quote };
        });
        if (changed) {
          const { error: e } = await db.from("runs").update({ chats: next }).eq("id", r.id);
          if (e) throw new Error(e.message);
        }
      }
      if (!data || data.length < PAGE) break;
    }
    const gone = [...drop].map((k) => names.get(k)).filter((n): n is string => Boolean(n));
    for (let i = 0; i < gone.length; i += 200) {
      const { error } = await db.from("daily_metrics").delete().eq("brand_id", brandId).in("named", gone.slice(i, i + 200));
      if (error) throw new Error(error.message);
    }
  }
  console.log(`Brand check for ${brandId}: ${names.size} names, ${drop.size} weren't brands.`);
  await db.from("brands").update({ brands_checked: BRAND_CHECK_VERSION }).eq("id", brandId);
  await finish(job.id);
}

// ─────────────── Technical SEO: Search Console and Chrome UX Report ───────────────
export async function gsc_sync(db: SupabaseClient, job: Job) {
  const { brandId, part } = job.payload as { brandId: string; part?: number };
  await syncGsc(db, brandId, part ?? 0);
  await finish(job.id);
}

export async function cwv_sync(db: SupabaseClient, job: Job) {
  const { brandId } = job.payload as { brandId: string };
  await syncCwv(db, brandId);
  await finish(job.id);
}
