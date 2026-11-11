// The client report's "SEO" block (docs/reports.md, docs/content-map.md and docs/local-research.md): the content map and
// Google Maps ranks for the report's dates.
// Built only from saved results, so a report never spends tasks. Pure, so the server and the tests share one copy.

import type { LocalReportLoc } from "./localReport.ts";

export type SeoSnapshot = {
  /** Site health, on-page, backlinks and links won: only on reports made before Technical SEO was removed. */
  site?: { score: number; before: number | null; pages: number; high: number } | null;
  onpage?: { pages: number; avg: number; topAvg: number | null; worst: { url: string; keyword: string; score: number }[] } | null;
  backlinks?: { domains: number; before: number | null; backlinks: number; rank: number } | null;
  links?: { won: number; wonInPeriod: number; gone: number; contacted: number } | null;
  map: { covered: number; missing: number; overlap: number; progress: number } | null;
  local: { keyword: string; avg: number; before: number | null; top3: number; read: number }[] | null;
  /** Local Research per location (phase 6). Missing on reports made before it; then `local` shows instead. */
  locations?: LocalReportLoc[] | null;
};

export type SeoRaw = {
  start: string; // the report's first day, YYYY-MM-DD
  end: string; // its last day
  maps: { created_at: string; result: { topics: { status: string }[] } | null }[];
  scans: { keyword: string; created_at: string; result: { avg: number | null; top3: number; read: number } | null }[];
  /** Built by src/lib/localReportServer.ts for the same dates. */
  locations?: LocalReportLoc[];
};

const day = (iso: string) => iso.slice(0, 10);
const byNewest = <T extends { created_at: string }>(xs: T[]) => [...xs].sort((a, b) => b.created_at.localeCompare(a.created_at));

/** The block's numbers. Each part is null when its tool has nothing for these dates; the whole block is null when all are. */
export function seoSnapshot(raw: SeoRaw): SeoSnapshot | null {
  const upTo = <T extends { created_at: string }>(xs: T[]) => byNewest(xs).filter((x) => day(x.created_at) <= raw.end);

  const m = upTo(raw.maps).find((x) => x.result)?.result;
  const count = (s: string) => (m?.topics ?? []).filter((t) => t.status === s).length;
  const map = m ? { covered: count("covered"), missing: count("missing"), overlap: count("overlap"), progress: count("progress") } : null;

  const keywords = [...new Set(raw.scans.map((s) => s.keyword))];
  const local = keywords
    .map((k) => {
      const done = upTo(raw.scans.filter((s) => s.keyword === k && s.result && s.result.avg !== null));
      const cur = done[0];
      if (!cur?.result) return null;
      const prev = done.find((s) => day(s.created_at) < raw.start) ?? done[1];
      return { keyword: k, avg: cur.result.avg as number, before: prev?.result?.avg ?? null, top3: cur.result.top3, read: cur.result.read };
    })
    .filter((x): x is NonNullable<typeof x> => Boolean(x));

  const out: SeoSnapshot = { map, local: local.length ? local : null, locations: raw.locations?.length ? raw.locations : null };
  return Object.values(out).some((v) => v !== null) ? out : null;
}
