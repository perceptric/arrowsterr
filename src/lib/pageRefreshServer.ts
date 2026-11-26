import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { askJson } from "./claude";
import type { RefreshInfo } from "./contentPicks";
import { applyEdits } from "./draftEdits";
import { take } from "./entitlements";
import { ToolError } from "./mcp/protocol";
import { pageOutline } from "./pageText";
import { TASK_COST } from "./plans";
import { safeFetch } from "./safeFetch";
import { addDays, pagePath, planSections, type QueryAgg } from "./seoAnalytics";
import { googleFor, lastDay, pageQueriesIn } from "./seoAnalyticsServer";
import { outlineToDoc } from "./writer";

// Refresh the page (Visibility › Analytics, Docs: seo-analytics.md): read the live page, line its sections up with the
// page's Search Console searches now and 28 days before, keep the sections that still rank, and have Claude rewrite
// the ones that slipped, add sections for searches nothing answers, and write a new title and meta description when the
// click rate is weak. The result is a set of exact edits on a draft of the page, shown on Zippie's Revise card; nothing
// changes until the person presses Apply, and it goes live through the usual Publish panel. Uses TASK_COST.refresh.

export type RefreshDraft = { doc_id: string; title: string; edits: { find: string; replace: string; why?: string }[]; refresh: RefreshInfo };

type Ai = { edits: { find: string; replace: string; why: string }[]; add: { h2: string; paragraphs: string[]; why: string }[]; seo: { title: string; description: string; why: string } | null };
const SCHEMA = {
  type: "object",
  properties: {
    edits: { type: "array", items: { type: "object", properties: { find: { type: "string" }, replace: { type: "string" }, why: { type: "string" } }, required: ["find", "replace", "why"] } },
    add: { type: "array", items: { type: "object", properties: { h2: { type: "string" }, paragraphs: { type: "array", items: { type: "string" } }, why: { type: "string" } }, required: ["h2", "paragraphs", "why"] } },
    seo: { anyOf: [{ type: "null" }, { type: "object", properties: { title: { type: "string" }, description: { type: "string" }, why: { type: "string" } }, required: ["title", "description", "why"] }] },
  },
  required: ["edits", "add", "seo"],
};

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
const qline = (q: QueryAgg, before?: QueryAgg) => `- "${q.query}": position ${q.position.toFixed(1)}${before ? ` (was ${before.position.toFixed(1)})` : ""}, ${q.impressions} impressions, ${q.clicks} clicks, CTR ${pct(q.impressions ? q.clicks / q.impressions : 0)}`;

/** The draft and changes for a refresh of `url` (an address on the brand's site, or a path like /blog/x). */
export async function prepareRefresh(db: SupabaseClient, p: { ws: string; userId: string; brandId: string; url: string; itemId?: string | null }): Promise<RefreshDraft> {
  const g = await googleFor(db, p.brandId);
  if (!g) throw new ToolError("Brand not found.");
  const { brand, state } = g;
  const host = brand.domain.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  const url = /^https?:\/\//i.test(p.url) ? p.url.trim() : `https://${host}${p.url.startsWith("/") ? "" : "/"}${p.url.trim()}`;
  const page = pagePath(url);
  const { data: site } = await db.from("sites").select("id").eq("workspace_id", p.ws).eq("brand_id", brand.id).order("created_at").limit(1).maybeSingle();
  if (!site) throw new ToolError(`Set up ${brand.name}'s website in Research first, so the refresh has somewhere to save its draft.`);

  const live = await safeFetch(url, { timeout: 20_000, maxBytes: 3_000_000 });
  if (!live.ok || !live.body) throw new ToolError(`Couldn't read ${url} (${live.error ?? `status ${live.status}`}). Check the address is live and public.`);
  const outline = pageOutline(live.body);
  if (!outline.sections.length && !outline.intro.length) throw new ToolError(`${url} has no readable writing to refresh.`);

  // The page's searches over the last 28 days of data, and the 28 before.
  const to = lastDay(state);
  const [now, before] = brand.gsc_property && state?.gsc_to ? await Promise.all([pageQueriesIn(db, brand.id, page, addDays(to, -27), to), pageQueriesIn(db, brand.id, page, addDays(to, -55), addDays(to, -28))]) : [[], []];
  const sections = outline.sections.map((s) => ({ heading: s.heading, text: s.blocks.map((b) => b.text).join(" ") }));
  const plan = planSections(sections, now, before);
  const was = new Map(before.map((q) => [q.query, q]));

  // The Calendar piece for this page: the one passed, the one published at this address, or a new update piece.
  const { data: items } = await db.from("calendar_items").select("id, keyword, url, current_url").eq("workspace_id", p.ws).eq("site_id", site.id).limit(2000);
  const mine = ((items ?? []) as { id: string; keyword: string; url: string | null; current_url: string | null }[]).find((i) => (p.itemId ? i.id === p.itemId : [i.url, i.current_url].some((u) => u && pagePath(u) === page)));
  let itemId = mine?.id ?? null;
  if (!itemId) {
    const keyword = (now[0]?.query ?? outline.h1 ?? outline.title ?? page).slice(0, 200) || page;
    const { data: made, error } = await db
      .from("calendar_items")
      .upsert({ workspace_id: p.ws, site_id: site.id, keyword, secondary: [], action: "update", current_url: url, status: "review", source: "analytics", created_by: p.userId }, { onConflict: "site_id,keyword" })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    itemId = made.id as string;
  }

  // The draft: the piece's own when it has one, otherwise one made from the live page.
  type DocRow = { id: string; title: string | null; content: Record<string, unknown> };
  let doc = (await db.from("docs").select("id, title, content").eq("calendar_item_id", itemId).maybeSingle()).data as DocRow | null;
  if (!doc) {
    const made = await db
      .from("docs")
      .insert({ workspace_id: p.ws, site_id: site.id, calendar_item_id: itemId, title: outline.h1 || outline.title || page, content: outlineToDoc(outline), created_by: p.userId })
      .select("id, title, content")
      .single();
    if (made.error || !made.data) throw new Error(made.error?.message ?? "Couldn't save the draft.");
    doc = made.data as DocRow;
  }

  const took = await take(p.ws, "tasks", TASK_COST.refresh, { refundIfFree: false });
  if (!took.ok) throw new ToolError(((await took.response.json().catch(() => ({}))) as { error?: string }).error ?? "No tasks left this month. Add a task pack to refresh pages.");
  let ai: Ai;
  try {
    ai = await askJson<Ai>(refreshPrompt({ url, outline, plan, now, was }), SCHEMA, { maxTokens: 6000 });
  } catch (e) {
    await took.giveBack();
    throw e;
  }

  const edits = (ai.edits ?? []).slice(0, 15).map((e) => ({ find: String(e.find ?? "").slice(0, 2000), replace: String(e.replace ?? "").slice(0, 4000), why: String(e.why ?? "").slice(0, 200) }));
  const check = applyEdits(doc.content as Record<string, unknown>, edits);
  const add = (ai.add ?? []).slice(0, 4).map((a) => ({ h2: String(a.h2 ?? "").slice(0, 160), paragraphs: (a.paragraphs ?? []).map((x) => String(x).slice(0, 2000)).filter(Boolean).slice(0, 6), why: String(a.why ?? "").slice(0, 200) })).filter((a) => a.h2 && a.paragraphs.length);
  const seo = ai.seo && ai.seo.title ? { title: ai.seo.title.slice(0, 70), description: (ai.seo.description ?? "").slice(0, 170), why: (ai.seo.why ?? "").slice(0, 200) } : null;
  if (!check.applied.length && !add.length && !seo) {
    await took.giveBack();
    throw new ToolError(`Nothing to change on ${url}: it still ranks well for what it covers. Try again after the next Search Console sync, or ask for specific changes.`);
  }
  return {
    doc_id: doc.id as string,
    title: (doc.title as string) || page,
    edits: check.applied.map((i) => edits[i]),
    refresh: {
      item_id: itemId,
      url,
      keep: plan.sections.filter((s) => s.action === "keep" && s.queries.length).map((s) => s.heading),
      rewrite: plan.sections.filter((s) => s.action === "rewrite").map((s) => s.heading),
      add,
      seo,
    },
  };
}

function refreshPrompt(x: { url: string; outline: ReturnType<typeof pageOutline>; plan: ReturnType<typeof planSections>; now: QueryAgg[]; was: Map<string, QueryAgg> }): string {
  const { outline, plan } = x;
  const label = new Map(plan.sections.map((s) => [s.heading, s]));
  const body = [
    `# ${outline.h1 || outline.title}`,
    ...outline.intro.map((b) => b.text),
    ...outline.sections.flatMap((s) => {
      const p = label.get(s.heading);
      const tag = p ? `[${p.action.toUpperCase()}: ${p.why}]` : "[KEEP]";
      return [`${s.level === 2 ? "##" : "###"} ${s.heading} ${tag}`, ...s.blocks.map((b) => (b.type === "li" ? `- ${b.text}` : b.text))];
    }),
  ].join("\n\n");
  return `You refresh a live web page so it wins back Google clicks. Keep what still ranks; improve only what slipped.

Page: ${x.url}
Current SEO title: ${outline.title || "(none)"}
Current meta description: ${outline.description || "(none)"}

The page's Google searches over the last 28 days (from Search Console):
${x.now.slice(0, 40).map((q) => qline(q, x.was.get(q.query))).join("\n") || "- No Search Console data yet."}

Searches with impressions that no section answers (write a new section for each that fits the page):
${plan.add.map((q) => qline(q)).join("\n") || "- None."}

${plan.titleFix ? `Weak click rate: "${plan.titleFix.query}" sits at position ${plan.titleFix.position} but only ${pct(plan.titleFix.ctr)} click (usually ${pct(plan.titleFix.expected)}). Write a new SEO title (under 60 characters) and meta description (under 155) that make the click worth it.` : "The click rate is normal: return seo as null unless the title is missing or misleading."}

The page, each section tagged KEEP or REWRITE:
${body.slice(0, 40_000)}

Rules:
- edits: change only sentences inside REWRITE sections. Each "find" is one exact sentence copied character for character from the page above (no headings, no list dashes), so it appears once. "replace" is the improved sentence or short paragraph: answer the slipped searches directly, add the specific facts, steps or numbers a searcher wants, and keep the page's voice. Up to 12 edits.
- Never touch KEEP sections.
- add: one section per unanswered search that belongs on this page (skip ones that don't), each with an H2 phrased the way people search and 2 to 4 short paragraphs. Up to 4.
- Plain words, short sentences, second person. No hype words, no em dashes. Don't invent statistics, prices or quotes.
- Each why says in one short line which search it helps.`;
}
