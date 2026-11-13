import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cleanMentions } from "./brandNames";
import type { Chat } from "./chats";
import { askJson } from "./claude";
import {
  buildClusters,
  chanceOf,
  cleanLink,
  clusterName,
  findGaps,
  gapReason,
  gapStage,
  levelOf,
  matchClusters,
  median,
  noisyLinks,
  overlap,
  samePlanKeyword,
  scoreOf,
  wordsOf,
  type AnswerRow,
  type ClusterPage,
  type Level,
} from "./clusters";
import type { Profile } from "./db";
import { overview, type Market, type Spend } from "./keywords";
import type { AgentGroup, AgentKeyword, AgentUpdate, Keyword, Stage } from "./research";

// Opportunities on the server (docs/content-v3-backend.md, section 2): topics from AI answers that name competitors,
// clusters with a pillar and a name, a score for every page, and saving it all as ideas on the plan.

const HAIKU = () => process.env.EXTRACT_MODEL || "claude-haiku-5-5";
const GAP_DAYS = 30;
const MAX_GAPS = 12; // AI-answer topics added to one plan at most
const MIN_GAP_VOLUME = 50; // a gap phrase with fewer searches stays an AI-only row
const norm = (k: string) => k.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();

export type GapInfo = { engine: string; competitors: string[]; prompt: string };
export type GapKeyword = AgentKeyword & { gap: GapInfo };

/** The site's brand, its name and its competitors' names, for reading AI answers. */
async function brandOf(db: SupabaseClient, siteId: string): Promise<{ id: string; name: string; competitors: string[] } | null> {
  const { data: site } = await db.from("sites").select("brand_id").eq("id", siteId).maybeSingle();
  if (!site?.brand_id) return null;
  const { data: b } = await db.from("brands").select("id, name, profile").eq("id", site.brand_id).maybeSingle();
  if (!b) return null;
  const competitors = ((b.profile as Profile | null)?.competitors ?? []).map((c) => c.name).filter(Boolean);
  return { id: b.id, name: b.name, competitors };
}

/** Each tracked answer in the last 30 days as engine, prompt, names in it and whether the brand is named. */
async function answerRows(db: SupabaseClient, brand: { id: string; name: string; competitors: string[] }): Promise<{ rows: AnswerRow[]; competitors: string[] }> {
  const since = new Date(Date.now() - GAP_DAYS * 864e5).toISOString();
  const { data } = await db.from("runs").select("chats").eq("brand_id", brand.id).gte("at", since).order("at", { ascending: false }).limit(400);
  const own = brand.name.toLowerCase();
  const rows: AnswerRow[] = [];
  const seen = new Map<string, number>();
  for (const r of data ?? []) {
    for (const c of (r.chats as Chat[] | null) ?? []) {
      if (c.error || !c.brands) continue;
      const names = cleanMentions(c.brands, brand.competitors).map((b) => b.name);
      rows.push({ engine: c.engine, prompt: c.prompt, names, brandNamed: names.some((n) => n.toLowerCase() === own) });
      for (const n of names) if (n.toLowerCase() !== own) seen.set(n, (seen.get(n) ?? 0) + 1);
    }
  }
  // Without a competitor list, every other brand the answers name counts.
  const competitors = brand.competitors.length ? brand.competitors : [...seen.keys()];
  return { rows, competitors };
}

/**
 * Topics from AI answers that name competitors and leave out the brand (section 2.2). Each prompt becomes a search
 * keyword: Claude Haiku writes 3 short searches and the one with the most volume wins. A gap that matches a plan
 * keyword marks that keyword instead of adding a new one.
 */
export async function aiGaps(
  db: SupabaseClient,
  siteId: string,
  plan: AgentKeyword[],
  serps: Map<string, string[]>,
  themes: string[],
  m: Market,
  spend: Spend,
  topUrls: (k: string) => Promise<string[]>,
): Promise<{ added: GapKeyword[]; marked: Map<string, GapInfo> }> {
  const empty = { added: [] as GapKeyword[], marked: new Map<string, GapInfo>() };
  const brand = await brandOf(db, siteId);
  if (!brand) return empty;
  const { rows, competitors } = await answerRows(db, brand);
  const gaps = findGaps(rows, competitors).slice(0, MAX_GAPS);
  if (!gaps.length) return empty;

  type Reply = { items: { prompt: string; searches: string[] }[] };
  const reply = await askJson<Reply>(
    `Each line is a question people ask AI assistants. For each one, write 3 short Google searches (2 to 6 words, lowercase) a person would type to find the same answer. Keep product and category words; drop brand names.\n\n${gaps.map((g) => g.prompt).join("\n")}`,
    {
      type: "object",
      properties: { items: { type: "array", items: { type: "object", properties: { prompt: { type: "string" }, searches: { type: "array", items: { type: "string" } } }, required: ["prompt", "searches"], additionalProperties: false } } },
      required: ["items"],
      additionalProperties: false,
    },
    { model: HAIKU(), maxTokens: 3000, effort: "low" },
  ).catch(() => ({ items: [] }) as Reply);
  const phrases = new Map(reply.items.map((i) => [i.prompt.trim(), i.searches.map(norm).filter((s) => s && s.split(" ").length <= 8).slice(0, 3)]));
  const all = [...new Set([...phrases.values()].flat())];
  const vol = all.length ? await overview(all, m, spend).catch(() => new Map<string, Keyword>()) : new Map<string, Keyword>();

  const added: GapKeyword[] = [];
  const marked = new Map<string, GapInfo>();
  const planLinks = plan.map((k) => ({ keyword: k.keyword, links: serps.get(k.keyword) ?? [] }));
  for (const g of gaps) {
    const list = phrases.get(g.prompt) ?? [];
    if (!list.length) continue;
    const best = [...list].sort((a, b) => (vol.get(b)?.volume ?? 0) - (vol.get(a)?.volume ?? 0) || (a < b ? -1 : 1))[0];
    const data = vol.get(best);
    const info: GapInfo = { engine: g.engine, competitors: g.competitors, prompt: g.prompt };
    const links = (await topUrls(best).catch(() => [])) ?? [];
    const same = planLinks.find((p) => samePlanKeyword({ keyword: best, links }, p));
    if (same) {
      if (!marked.has(same.keyword)) marked.set(same.keyword, info);
      continue;
    }
    if (added.some((a) => samePlanKeyword({ keyword: best, links }, { keyword: a.keyword, links: serps.get(a.keyword) ?? [] }))) continue;
    serps.set(best, links);
    const words = wordsOf(best);
    const theme = [...themes].sort((a, b) => themeFit(words, b, plan) - themeFit(words, a, plan) || (a < b ? -1 : 1))[0] ?? "AI answers";
    const enough = (data?.volume ?? 0) >= MIN_GAP_VOLUME;
    added.push({
      keyword: best,
      volume: enough ? data!.volume : null,
      kd: data?.kd ?? null,
      cpc: data?.cpc ?? null,
      intent: data?.intent ?? null,
      trend: data?.trend ?? [],
      serp: [],
      stage: gapStage(best),
      theme,
      group: -1,
      lowData: !enough,
      gap: info,
    });
  }
  return { added, marked };
}

/** How well a keyword's words fit a theme: the word overlap with that theme's plan keywords. */
function themeFit(words: string[], theme: string, plan: AgentKeyword[]): number {
  return overlap(words, plan.filter((k) => k.theme === theme).flatMap((k) => wordsOf(k.keyword)));
}

export type OppPage = {
  keyword: string;
  others: string[];
  stage: Stage;
  theme: string;
  volume: number | null;
  kd: number | null;
  cpc: number | null;
  intent: string | null;
  action: "new" | "update";
  url: string | null;
  rank: number | null;
  score: number;
  chance: number;
  level: Level;
  reason: string;
  engine: string | null;
  prompt: string | null;
};
export type OppCluster = { name: string; theme: string; pillar: string; pages: string[]; score: number; updates: boolean };
export type Opportunities = { clusters: OppCluster[]; pages: OppPage[] };

/**
 * Clusters, names and scores for a finished plan (sections 2.3 to 2.7). Pages are the plan's groups and its
 * update pages; links are cleaned and links in most results dropped before anything is joined.
 */
export async function buildOpportunities(p: {
  domain: string;
  keywords: AgentKeyword[];
  groups: AgentGroup[];
  updates: AgentUpdate[];
  serps: Map<string, string[]>;
  ranks: Map<string, number>;
  marked: Map<string, GapInfo>;
}): Promise<Opportunities> {
  const cleaned = new Map([...p.serps].map(([k, l]) => [k, l.map((u) => cleanLink(u, p.domain)).filter((u): u is string => Boolean(u))]));
  const noise = noisyLinks([...cleaned.values()]);
  const links = (k: string) => (cleaned.get(k) ?? []).filter((u) => !noise.has(u));
  const siteOf = (u: string) => {
    try {
      const h = new URL(/^https?:/.test(u) ? u : `https://${u}`).hostname.toLowerCase().replace(/^www\./, "");
      return /(^|\.)google\./.test(h) || h === p.domain.replace(/^www\./, "") ? "" : h;
    } catch {
      return "";
    }
  };
  const sites = (k: string) => (p.serps.get(k) ?? []).map(siteOf).filter(Boolean);

  const byKw = new Map(p.keywords.map((k) => [k.keyword, k]));
  const pages: OppPage[] = [];
  const clusterPages: ClusterPage[] = [];
  for (const g of p.groups) {
    const ks = g.keywords.map((k) => byKw.get(k)).filter((k): k is AgentKeyword => Boolean(k));
    const main = byKw.get(g.primary) ?? ks[0];
    if (!main) continue;
    const gap = (ks.map((k) => (k as Partial<GapKeyword>).gap).find(Boolean) ?? ks.map((k) => p.marked.get(k.keyword)).find(Boolean)) as GapInfo | undefined;
    const rank = p.ranks.get(norm(g.primary)) ?? null;
    const rival = ks.find((k) => k.competitor)?.competitor ?? null;
    const aiOnly = ks.every((k) => k.volume === null && (k as Partial<GapKeyword>).gap);
    pages.push({
      keyword: g.primary,
      others: g.keywords.filter((k) => k !== g.primary),
      stage: g.stage,
      theme: g.theme,
      volume: aiOnly ? null : g.volume,
      kd: main.kd,
      cpc: main.cpc,
      intent: main.intent,
      action: "new",
      url: null,
      rank,
      score: 0,
      chance: chanceOf(main.kd, rank),
      level: "medium",
      reason: gap ? gapReason(gap.engine, gap.competitors) : rank && rank <= 20 ? `You rank ${rank}` : rival ? `${rival} ranks for it` : "You don't rank yet",
      engine: gap?.engine ?? null,
      prompt: gap?.prompt ?? null,
    });
    clusterPages.push({ key: g.primary, keywords: g.keywords, theme: g.theme, volume: g.volume, links: [...new Set(g.keywords.flatMap(links))], domains: [...new Set(g.keywords.flatMap(sites))] });
  }
  for (const u of p.updates) {
    if (pages.some((x) => x.keyword === u.keyword)) continue;
    const rank = u.rank ?? null;
    const gap = p.marked.get(u.keyword);
    pages.push({
      keyword: u.keyword,
      others: [],
      stage: u.stage,
      theme: u.theme,
      volume: u.volume,
      kd: u.kd,
      cpc: u.cpc,
      intent: u.intent,
      action: "update",
      url: u.page,
      rank,
      score: 0,
      chance: chanceOf(u.kd, rank),
      level: "medium",
      reason: gap ? gapReason(gap.engine, gap.competitors) : rank ? `Your page ranks ${rank}` : "Your page isn't in the top 100",
      engine: gap?.engine ?? null,
      prompt: gap?.prompt ?? null,
    });
    clusterPages.push({ key: u.keyword, keywords: [u.keyword], theme: u.theme, volume: u.volume ?? 0, update: true, links: links(u.keyword), domains: sites(u.keyword) });
  }

  // Scores and levels.
  const mid = median(pages.map((x) => x.volume).filter((v): v is number => v !== null));
  for (const x of pages) x.score = scoreOf({ volume: x.volume, stage: x.stage, kd: x.kd, rank: x.rank, gap: Boolean(x.engine), update: x.action === "update" }, mid);
  const all = pages.map((x) => x.score);
  for (const x of pages) x.level = levelOf(x.score, all, x.chance);

  // Clusters, then their names: one Haiku call for all of them, each name checked against the cluster's words.
  const built = buildClusters(clusterPages);
  const scoreOfPage = new Map(pages.map((x) => [x.keyword, x.score]));
  const named = built.filter((c) => c.pages.length > 1 && !c.updates);
  type Names = { names: { id: number; name: string }[] };
  const reply = named.length
    ? await askJson<Names>(
        `Name each group of search keywords in 2 to 4 words. Use only words that appear in that group's keywords. Write it like a topic, first letter in capitals, no quotes.\n\n${named.map((c, i) => `${i}: ${c.pages.join(" | ")}`).join("\n")}`,
        {
          type: "object",
          properties: { names: { type: "array", items: { type: "object", properties: { id: { type: "integer" }, name: { type: "string" } }, required: ["id", "name"], additionalProperties: false } } },
          required: ["names"],
          additionalProperties: false,
        },
        { model: HAIKU(), maxTokens: 1500, effort: "low" },
      ).catch(() => ({ names: [] }) as Names)
    : { names: [] };
  const suggested = new Map(reply.names.map((n) => [n.id, n.name]));
  const clusters: OppCluster[] = built.map((c) => {
    const i = named.indexOf(c);
    const kws = c.pages.flatMap((k) => [k, ...(pages.find((x) => x.keyword === k)?.others ?? [])]);
    return {
      name: c.updates ? c.theme : clusterName(i >= 0 ? suggested.get(i) : null, c.pillar, kws),
      theme: c.theme,
      pillar: c.pillar,
      pages: c.pages,
      score: Math.round(c.pages.reduce((n, k) => n + (scoreOfPage.get(k) ?? 0), 0) * 10) / 10,
      updates: Boolean(c.updates),
    };
  });
  clusters.sort((a, b) => Number(a.updates) - Number(b.updates) || b.score - a.score || (a.name < b.name ? -1 : 1));
  return { clusters, pages };
}

/**
 * Save a plan's opportunities (section 2.8): clusters keep their id when half their keywords match an older one,
 * and rows keep what people did with them (dates, drafts, dismissals). A dismissed row comes back only when its
 * score has doubled.
 */
export async function saveOpportunities(db: SupabaseClient, p: { workspaceId: string; siteId: string; runId: string; opp: Opportunities; source: (page: OppPage) => string }) {
  const { data: oldRows, error: e1 } = await db.from("content_clusters").select("id, keywords").eq("site_id", p.siteId).is("archived_at", null);
  if (e1) throw new Error(e1.message);
  const old = (oldRows ?? []) as { id: string; keywords: string[] }[];
  const match = matchClusters(old, p.opp.clusters.map((c) => ({ keywords: c.pages })));
  const now = new Date().toISOString();
  const idOf = new Map<string, string>(); // page keyword to cluster id
  for (const [i, c] of p.opp.clusters.entries()) {
    const row = { name: c.name, theme: c.theme, pillar: c.pillar, keywords: c.pages, score: c.score, position: i, updates: c.updates, run_id: p.runId, archived_at: null, updated_at: now };
    let id = match.get(i);
    if (id) {
      const { error } = await db.from("content_clusters").update(row).eq("id", id);
      if (error) throw new Error(error.message);
    } else {
      const { data, error } = await db.from("content_clusters").insert({ ...row, workspace_id: p.workspaceId, site_id: p.siteId }).select("id").single();
      if (error || !data) throw new Error(error?.message ?? "Could not save a cluster.");
      id = data.id as string;
    }
    for (const k of c.pages) idOf.set(k, id);
  }

  const pillars = new Set(p.opp.clusters.map((c) => c.pillar));
  const keywords = p.opp.pages.map((x) => x.keyword);
  const existing = new Map<string, { id: string; score: number | null; dismissed_at: string | null }>();
  for (let i = 0; i < keywords.length; i += 200) {
    const { data, error } = await db.from("calendar_items").select("id, keyword, score, dismissed_at").eq("site_id", p.siteId).in("keyword", keywords.slice(i, i + 200));
    if (error) throw new Error(error.message);
    for (const r of data ?? []) existing.set(r.keyword as string, { id: r.id as string, score: r.score as number | null, dismissed_at: r.dismissed_at as string | null });
  }
  const plan = (x: OppPage) => ({
    secondary: x.others,
    stage: x.stage,
    theme: x.theme,
    volume: x.volume,
    difficulty: x.kd,
    intent: x.intent,
    cpc: x.cpc,
    current_rank: x.rank,
    cluster_id: idOf.get(x.keyword) ?? null,
    cluster_role: pillars.has(x.keyword) ? "pillar" : "page",
    score: x.score,
    chance: x.chance,
    level: x.level,
    reason: x.reason,
    reason_engine: x.engine,
    ai_prompt: x.prompt,
  });
  const fresh = p.opp.pages
    .filter((x) => !existing.has(x.keyword))
    .map((x) => ({ ...plan(x), workspace_id: p.workspaceId, site_id: p.siteId, keyword: x.keyword, source: p.source(x), action: x.action, current_url: x.url, due_date: null }));
  for (let i = 0; i < fresh.length; i += 200) {
    const { error } = await db.from("calendar_items").upsert(fresh.slice(i, i + 200), { onConflict: "site_id,keyword", ignoreDuplicates: true });
    if (error) throw new Error(error.message);
  }
  const updates = p.opp.pages.filter((x) => existing.has(x.keyword));
  for (let i = 0; i < updates.length; i += 8) {
    await Promise.all(
      updates.slice(i, i + 8).map(async (x) => {
        const was = existing.get(x.keyword)!;
        const back = was.dismissed_at && was.score && x.score >= was.score * 2 ? { dismissed_at: null } : {};
        const { error } = await db.from("calendar_items").update({ ...plan(x), ...back }).eq("id", was.id);
        if (error) throw new Error(error.message);
      }),
    );
  }

  // Old clusters no row points to anymore are archived.
  const left = old.filter((o) => ![...match.values()].includes(o.id));
  for (const o of left) {
    const { count } = await db.from("calendar_items").select("id", { count: "exact", head: true }).eq("cluster_id", o.id);
    if (!count) await db.from("content_clusters").update({ archived_at: now }).eq("id", o.id);
  }
}
