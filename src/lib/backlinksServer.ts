import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cleanSources } from "./sources";
import { DAY, readCache, writeCache } from "./cache";
import { call } from "./dataforseo";
import { citedDomains, linksQuery, parseAnchors, parseGap, parseLinks, parsePages, parseSummary, parseWeeks, type GapRow, type LinkKind, type LinkRow, type Overview } from "./backlinks";

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
  overview: (target: string) => `bl:ov:${target}`,
  links: (target: string, kind: LinkKind, page: number) => `bl:links:${kind}:${page}:${target}`,
  gap: (target: string, rivals: string[]) => `bl:gap2:${target}:${[...rivals].sort().join(",")}`,
};

/** Read a saved answer, with when it was saved. */
export async function saved<T>(key: string): Promise<T | undefined> {
  return readCache<T>(key, KEEP);
}

export async function loadOverview(target: string): Promise<Overview & { at: string }> {
  const from = new Date(Date.now() - 13 * 7 * DAY).toISOString().slice(0, 10);
  const base = { target, include_subdomains: true, ...SCALE };
  let partial = false;
  // The summary must answer. The chart, anchors and pages may fail on their own; then the page shows what came back
  // and nothing is saved, so the next open tries again instead of showing gaps for a week.
  const soft = (p: Promise<{ items?: unknown[] }>) =>
    p.catch(() => {
      partial = true;
      return { items: [] as unknown[] };
    });
  const [summary, weeks, anchors, pages] = await Promise.all([
    task("summary", { ...base, backlinks_status_type: "live" }),
    soft(task("timeseries_new_lost_summary", { target, include_subdomains: true, date_from: from, group_range: "week" })),
    soft(task("anchors", { ...base, limit: 30, order_by: ["referring_domains,desc"] })),
    soft(task("domain_pages_summary", { ...base, limit: 10, order_by: ["referring_domains,desc"] })),
  ]);
  const s = parseSummary(summary);
  const out = { target, summary: s, weeks: parseWeeks(weeks.items), anchors: s ? parseAnchors(anchors.items, s.domains) : [], pages: s ? parsePages(pages.items) : [], at: new Date().toISOString() };
  if (!partial) await writeCache(keys.overview(target), out);
  return out;
}

export async function loadLinks(target: string, kind: LinkKind, page: number): Promise<{ rows: LinkRow[]; total: number; at: string }> {
  const r = await task("backlinks", { target, include_subdomains: true, limit: 100, offset: page * 100, ...linksQuery(kind) });
  const out = { rows: parseLinks(r.items), total: Number(r.total_count ?? 0), at: new Date().toISOString() };
  await writeCache(keys.links(target, kind, page), out);
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
