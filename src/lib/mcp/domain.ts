import "server-only";
import { DAY, readCache, writeCache } from "../cache";
import { dfsReady } from "../dataforseo";
import { requireTrack, take } from "../entitlements";
import { domainHistory, domainOverview, parseTarget, rankedFor, Spend, type Market } from "../keywords";
import { TASK_COST } from "../plans";
import { marketOf, type DomainMonth, type DomainReport, type Keyword } from "../research";
import { PlanError, ToolError } from "./protocol";

// The domain_overview MCP tool: any website's size on Google and the keywords that bring it the most visits.
// It reads public web data, so a brand key may look up any site; it charges the key's workspace.

/** The most top keywords one call returns, and how many are fetched and saved for each site. */
export const MAX_KEYWORDS = 100;
export const DEFAULT_KEYWORDS = 25;

type Size = NonNullable<DomainReport["overview"]>;
type Ranked = { keywords: Keyword[]; overview: Size | null };

/** What lookupDomain needs from the outside world, so tests can fake every paid or saved piece. */
export type DomainDeps = {
  /** The plan's error when Organic Research is locked, or null. */
  locked: (ws: string) => Promise<string | null>;
  ready: () => boolean;
  take: (ws: string, n: number) => Promise<{ ok: true; giveBack: () => Promise<void> } | { ok: false; error: string; readOnly?: boolean }>;
  read: <T>(key: string) => Promise<T | undefined>;
  write: (key: string, data: unknown) => Promise<void>;
  overview: (host: string, m: Market, spend: Spend) => Promise<Size | null>;
  ranked: (host: string, m: Market, spend: Spend) => Promise<Ranked>;
  history: (host: string, m: Market, spend: Spend) => Promise<DomainMonth[]>;
};

const bodyOf = async (r: Response) => (await r.json()) as { error: string; readOnly?: boolean };

export const liveDeps: DomainDeps = {
  locked: async (ws) => {
    const r = await requireTrack(ws, "seo");
    return r ? (await bodyOf(r)).error : null;
  },
  ready: dfsReady,
  take: async (ws, n) => {
    const t = await take(ws, "tasks", n);
    if (t.ok) return { ok: true, giveBack: t.giveBack };
    const b = await bodyOf(t.response);
    return { ok: false, error: b.error, readOnly: Boolean(b.readOnly) };
  },
  read: (key) => readCache(key, 30 * DAY),
  write: writeCache,
  overview: domainOverview,
  ranked: (host, m, spend) => rankedFor({ scope: "domain", host, path: "" }, m, spend, MAX_KEYWORDS, "traffic"),
  history: domainHistory,
};

/** The bare domain in what someone typed (katalon.com, https://www.katalon.com/pricing), the way Domain Research reads it. Null when it is not a web address. */
export function cleanDomain(input: unknown): string | null {
  if (typeof input !== "string") return null;
  return parseTarget(input.slice(0, 300), "domain")?.host ?? null;
}

/** How many top keywords to return: default 25, 1 to 100. */
export const keywordLimit = (v: unknown) => Math.min(MAX_KEYWORDS, Math.max(1, Math.round(Number(v) || DEFAULT_KEYWORDS)));

/**
 * Saved results, 30 days and shared by every workspace. The size and the 12 months use the same keys as
 * Domain Research in the app, so a site looked up there is free here. The keywords are the 100 with the most visits.
 */
export const domainKeys = (m: Market, host: string) => ({
  overview: `dom:domain:ov:${m.location}:${m.language}:${host}`,
  history: `dom:domain:hist:${m.location}:${m.language}:${host}`,
  ranked: `dom:domain:kwetv:${m.location}:${m.language}:${host}`,
});

/** The keywords that bring a site the most visits, most first. */
export function topKeywords(keywords: Keyword[], limit: number) {
  return [...keywords]
    .sort((a, b) => (b.etv ?? 0) - (a.etv ?? 0) || (b.volume ?? 0) - (a.volume ?? 0))
    .slice(0, limit)
    .map((k) => ({ keyword: k.keyword, position: k.rank ?? null, volume: k.volume, difficulty: k.kd, traffic: Math.round(k.etv ?? 0), url: k.url ?? null, intent: k.intent }));
}

/** Rankings in each band, from the overview's running totals (top 3, top 10, top 20, top 100). */
export const positionBands = (s: Size) => ({ "1-3": s.top3, "4-10": s.top10 - s.top3, "11-20": s.top20 - s.top10, "21-100": s.top100 - s.top20 });

/**
 * A site's Google numbers for one country. Uses TASK_COST.domain tasks when anything has to be fetched,
 * and hands them back if the fetch fails. A saved result costs nothing.
 */
export async function lookupDomain(ws: string, host: string, country: string, limit: number, deps: DomainDeps = liveDeps) {
  const locked = await deps.locked(ws);
  if (locked) throw new PlanError(locked, "locked");
  const m = marketOf(country);
  const keys = domainKeys(m, host);
  let [overview, ranked, history] = await Promise.all([deps.read<Size | null>(keys.overview), deps.read<Ranked>(keys.ranked), deps.read<DomainMonth[]>(keys.history)]);
  const fresh = overview === undefined || ranked === undefined || history === undefined;
  if (fresh) {
    if (!deps.ready()) throw new Error("Keyword data is not set up on the server.");
    const took = await deps.take(ws, TASK_COST.domain);
    if (!took.ok) throw new PlanError(took.error, took.readOnly ? "read_only" : "limit");
    try {
      const spend = new Spend();
      const load = async <T>(have: T | undefined, key: string, get: () => Promise<T>): Promise<T> => {
        if (have !== undefined) return have;
        const data = await get();
        await deps.write(key, data);
        return data;
      };
      [overview, ranked, history] = await Promise.all([
        // Without the overview, the size comes from the ranked keywords call.
        load(overview, keys.overview, () => deps.overview(host, m, spend)).catch(() => null),
        load(ranked, keys.ranked, () => deps.ranked(host, m, spend)),
        // A missing history shouldn't sink the whole lookup.
        load(history, keys.history, () => deps.history(host, m, spend)).catch(() => [] as DomainMonth[]),
      ]);
    } catch (e) {
      await took.giveBack();
      throw e;
    }
  }
  const size = overview ?? ranked!.overview;
  if (!size || !size.keywords) throw new ToolError(`Google shows no rankings for ${host} in ${country} yet. Check the spelling, or try a brand in another country.`);
  return {
    domain: host,
    country,
    organicTraffic: size.traffic,
    rankedKeywords: size.keywords,
    positions: positionBands(size),
    newKeywords: size.newKw,
    lostKeywords: size.lostKw,
    history: (history ?? []).map((h) => ({ month: h.month, traffic: h.traffic, keywords: h.keywords })),
    topKeywords: topKeywords(ranked!.keywords, limit),
    tasksUsed: fresh ? TASK_COST.domain : 0,
  };
}
