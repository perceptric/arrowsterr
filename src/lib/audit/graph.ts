// Audit's link graph, worked out once a crawl has read every page (docs/audit-plan.md, sections 4.2 and 4.5):
// clicks from the home page, links in, the link score, orphans, links to redirects or broken pages, and page value.
// Pure, so tests cover it.

export type GraphPage = {
  hash: string;
  status: number; // 0 when it never answered
  html: boolean; // a web page (a PDF or an image has no links)
  finalHash: string | null; // where a redirect ends, when the crawl read that page
  linksTo: string[]; // hashes of internal pages it links to, once each
  bodyLinksTo: string[];
  foundFrom: string; // home, sitemap, link, redirect, ai, gsc, ga4
  aiCitations: number;
  clicks?: number | null; // Search Console, 28 days (phase 2)
  impressions?: number | null;
  conversions?: number | null; // GA4 key events, 28 days
};

export type GraphResult = {
  depth: number | null;
  linksIn: number;
  bodyLinksIn: number;
  linkScore: number; // 0 to 10
  orphan: boolean;
  badLinksOut: number;
  value: number; // 0 to 1
};

const ok = (p: GraphPage | undefined) => Boolean(p && p.status >= 200 && p.status < 300);
const isRedirect = (p: GraphPage | undefined) => Boolean(p && p.status >= 300 && p.status < 400);
const isBroken = (p: GraphPage | undefined) => Boolean(p && (p.status === 0 || p.status >= 400));

/** Follow redirects to the page that answers, at most 10 hops. Null when the chain leaves the crawl or loops. */
function landing(byHash: Map<string, GraphPage>, hash: string): string | null {
  let h: string | null = hash;
  for (let i = 0; i < 10 && h; i++) {
    const p = byHash.get(h);
    if (!p) return null;
    if (!isRedirect(p)) return h;
    h = p.finalHash;
  }
  return null;
}

/** PageRank over pages that answer 200 (damping 0.85, 20 rounds). Pages with no links out share their score with all. */
export function pageRank(nodes: string[], edges: Map<string, string[]>, rounds = 20, d = 0.85): Map<string, number> {
  const n = nodes.length;
  const rank = new Map(nodes.map((h) => [h, 1 / Math.max(1, n)]));
  if (!n) return rank;
  for (let r = 0; r < rounds; r++) {
    const next = new Map(nodes.map((h) => [h, (1 - d) / n]));
    let dangling = 0;
    for (const h of nodes) {
      const out = edges.get(h) ?? [];
      const share = rank.get(h)!;
      if (!out.length) {
        dangling += share;
        continue;
      }
      for (const t of out) next.set(t, next.get(t)! + (d * share) / out.length);
    }
    for (const h of nodes) next.set(h, next.get(h)! + (d * dangling) / n);
    for (const [h, v] of next) rank.set(h, v);
  }
  return rank;
}

/** PageRank on a log scale from 0 (no links in) to 10 (the strongest page). */
export function scoreOf(pr: number, min: number, max: number): number {
  if (!(max > min) || pr <= min) return 0;
  return Math.round(Math.min(10, (10 * Math.log(pr / min)) / Math.log(max / min)) * 10) / 10;
}

/** Share of the site's values below this one, from 0 to 1. Zero always scores 0. */
function percentiles(values: number[]): (v: number) => number {
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  return (v) => {
    if (!(v > 0) || !n) return 0;
    let lo = 0;
    let hi = n;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (sorted[mid] < v) lo = mid + 1;
      else hi = mid;
    }
    return (lo + 1) / n;
  };
}

const WEIGHTS = { clicks: 0.45, impressions: 0.2, aiCitations: 0.2, conversions: 0.1 } as const;
type Traffic = keyof typeof WEIGHTS;

/**
 * Page value from 0 to 1 (docs/audit-plan.md, section 4.2). Data a site doesn't have (no Search Console, no GA4) drops
 * out and the rest take its share. Link score only orders pages among themselves: any page with clicks, impressions,
 * citations or conversions is worth more than every page with none. A site with none of that data is ordered by
 * link score alone.
 */
export function pageValues(pages: { clicks?: number | null; impressions?: number | null; aiCitations?: number | null; conversions?: number | null; linkScore: number }[]): number[] {
  const have = (Object.keys(WEIGHTS) as Traffic[]).filter((k) => pages.some((p) => (p[k] ?? 0) > 0));
  const link = percentiles(pages.map((p) => p.linkScore));
  if (!have.length) return pages.map((p) => round(link(p.linkScore)));
  const total = have.reduce((s, k) => s + WEIGHTS[k], 0);
  const pct = Object.fromEntries(have.map((k) => [k, percentiles(pages.map((p) => p[k] ?? 0))])) as Record<Traffic, (v: number) => number>;
  return pages.map((p) => {
    const traffic = have.reduce((s, k) => s + (WEIGHTS[k] / total) * pct[k](p[k] ?? 0), 0);
    return round(traffic > 0 ? 0.05 + 0.9 * traffic + 0.05 * link(p.linkScore) : 0.049 * link(p.linkScore));
  });
}
const round = (v: number) => Math.round(v * 10_000) / 10_000;

/** The whole graph: every page's place in the site's links. rootHash is the home page the crawl started from. */
export function buildGraph(pages: GraphPage[], rootHash: string): Map<string, GraphResult> {
  const byHash = new Map(pages.map((p) => [p.hash, p]));
  const root = landing(byHash, rootHash) ?? rootHash;

  // Clicks from the home page, by breadth-first search. Following a redirect costs no extra click.
  const depth = new Map<string, number>();
  const queue: string[] = [];
  if (byHash.has(root)) {
    depth.set(root, 0);
    queue.push(root);
  }
  for (let i = 0; i < queue.length; i++) {
    const h = queue[i];
    const p = byHash.get(h)!;
    if (!ok(p) || !p.html) continue;
    for (const t of p.linksTo) {
      if (!byHash.has(t) || depth.has(t)) continue;
      const d = depth.get(h)! + 1;
      depth.set(t, d);
      queue.push(t);
      // A redirect's landing page sits at the same depth.
      const end = landing(byHash, t);
      if (end && end !== t && !depth.has(end)) {
        depth.set(end, d);
        queue.push(end);
      }
    }
  }

  // Links in: the pages that answer 200 and link here, once each.
  const linksIn = new Map<string, number>();
  const bodyIn = new Map<string, number>();
  const edges = new Map<string, string[]>();
  const nodes = pages.filter((p) => ok(p) && p.html).map((p) => p.hash);
  const nodeSet = new Set(nodes);
  // A link to a redirect counts for the redirect and for the page it lands on, still once per linking page.
  const reached = (h: string, list: string[]) => {
    const set = new Set<string>();
    for (const t of list) {
      set.add(t);
      const end = landing(byHash, t);
      if (end) set.add(end);
    }
    set.delete(h);
    return set;
  };
  for (const h of nodes) {
    const p = byHash.get(h)!;
    for (const t of reached(h, p.linksTo)) linksIn.set(t, (linksIn.get(t) ?? 0) + 1);
    for (const t of reached(h, p.bodyLinksTo)) bodyIn.set(t, (bodyIn.get(t) ?? 0) + 1);
    // For the link score, a link to a redirect passes to the page it lands on.
    edges.set(h, [...reached(h, p.linksTo)].filter((t) => nodeSet.has(t)));
  }

  const pr = pageRank(nodes, edges);
  const values = [...pr.values()];
  const min = values.length ? Math.min(...values) : 0;
  const max = values.length ? Math.max(...values) : 0;
  const score = new Map(nodes.map((h) => [h, scoreOf(pr.get(h)!, min, max)]));
  const value = pageValues(pages.map((p) => ({ clicks: p.clicks, impressions: p.impressions, aiCitations: p.aiCitations, conversions: p.conversions, linkScore: score.get(p.hash) ?? 0 })));

  const out = new Map<string, GraphResult>();
  pages.forEach((p, i) => {
    const bad = p.html && ok(p) ? p.linksTo.filter((t) => isRedirect(byHash.get(t)) || isBroken(byHash.get(t))).length : 0;
    const known = p.foundFrom !== "link" && p.foundFrom !== "redirect";
    out.set(p.hash, {
      depth: depth.get(p.hash) ?? null,
      linksIn: linksIn.get(p.hash) ?? 0,
      bodyLinksIn: bodyIn.get(p.hash) ?? 0,
      linkScore: score.get(p.hash) ?? 0,
      orphan: ok(p) && p.html && p.hash !== root && known && !(linksIn.get(p.hash) ?? 0),
      badLinksOut: bad,
      value: value[i],
    });
  });
  return out;
}

export type CrawlStats = {
  pages: number;
  ok: number;
  redirects: number;
  broken: number;
  noAnswer: number;
  notIndexable: number;
  avgDepth: number | null;
  deep: number; // 4 or more clicks from home
  unreachable: number; // answers 200 but no path of links reaches it from home
  orphans: number;
  oneLinkIn: number;
  pagesWithBadLinks: number;
  badLinks: number;
  internalLinks: number;
};

/** The numbers the Overview and Internal links screens show. */
export function crawlStats(pages: (GraphPage & { indexable: boolean })[], graph: Map<string, GraphResult>, rootHash: string): CrawlStats {
  const okPages = pages.filter((p) => ok(p) && p.html);
  const depths = okPages.map((p) => graph.get(p.hash)?.depth).filter((d): d is number => d != null);
  const root = rootHash;
  return {
    pages: pages.length,
    ok: okPages.length,
    redirects: pages.filter(isRedirect).length,
    broken: pages.filter((p) => p.status >= 400).length,
    noAnswer: pages.filter((p) => p.status === 0).length,
    notIndexable: okPages.filter((p) => !p.indexable).length,
    avgDepth: depths.length ? Math.round((depths.reduce((s, d) => s + d, 0) / depths.length) * 10) / 10 : null,
    deep: depths.filter((d) => d >= 4).length,
    unreachable: okPages.filter((p) => graph.get(p.hash)?.depth == null).length,
    orphans: pages.filter((p) => graph.get(p.hash)?.orphan).length,
    oneLinkIn: okPages.filter((p) => p.hash !== root && graph.get(p.hash)?.linksIn === 1).length,
    pagesWithBadLinks: okPages.filter((p) => (graph.get(p.hash)?.badLinksOut ?? 0) > 0).length,
    badLinks: okPages.reduce((s, p) => s + (graph.get(p.hash)?.badLinksOut ?? 0), 0),
    internalLinks: okPages.reduce((s, p) => s + p.linksTo.length, 0),
  };
}

/** Pages added and gone since the last full crawl, by address. */
export function compareCrawls(now: { hash: string; url: string }[], before: { hash: string; url: string }[]) {
  const was = new Set(before.map((p) => p.hash));
  const is = new Set(now.map((p) => p.hash));
  const added = now.filter((p) => !was.has(p.hash));
  const gone = before.filter((p) => !is.has(p.hash));
  return { added: added.length, gone: gone.length, addedSample: added.slice(0, 20).map((p) => p.url), goneSample: gone.slice(0, 20).map((p) => p.url) };
}
