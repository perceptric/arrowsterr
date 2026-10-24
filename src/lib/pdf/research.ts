// What each research page's PDF holds (docs/reports.md, section 32.3): Keyword Research, Domain Research and
// Competitive Analysis. Built from the same saved results and the same helpers the pages use. Pure: the server
// feeds it saved reports; tests feed it fixtures.
import { bare, nameFromDomain, splitShared, type Gap, type GapRow } from "../gap.ts";
import type { BrandStat } from "../metrics.ts";
import { kdWord, MARKETS, type DomainBulkRow, type DomainReport, type KeywordReport, type KwSummary } from "../research.ts";

/** The research pages with a PDF. They are download-only: schedules never send them. */
export type ResearchPage = "keywords" | "domain" | "gap";
export const RESEARCH_PAGES: ResearchPage[] = ["keywords", "domain", "gap"];
export const isResearchPage = (v: unknown): v is ResearchPage => RESEARCH_PAGES.includes(v as ResearchPage);

/** What a research PDF was made from, cleaned from a request. */
export type ResearchParams =
  | { tool: "keyword"; keyword: string; country: string; device: "desktop" | "mobile" }
  | { tool: "keyword-bulk"; bulk: string }
  | { tool: "domain"; domain: string; scope: "domain" | "subdomain" | "subfolder" | "url"; country: string }
  | { tool: "domain-bulk"; bulk: string }
  | { tool: "gap"; siteId: string; competitor: string; days: number };

const SCOPES = ["domain", "subdomain", "subfolder", "url"] as const;

/** Clean what a research page's Download PDF sends. null when nothing usable was sent. */
export function cleanResearch(page: ResearchPage, x: unknown): ResearchParams | null {
  const o = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
  const text = (v: unknown, max = 200) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, max) : "");
  const country = MARKETS[text(o.country)] ? text(o.country) : "United States";
  const bulk = text(o.bulk, 40);
  if ((page === "keywords" || page === "domain") && bulk) return /^[a-z0-9]{4,40}$/.test(bulk) ? { tool: page === "keywords" ? "keyword-bulk" : "domain-bulk", bulk } : null;
  if (page === "keywords") {
    const keyword = text(o.keyword, 80).toLowerCase();
    return keyword ? { tool: "keyword", keyword, country, device: o.device === "mobile" ? "mobile" : "desktop" } : null;
  }
  if (page === "domain") {
    const domain = text(o.domain);
    const scope = SCOPES.find((s) => s === o.scope) ?? "domain";
    return domain ? { tool: "domain", domain, scope, country } : null;
  }
  const siteId = text(o.siteId, 60);
  const competitor = text(o.competitor).toLowerCase();
  const days = Math.min(365, Math.max(1, Math.round(Number(o.days) || 30)));
  return siteId && competitor ? { tool: "gap", siteId, competitor, days } : null;
}

const byVolume = <T extends { volume: number | null }>(a: T, b: T) => (b.volume ?? -1) - (a.volume ?? -1);

// ─────────────── Keyword Research → "Keyword Report: [keyword]" ───────────────

export type KwRow = { keyword: string; volume: number | null; kd: number | null; intent: string | null; cpc: number | null };
const kwRow = (k: KwSummary): KwRow => ({ keyword: k.keyword, volume: k.volume, kd: k.kd, intent: k.intent, cpc: k.cpc });

export type KeywordPdf = {
  page: "keywords";
  keyword: string;
  country: string;
  device: "desktop" | "mobile";
  tiles: { volume: number | null; source: "ads" | "clickstream" | null; kd: number | null; kdWord: string | null; intent: string | null; cpc: number | null; trendChange: number | null } | null;
  trend: { month: string; volume: number }[];
  variations: { total: number; rows: KwRow[] };
  questions: { total: number; rows: KwRow[] };
  clusters: { name: string; volume: number; count: number; keywords: string[] }[];
  serp: {
    features: string[];
    aio: { shown: boolean; cites: { domain: string; url: string; title: string }[] };
    rows: { rank: number; title: string; url: string; domain: string; traffic: number | null; keywords: number | null; aiCited: boolean }[];
  } | null;
};

/** The change over the 12 months, as the Keyword Research page shows it. */
export function trendChange(trend: { volume: number }[]) {
  return trend.length > 1 && trend[0].volume ? Math.round(((trend[trend.length - 1].volume - trend[0].volume) / trend[0].volume) * 100) : null;
}

export function keywordPdf(r: KeywordReport): KeywordPdf {
  const o = r.overview;
  return {
    page: "keywords",
    keyword: r.keyword,
    country: r.country,
    device: r.device,
    tiles: o ? { volume: o.volume, source: o.source ?? null, kd: o.kd, kdWord: o.kd === null ? null : kdWord(o.kd), intent: o.intent, cpc: o.cpc, trendChange: trendChange(o.trend) } : null,
    trend: o?.trend ?? [],
    variations: { total: r.variations.total, rows: r.variations.rows.slice(0, 20).map(kwRow) },
    questions: { total: r.questions.total, rows: r.questions.rows.slice(0, 20).map(kwRow) },
    clusters: r.clusters.map((c) => ({ ...c, keywords: c.keywords.slice(0, 8) })),
    serp: r.serp
      ? {
          features: r.serp.features,
          aio: { shown: r.serp.aio.shown, cites: r.serp.aio.cites.slice(0, 10) },
          rows: r.serp.rows.slice(0, 10).map((x) => ({ rank: x.rank, title: x.title, url: x.url, domain: x.domain, traffic: x.traffic, keywords: x.keywords, aiCited: x.aiCited })),
        }
      : null,
  };
}

export type KeywordBulkPdf = {
  page: "keywords-bulk";
  country: string;
  tiles: { keywords: number; found: number; volume: number; avgKd: number | null };
  rows: (KwRow & { trendChange: number | null })[];
};

/** A bulk run: totals and every keyword in one table, biggest first. */
export function keywordBulkPdf(rows: KwSummary[], country: string): KeywordBulkPdf {
  const found = rows.filter((r) => r.volume !== null);
  const kds = rows.filter((r) => r.kd !== null);
  return {
    page: "keywords-bulk",
    country,
    tiles: {
      keywords: rows.length,
      found: found.length,
      volume: found.reduce((n, r) => n + (r.volume ?? 0), 0),
      avgKd: kds.length ? Math.round(kds.reduce((n, r) => n + (r.kd ?? 0), 0) / kds.length) : null,
    },
    rows: [...rows].sort(byVolume).map((r) => ({ ...kwRow(r), trendChange: trendChange(r.trend) })),
  };
}

// ─────────────── Domain Research → "Domain Report: [domain]" ───────────────

export type DomainPdf = {
  page: "domain";
  domain: string;
  scope: "domain" | "subdomain" | "subfolder" | "url";
  country: string;
  tiles: DomainReport["overview"];
  keywords: { keyword: string; rank: number | null; volume: number | null; kd: number | null; traffic: number | null; url: string | null }[];
  pages: DomainReport["pages"];
  competitors: DomainReport["competitors"];
};

export function domainPdf(r: DomainReport): DomainPdf {
  const keywords = [...r.keywords].sort((a, b) => (b.etv ?? 0) - (a.etv ?? 0) || (b.volume ?? 0) - (a.volume ?? 0));
  return {
    page: "domain",
    domain: r.domain,
    scope: r.scope ?? "domain",
    country: r.country,
    tiles: r.overview,
    keywords: keywords.slice(0, 50).map((k) => ({ keyword: k.keyword, rank: k.rank ?? null, volume: k.volume, kd: k.kd, traffic: k.etv ?? null, url: k.url ?? null })),
    pages: r.pages.slice(0, 20),
    competitors: r.competitors.slice(0, 10),
  };
}

export type DomainBulkPdf = {
  page: "domain-bulk";
  country: string;
  tiles: { sites: number; keywords: number; traffic: number; value: number };
  rows: DomainBulkRow[];
};

/** A bulk run of sites: totals and every site in one table, most visits first. */
export function domainBulkPdf(rows: DomainBulkRow[], country: string): DomainBulkPdf {
  const sum = (f: (r: DomainBulkRow) => number | null) => rows.reduce((n, r) => n + (f(r) ?? 0), 0);
  return {
    page: "domain-bulk",
    country,
    tiles: { sites: rows.length, keywords: sum((r) => r.keywords), traffic: sum((r) => r.traffic), value: sum((r) => r.value) },
    rows: [...rows].sort((a, b) => (b.traffic ?? -1) - (a.traffic ?? -1)),
  };
}

// ─────────────── Competitive Analysis → "Keyword Gap: [you] vs [them]" ───────────────

export type GapPdf = {
  page: "gap";
  you: { name: string; domain: string };
  them: { name: string; domain: string };
  country: string;
  counts: { missing: number; shared: number; only: number; weaker: number; lead: number };
  rivals: { name: string; domain: string; visibility: number; position: number | null }[];
  opportunities: GapRow[];
  theyLead: GapRow[];
  youLead: GapRow[];
};

/**
 * The keyword gap, as Competitive Analysis counts it: the API's totals for the three circles, and the shared
 * keywords split by who ranks higher. Rivals are the brands AI names most that have a website (stats come from
 * the page's own answers).
 */
export function gapPdf(gap: Gap, you: { name: string; domain: string }, themDomain: string, stats: BrandStat[], country: string): GapPdf {
  const { weaker, lead } = splitShared(gap.shared);
  const themName = stats.find((s) => s.domain && bare(s.domain) === bare(themDomain))?.name ?? nameFromDomain(themDomain);
  return {
    page: "gap",
    you,
    them: { name: themName, domain: themDomain },
    country,
    counts: { missing: gap.totals.missing, shared: gap.totals.shared, only: gap.totals.only, weaker: weaker.length, lead: lead.length },
    rivals: stats
      .filter((s) => !s.isYou && s.domain && bare(s.domain) !== bare(you.domain))
      .slice(0, 8)
      .map((s) => ({ name: s.name, domain: bare(s.domain), visibility: s.visibility, position: s.position })),
    opportunities: [...gap.missing].sort(byVolume).slice(0, 50),
    theyLead: [...weaker].sort(byVolume).slice(0, 25),
    youLead: [...lead].sort(byVolume).slice(0, 25),
  };
}

export type ResearchPdf = KeywordPdf | KeywordBulkPdf | DomainPdf | DomainBulkPdf | GapPdf;

/** The PDF's title, from what it holds. */
export function researchTitle(d: ResearchPdf): string {
  const cut = (s: string) => (s.length > 100 ? `${s.slice(0, 99)}…` : s);
  if (d.page === "keywords") return cut(`Keyword Report: ${d.keyword}`);
  if (d.page === "keywords-bulk") return `Keyword Report: ${d.tiles.keywords.toLocaleString("en-US")} keywords`;
  if (d.page === "domain") return cut(`Domain Report: ${d.domain}`);
  if (d.page === "domain-bulk") return `Domain Report: ${d.tiles.sites.toLocaleString("en-US")} sites`;
  return cut(`Keyword Gap: ${d.you.name} vs ${d.them.name}`);
}
