import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cleanSources } from "./sources";
import { DAY, readCache, writeCache } from "./cache";
import { call } from "./dataforseo";
import { andAll, authorityBands, brokenPages, citedDetail, citedDomains, linksQuery, parseAnchors, parseBulk, parseGap, parseHistory, parseLinks, parsePages, parseProfile, parseRefDomains, parseSummary, parseWeeks, type BlTarget, type BrokenPage, type BulkRow, type GapRow, type LinkExtra, type LinkKind, type LinkRow, type Month, type Overview, type RefDomain } from "./backlinks";

// DataForSEO Backlinks calls for the Backlinks screen (docs/backlinks.md). Every answer is kept 7 days in keyword_cache,
// so opening the page again, or a teammate opening it, costs nothing. Price: $0.024 a request plus $0.000036 a row.

export const KEEP = 7 * DAY;
const SCALE = { rank_scale: "one_hundred" } as const;

async function task(path: string, body: Record<string, unknown>) {
  const [t] = await call(`backlinks/${path}/live`, [body]);
  if (t?.status_code !== 20000) throw new Error(`DataForSEO: ${t?.status_message ?? "no result"}`);
  return (t.result?.[0] ?? {}) as Record<string, unknown> & { items?: unknown[] };
}

export const keys = {
  // v3 adds the profile, monthly history and authority bands; older saved overviews load fresh once.
  overview: (target: string) => `bl:ov3:${target}`,
  domains: (target: string) => `bl:rd:${target}`,
  links: (target: string, kind: LinkKind, page: number, extra: LinkExtra = {}) => `bl:links:${kind}:${page}:${extra.article ? "a:" : ""}${extra.anchor ? `q=${extra.anchor.toLowerCase().trim()}:` : ""}${target}`,
  broken: (target: string) => `bl:broken:${target}`,
  history: (target: string) => `bl:hist:${target}`,
  ai: (target: string, cited: string[], rivals: string[]) => `bl:ai:${target}:${[...rivals].sort().join(",")}:${hash(cited.join(","))}`,
  near: (site: string) => `bl:near:${site}`,
  gap: (target: string, rivals: string[]) => `bl:gap2:${target}:${[...rivals].sort().join(",")}`,
  bulk: (targets: string[]) => `bl:bulk:${[...targets].sort().join(",")}`,
};

/** A short stable hash for long cache keys. */
function hash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/** The first day of the month a year ago, for monthly history. */
const yearAgo = () => {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - 12);
  return d.toISOString().slice(0, 10);
};

/** The target part of every request: a domain counts its subdomains; a subdomain or a page stands alone. */
const aim = (t: BlTarget) => (t.scope === "domain" ? { target: t.target, include_subdomains: true } : t.scope === "subdomain" ? { target: t.target, include_subdomains: false } : { target: t.target });

/** Read a saved answer, with when it was saved. */
export async function saved<T>(key: string): Promise<T | undefined> {
  return readCache<T>(key, KEEP);
}

export async function loadOverview(t: BlTarget): Promise<Overview & { at: string }> {
  const from = new Date(Date.now() - 13 * 7 * DAY).toISOString().slice(0, 10);
  const base = { ...aim(t), ...SCALE };
  const page = t.scope === "url";
  const none = Promise.resolve({ items: [] as unknown[] });
  let partial = false;
  // The summary must answer. The charts, anchors, pages and linking sites may fail on their own; then the page shows
  // what came back and nothing is saved, so the next open tries again instead of showing gaps for a week.
  const soft = (p: Promise<{ items?: unknown[] }>) =>
    p.catch(() => {
      partial = true;
      return { items: [] as unknown[] };
    });
  const [summary, weeks, months, anchors, pages, domains] = await Promise.all([
    // internal_list_limit brings back the link types, endings, site types and places with the totals, at no extra cost.
    task("summary", { ...base, backlinks_status_type: "live", internal_list_limit: 20 }),
    // One page has no weekly or monthly history or pages of its own to list.
    page ? none : soft(task("timeseries_new_lost_summary", { ...aim(t), date_from: from, group_range: "week" })),
    page ? none : soft(task("timeseries_summary", { target: t.target, date_from: yearAgo(), group_range: "month" })),
    soft(task("anchors", { ...base, limit: 100, order_by: ["referring_domains,desc"] })),
    page ? none : soft(task("domain_pages_summary", { ...base, limit: 100, order_by: ["referring_domains,desc"] })),
    // The 1,000 strongest linking sites: the authority chart here, and the Referring domains, Toxic links and Network tabs.
    soft(task("referring_domains", { ...base, backlinks_status_type: "live", limit: 1000, order_by: ["rank,desc"] })),
  ]);
  const s = parseSummary(summary);
  const list = parseRefDomains(domains.items);
  const at = new Date().toISOString();
  const out = {
    target: t.label,
    summary: s,
    weeks: parseWeeks(weeks.items),
    anchors: s ? parseAnchors(anchors.items, s.domains, 100) : [],
    pages: s ? parsePages(pages.items, 100) : [],
    profile: parseProfile(summary),
    history: parseHistory(months.items),
    bands: authorityBands(list),
    listed: list.length,
    at,
  };
  if (!partial) await Promise.all([writeCache(keys.overview(t.id), out), writeCache(keys.domains(t.id), { rows: list, at })]);
  return out;
}

/** The 1,000 strongest sites linking to a target, saved with the overview, or asked for on their own. */
export async function loadDomains(t: BlTarget): Promise<{ rows: RefDomain[]; at: string }> {
  const r = await task("referring_domains", { ...aim(t), ...SCALE, backlinks_status_type: "live", limit: 1000, order_by: ["rank,desc"] });
  const out = { rows: parseRefDomains(r.items), at: new Date().toISOString() };
  await writeCache(keys.domains(t.id), out);
  return out;
}

/** Links to the target's pages that are gone, grouped by page, each with a live page to send it to. */
export async function loadBroken(t: BlTarget, live: string[]): Promise<{ pages: BrokenPage[]; total: number; at: string }> {
  const r = await task("backlinks", { ...aim(t), ...SCALE, backlinks_status_type: "live", mode: "as_is", filters: ["is_broken", "=", true], order_by: ["domain_from_rank,desc"], limit: 500 });
  const out = { pages: brokenPages(r.items, live), total: Number(r.total_count ?? 0), at: new Date().toISOString() };
  await writeCache(keys.broken(t.id), out);
  return out;
}

/** Linking sites, backlinks and authority per month for the last year. Shared by every workspace that asks. */
export async function loadHistory(target: string): Promise<{ months: Month[]; at: string }> {
  const r = await task("timeseries_summary", { target, date_from: yearAgo(), group_range: "month" });
  const out = { months: parseHistory(r.items), at: new Date().toISOString() };
  await writeCache(keys.history(target), out);
  return out;
}

/** The strongest sites linking to one site: the second ring of the Network tab. */
export async function loadNear(site: string): Promise<{ rows: RefDomain[]; at: string }> {
  const r = await task("referring_domains", { target: site, include_subdomains: true, ...SCALE, backlinks_status_type: "live", limit: 40, order_by: ["rank,desc"], filters: ["rank", ">=", 40] });
  const out = { rows: parseRefDomains(r.items), at: new Date().toISOString() };
  await writeCache(keys.near(site), out);
  return out;
}

/** Of a list of sites, the ones that link to a target. One request, the list passed as a filter. */
async function linkingFrom(target: string, includeSub: boolean, sites: string[]): Promise<string[]> {
  if (!sites.length) return [];
  const list = [...new Set(sites.flatMap((d) => [d, `www.${d}`]))].slice(0, 1000);
  const r = await task("referring_domains", { target, include_subdomains: includeSub, backlinks_status_type: "live", limit: 1000, filters: andAll([["domain", "in", list]]) });
  return parseRefDomains(r.items).map((x) => x.domain);
}

/**
 * The sites AI answers cite for the brand, with which of them link to the target and to each competitor, and their
 * authority: one request for the target, one per competitor and one bulk authority request.
 */
export async function loadAi(t: BlTarget, cited: { domain: string; cites: number; engines: string[] }[], rivals: string[]) {
  const sites = cited.map((c) => c.domain);
  const own = t.scope === "url" ? t.host.replace(/^www\./, "") : t.target;
  const [mine, ranks, ...theirs] = await Promise.all([
    linkingFrom(own, t.scope !== "subdomain", sites),
    sites.length ? task("bulk_ranks", { targets: sites, ...SCALE }) : Promise.resolve({ items: [] as unknown[] }),
    ...rivals.map((r) => linkingFrom(r, true, sites)),
  ]);
  const rankOf: Record<string, number> = {};
  for (const i of (ranks.items ?? []) as { target?: string; rank?: number }[]) if (i.target) rankOf[i.target.toLowerCase().replace(/^www\./, "")] = Math.round(Number(i.rank) || 0);
  const out = { cited, mine, byRival: Object.fromEntries(rivals.map((r, i) => [r, theirs[i]])) as Record<string, string[]>, ranks: rankOf, at: new Date().toISOString() };
  await writeCache(keys.ai(t.id, sites, rivals), out);
  return out;
}

/** The brand's cited sites from the last 30 days of AI answers, with the models that cited each. */
export async function aiCitedDetail(db: SupabaseClient, brandId: string) {
  const since = new Date(Date.now() - 30 * DAY).toISOString();
  const { data } = await db.from("runs").select("chats").eq("brand_id", brandId).gte("at", since).limit(400);
  return citedDetail(((data ?? []) as { chats: { engine?: string; sources?: { url: string; title: string | null; domain: string }[] }[] }[]).map((r) => ({ chats: (r.chats ?? []).map((c) => ({ engine: c.engine, sources: cleanSources(c.sources ?? []) })) })));
}

export async function loadLinks(t: BlTarget, kind: LinkKind, page: number, extra: LinkExtra = {}): Promise<{ rows: LinkRow[]; total: number; at: string }> {
  const r = await task("backlinks", { ...aim(t), limit: 100, offset: page * 100, ...linksQuery(kind, new Date(), extra) });
  const out = { rows: parseLinks(r.items), total: Number(r.total_count ?? 0), at: new Date().toISOString() };
  await writeCache(keys.links(t.id, kind, page, extra), out);
  return out;
}

/**
 * Raw gap answers are saved, one per rival; the AI flag is added on each read, since the brand's AI answers change daily.
 * Each rival is its own request with the brand excluded, so a site that links to the brand never shows as a gap.
 */
export async function loadGap(target: string, rivals: string[]): Promise<{ perRival: { rival: string; items: unknown[] }[]; at: string }> {
  const perRival = await Promise.all(
    rivals.map(async (rival) => {
      const r = await task("domain_intersection", { targets: { "1": rival }, exclude_targets: [target], include_subdomains: true, limit: 300, order_by: ["1.rank,desc"], ...SCALE });
      return { rival, items: r.items ?? [] };
    }),
  );
  const out = { perRival, at: new Date().toISOString() };
  await writeCache(keys.gap(target, rivals), out);
  return out;
}

/**
 * Up to 200 sites or pages side by side: authority, linking sites, backlinks and spam, four bulk requests in all.
 * Spam may fail on its own; then that column is empty and nothing is saved.
 */
export async function loadBulk(targets: string[]): Promise<{ rows: BulkRow[]; at: string }> {
  let partial = false;
  const [ranks, backlinks, domains, spam] = await Promise.all([
    task("bulk_ranks", { targets, ...SCALE }),
    task("bulk_backlinks", { targets }),
    task("bulk_referring_domains", { targets }),
    task("bulk_spam_score", { targets }).catch(() => {
      partial = true;
      return null;
    }),
  ]);
  const out = { rows: parseBulk(targets, { ranks: ranks.items, backlinks: backlinks.items, domains: domains.items, spam: spam ? (spam.items ?? []) : null }), at: new Date().toISOString() };
  if (!partial) await writeCache(keys.bulk(targets), out);
  return out;
}

/** Domains the brand's AI answers cited in the last 30 days, with how often. */
export async function aiCited(db: SupabaseClient, brandId: string) {
  const since = new Date(Date.now() - 30 * DAY).toISOString();
  const { data } = await db.from("runs").select("chats").eq("brand_id", brandId).gte("at", since).limit(400);
  return citedDomains(((data ?? []) as { chats: { sources?: { url: string; title: string | null; domain: string }[] }[] }[]).map((r) => ({ chats: (r.chats ?? []).map((c) => ({ sources: cleanSources(c.sources ?? []) })) })));
}

export function gapRows(perRival: { rival: string; items: unknown[] }[], own: string, cited: Map<string, number>): GapRow[] {
  return parseGap(perRival, own, cited);
}

/** Keep one snapshot per brand and day, for the change arrows. */
export async function snapshot(db: SupabaseClient, ws: string, brandId: string, o: Overview) {
  if (!o.summary) return;
  const { error } = await db
    .from("backlink_snapshots")
    .upsert({ brand_id: brandId, workspace_id: ws, day: new Date().toISOString().slice(0, 10), rank: o.summary.rank, backlinks: o.summary.backlinks, domains: o.summary.domains, spam: o.summary.spam });
  if (error && !/backlink_snapshots/.test(error.message)) console.error("Backlink snapshot:", error.message);
}
