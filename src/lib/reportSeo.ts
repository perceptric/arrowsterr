// The client report's "SEO and links" block (docs/reports.md and docs/site-audit.md through docs/local-research.md):
// site health, on-page scores, backlinks, links won, the content map and Google Maps ranks for the report's dates.
// Built only from saved results, so a report never spends tasks. Pure, so the server and the tests share one copy.

export type SeoSnapshot = {
  site: { score: number; before: number | null; pages: number; high: number } | null;
  onpage: { pages: number; avg: number; topAvg: number | null; worst: { url: string; keyword: string; score: number }[] } | null;
  backlinks: { domains: number; before: number | null; backlinks: number; rank: number } | null;
  links: { won: number; wonInPeriod: number; gone: number; contacted: number } | null;
  map: { covered: number; missing: number; overlap: number; progress: number } | null;
  local: { keyword: string; avg: number; before: number | null; top3: number; read: number }[] | null;
};

export type SeoRaw = {
  start: string; // the report's first day, YYYY-MM-DD
  end: string; // its last day
  audits: { status: string; score: number | null; created_at: string; pages: number; result: { partial?: string | null; issues?: { severity: string }[] } | null }[];
  onpage: { url: string; keyword: string; score: number | null; top_score: number | null; created_at: string; status: string }[];
  snaps: { day: string; domains: number; backlinks: number; rank: number }[];
  cards: { stage: string; stage_at: string | null; link_live: boolean | null }[] | null;
  maps: { created_at: string; result: { topics: { status: string }[] } | null }[];
  scans: { keyword: string; created_at: string; result: { avg: number | null; top3: number; read: number } | null }[];
};

const day = (iso: string) => iso.slice(0, 10);
const byNewest = <T extends { created_at: string }>(xs: T[]) => [...xs].sort((a, b) => b.created_at.localeCompare(a.created_at));

/** The block's numbers. Each part is null when its tool has nothing for these dates; the whole block is null when all are. */
export function seoSnapshot(raw: SeoRaw): SeoSnapshot | null {
  const upTo = <T extends { created_at: string }>(xs: T[]) => byNewest(xs).filter((x) => day(x.created_at) <= raw.end);

  const full = upTo(raw.audits).filter((a) => a.status === "done" && a.score !== null && !a.result?.partial);
  const site = full[0]
    ? { score: full[0].score as number, before: full.find((a) => day(a.created_at) < raw.start)?.score ?? full[1]?.score ?? null, pages: full[0].pages, high: (full[0].result?.issues ?? []).filter((i) => i.severity === "high").length }
    : null;

  const seen = new Set<string>();
  const pages = upTo(raw.onpage).filter((r) => r.status === "done" && r.score !== null && (seen.has(`${r.url}|${r.keyword}`) ? false : (seen.add(`${r.url}|${r.keyword}`), true)));
  const tops = pages.map((p) => p.top_score).filter((x): x is number => x !== null);
  const onpage = pages.length
    ? {
        pages: pages.length,
        avg: Math.round(pages.reduce((s, p) => s + (p.score as number), 0) / pages.length),
        topAvg: tops.length ? Math.round(tops.reduce((s, x) => s + x, 0) / tops.length) : null,
        worst: [...pages].sort((a, b) => (a.score as number) - (b.score as number)).slice(0, 5).map((p) => ({ url: p.url, keyword: p.keyword, score: p.score as number })),
      }
    : null;

  const snaps = [...raw.snaps].sort((a, b) => b.day.localeCompare(a.day));
  const now = snaps.find((s) => s.day <= raw.end);
  const was = snaps.find((s) => s.day < raw.start);
  const backlinks = now ? { domains: now.domains, before: was?.domains ?? null, backlinks: now.backlinks, rank: now.rank } : null;

  const cards = raw.cards;
  const links = cards && cards.length
    ? {
        won: cards.filter((c) => c.stage === "won").length,
        wonInPeriod: cards.filter((c) => c.stage === "won" && c.stage_at && day(c.stage_at) >= raw.start && day(c.stage_at) <= raw.end).length,
        gone: cards.filter((c) => c.stage === "won" && c.link_live === false).length,
        contacted: cards.filter((c) => c.stage !== "prospect").length,
      }
    : null;

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

  const out: SeoSnapshot = { site, onpage, backlinks, links, map, local: local.length ? local : null };
  return Object.values(out).some((v) => v !== null) ? out : null;
}
