// The Site structure screen's rules (docs/technical-seo-plan.md, phase 3): the site by top folder, link suggestions for
// pages that need more internal links, and redirect chains. Pure.

export type StructPage = { url: string; depth: number | null; linksIn: number; rank: number | null; status: number; indexable: boolean; clicks: number };

/** A page's first path folder, like /blog for /blog/post. Pages at the top level belong to /. */
export function folderOf(url: string): string {
  try {
    const parts = new URL(url).pathname.split("/").filter(Boolean);
    return parts.length > 1 ? `/${parts[0]}` : "/";
  } catch {
    return "/";
  }
}

/** Pages grouped by their first path folder: count, average depth, links in and search clicks. */
export function folders(pages: StructPage[]): { folder: string; pages: number; depth: number | null; linksIn: number; clicks: number; rank: number | null }[] {
  const by = new Map<string, { pages: number; depthSum: number; depthN: number; linksIn: number; clicks: number; rankSum: number; rankN: number }>();
  for (const p of pages) {
    const folder = folderOf(p.url);
    const cur = by.get(folder) ?? { pages: 0, depthSum: 0, depthN: 0, linksIn: 0, clicks: 0, rankSum: 0, rankN: 0 };
    cur.pages++;
    if (p.depth !== null) {
      cur.depthSum += p.depth;
      cur.depthN++;
    }
    if (p.rank !== null) {
      cur.rankSum += p.rank;
      cur.rankN++;
    }
    cur.linksIn += p.linksIn;
    cur.clicks += p.clicks;
    by.set(folder, cur);
  }
  return [...by.entries()]
    .map(([folder, v]) => ({ folder, pages: v.pages, depth: v.depthN ? Math.round((v.depthSum / v.depthN) * 10) / 10 : null, linksIn: v.linksIn, clicks: v.clicks, rank: v.rankN ? Math.round((v.rankSum / v.rankN) * 10) / 10 : null }))
    .sort((a, b) => b.pages - a.pages);
}

/**
 * Pages that matter (search clicks, or many links in) but sit deep or score low on internal links: they need links.
 * Sorted by clicks, then by how weak their links are.
 */
export function weakPages(pages: StructPage[], n = 50): StructPage[] {
  const live = pages.filter((p) => p.indexable && p.status >= 200 && p.status < 300);
  return live
    .filter((p) => p.clicks > 0 && ((p.rank ?? 10) < 3 || (p.depth ?? 0) >= 4 || p.linksIn <= 2))
    .sort((a, b) => b.clicks - a.clicks || (a.rank ?? 0) - (b.rank ?? 0))
    .slice(0, n);
}

const STOP = new Set("a an and are as at be by for from how in is it its of on or our that the this to was what when where which who why will with you your we can do does not use using vs best top guide new more about into than then them they their".split(" "));
/** The words that say what a page is about, from its title and H1 (plurals folded, short and common words dropped). */
export function topicWords(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 2 && !STOP.has(w))
      .map((w) => (w.length > 4 && w.endsWith("s") ? w.slice(0, -1) : w)),
  );
}

export type Suggestion = { from: string; title: string; shared: string[]; rank: number | null };

/**
 * Pages that should link to a target: they share topic words with it, don't link to it yet, and are strong themselves.
 * The anchor to use is the target's H1 or title.
 */
export function suggestLinks(target: { url: string; title: string; h1: string }, pages: { url: string; title: string; h1: string; rank: number | null; links: string[] }[], n = 5): Suggestion[] {
  const want = topicWords(`${target.title} ${target.h1}`);
  if (!want.size) return [];
  return pages
    .filter((p) => p.url !== target.url && !p.links.includes(target.url))
    .map((p) => {
      const have = topicWords(`${p.title} ${p.h1}`);
      const shared = [...want].filter((w) => have.has(w));
      return { from: p.url, title: p.title, shared, rank: p.rank, score: shared.length / want.size + (p.rank ?? 0) / 40 };
    })
    .filter((s) => s.shared.length >= Math.min(2, want.size))
    .sort((a, b) => b.score - a.score)
    .slice(0, n)
    .map(({ score, ...s }) => (void score, s));
}

/** The anchor text to suggest: the target's H1, else its title without the site name after a separator. */
export const anchorFor = (t: { title: string; h1: string }) => (t.h1 || t.title.split(/\s[|\-–—:]\s/)[0] || t.title).trim().slice(0, 80);
