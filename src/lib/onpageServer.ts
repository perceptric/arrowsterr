import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { after } from "next/server";
import { googleTop10 } from "./brief";
import { askJson } from "./claude";
import { robotsVerdicts } from "./freeChecks";
import { take } from "./entitlements";
import { enqueue, queueReady } from "./jobs";
import { TASK_COST } from "./plans";
import { marketOf } from "./research";
import { research, Spend } from "./keywords";
import { audit, cleanSuggest, mainKeywords, pageKeyOf, type OnpageResult, type PageRead, type Speed } from "./onpage";
import { readOnpage } from "./onpageRead";
import { safeFetch } from "./safeFetch";

// On-page Audit runs (docs/onpage-audit.md): read the page, Google's top 10 for the keyword and every top page, then
// score them the same way (onpage.ts). Runs as a background job (kind "onpage"). A failed audit hands its tasks back.

const BROWSER = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
export type Charge = { period: string; plan: number; pack: number };
/** "job": the job takes the tasks when it starts (Zippie, whose chat route would hand them back if its stream failed). */
export type ChargeIn = Charge | "job" | null;

/** Start an audit for one page and keyword. The caller has already taken the tasks (charge). */
export async function startOnpage(db: SupabaseClient, ws: string, userId: string | null, brandId: string, url: string, keyword: string, charge: ChargeIn) {
  const { data, error } = await db.from("onpage_audits").insert({ workspace_id: ws, brand_id: brandId, url, keyword, created_by: userId, charge: charge === "job" ? { pending: true } : charge }).select("id").single();
  if (error || !data) throw new Error(error?.message ?? "Could not start the audit.");
  if (await queueReady()) await enqueue("onpage", { auditId: data.id }, { workspaceId: ws, key: `onpage:${data.id}`, maxAttempts: 1 });
  else after(() => runOnpage(db, data.id));
  return data.id as string;
}

async function aiBlocked(url: string) {
  try {
    const u = new URL(url);
    const r = await safeFetch(`${u.origin}/robots.txt`, { timeout: 8_000, maxBytes: 200_000 });
    if (!r.ok) return [];
    return robotsVerdicts(r.body, u.pathname)
      .filter((v) => v.purpose === "search" && v.verdict === "blocked")
      .map((v) => v.bot);
  } catch {
    return [];
  }
}

async function readUrl(url: string, blocked: string[] = []): Promise<PageRead | null> {
  const r = await safeFetch(url, { ua: BROWSER, timeout: 12_000, maxBytes: 3_000_000, accept: "text/html" });
  if (!r.ok || !/<html|<body|<p[\s>]/i.test(r.body.slice(0, 20_000))) return null;
  try {
    return readOnpage(r.body, r.url, blocked);
  } catch {
    return null;
  }
}

/** Largest paint on mobile from PageSpeed Insights. Optional: the speed check shows "Not measured" without it. */
async function speedOf(url: string): Promise<Speed> {
  const key = process.env.PAGESPEED_API_KEY?.trim();
  if (!key) return null;
  try {
    const q = new URLSearchParams({ url, strategy: "mobile", category: "performance", key });
    const res = await fetch(`https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${q}`, { signal: AbortSignal.timeout(70_000) });
    if (!res.ok) return null;
    const d = (await res.json()) as { lighthouseResult?: { categories?: { performance?: { score?: number } }; audits?: Record<string, { numericValue?: number }> } };
    const lcp = d.lighthouseResult?.audits?.["largest-contentful-paint"]?.numericValue;
    const score = d.lighthouseResult?.categories?.performance?.score;
    return { lcpMs: typeof lcp === "number" ? Math.round(lcp) : null, score: typeof score === "number" ? Math.round(score * 100) : null };
  } catch {
    return null;
  }
}

const SUGGEST_SCHEMA = {
  type: "object",
  properties: { title: { type: "string" }, description: { type: "string" }, answer: { type: "string" } },
  required: ["title", "description", "answer"],
  additionalProperties: false,
};

/** A title, a meta description and an opening answer, written from the page itself. Null when Claude can't. */
async function suggest(r: Omit<OnpageResult, "suggest">, page: PageRead): Promise<OnpageResult["suggest"]> {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  const top = r.top.filter((t) => t.title).slice(0, 6).map((t) => `- ${t.title}`).join("\n");
  const prompt = `Rewrite the search snippet and opening of this page so it ranks for "${r.keyword}" and AI answers quote it.

Page: ${r.url}
Current title: ${page.title || "(none)"}
Current meta description: ${page.description || "(none)"}
Current opening paragraph: ${page.firstParagraph || "(none)"}
Main text (start): ${page.text.slice(0, 2500)}

Titles ranking in Google's top 10 now:
${top || "(none)"}

Return JSON:
- title: 50 to 60 characters, the keyword near the start, the brand at the end after " | " only if it fits.
- description: 140 to 155 characters, one clear promise and one concrete detail from the page. No claims the page doesn't make.
- answer: a 40 to 80 word opening paragraph that answers the search directly in the first sentence, using only facts from the page.
Plain words a 9th grader knows. No em dashes. No hype.`;
  try {
    const out = await askJson<{ title: string; description: string; answer: string }>(prompt, SUGGEST_SCHEMA, { maxTokens: 800, effort: "low" });
    return cleanSuggest(r.keyword, out);
  } catch {
    return null;
  }
}

/** Run one audit and save it. */
export async function runOnpage(db: SupabaseClient, auditId: string) {
  const { data: row } = await db.from("onpage_audits").select("id, workspace_id, brand_id, url, keyword, charge, status").eq("id", auditId).maybeSingle();
  if (!row || row.status !== "running") return;
  const step = (s: string) => db.from("onpage_audits").update({ step: s }).eq("id", auditId);
  let charge = row.charge as (Charge & { pending?: boolean }) | null;
  if (charge?.pending) {
    const took = await take(row.workspace_id, "tasks", TASK_COST.onpage, { refundIfFree: false });
    if (!took.ok) {
      const why = ((await took.response.json().catch(() => ({}))) as { error?: string }).error ?? "No tasks left this month.";
      await db.from("onpage_audits").update({ status: "failed", error: why, charge: null, finished_at: new Date().toISOString() }).eq("id", auditId);
      return;
    }
    const pack = took.fromPack ?? 0;
    charge = took.period ? { period: took.period, plan: TASK_COST.onpage - pack, pack } : null;
    await db.from("onpage_audits").update({ charge }).eq("id", auditId);
  }
  try {
    const { data: brand } = await db.from("brands").select("profile").eq("id", row.brand_id).maybeSingle();
    const country = (brand?.profile as { country?: string } | null)?.country;
    await step("Reading the page");
    const blocked = await aiBlocked(row.url);
    const [page, g, speed] = await Promise.all([readUrl(row.url, blocked), (async () => { await step("Reading Google's top 10"); return googleTop10(row.keyword, country); })(), speedOf(row.url)]);
    if (!page) throw new Error("The page didn't load. Check the address, or try again in a few minutes.");
    await step("Reading the top pages");
    const self = pageKeyOf(page.url);
    const serp = await Promise.all(
      g.organic.map(async (o) => ({ rank: o.rank, url: o.url, domain: o.domain, title: o.title, read: pageKeyOf(o.url) === self ? page : await readUrl(o.url) })),
    );
    const scored = audit(row.keyword, page, serp, speed);
    await step("Writing suggestions");
    const result: OnpageResult = { ...scored, suggest: await suggest(scored, page) };
    const { error } = await db
      .from("onpage_audits")
      .update({ status: "done", step: "Done", score: result.score, top_score: result.topScore, result, error: null, finished_at: new Date().toISOString() })
      .eq("id", auditId);
    if (error) throw new Error(error.message);
  } catch (e) {
    await db.from("onpage_audits").update({ status: "failed", error: e instanceof Error ? e.message : String(e), finished_at: new Date().toISOString(), charge: null }).eq("id", auditId);
    const c = charge && !charge.pending ? charge : null;
    if (c) await db.rpc("give_back_tasks", { p_ws: row.workspace_id, p_period: c.period, p_plan_n: c.plan, p_pack_n: c.pack }).then(({ error }) => error && console.error("On-page audit refund failed:", error.message));
  }
}

/** The brand's pages that bring the most Google visits, each with the keyword that brings the most. */
export async function topPages(domain: string, country: string | undefined, limit = 30) {
  const spend = new Spend();
  const kws = await research("ranked", domain, marketOf(country), spend, 300);
  return { pages: mainKeywords(kws, limit), cost: spend.total };
}
