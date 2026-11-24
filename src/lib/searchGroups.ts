// Search-led outlines: the searches people type about a keyword, grouped so each group can become one heading.
// "what is ai agent", "what are ai agents" and "what is an agent in ai" are one group; their volumes add up.

export type Search = { keyword: string; volume: number | null };
export type SearchGroup = { top: string; volume: number; searches: Search[] };

// Words that change the wording of a search but not what it asks.
const FILLER = new Set(["a", "an", "the", "is", "are", "in", "of", "for", "to", "do", "does", "it", "can", "you", "i", "my"]);
// Words that ask for the same thing.
const SAME: Record<string, string> = { create: "build", make: "build", making: "build", building: "build", creating: "build", setup: "build" };

const word = (w: string) => {
  const x = SAME[w] ?? w;
  // A plain plural or third person: agents → agent, works → work. Short words and -ss words stay.
  return x.length > 3 && x.endsWith("s") && !x.endsWith("ss") ? x.slice(0, -1) : x;
};

/** What a search asks, with its wording smoothed out, as a key two searches share when they ask the same thing. */
export function searchKey(q: string): string {
  const words = q
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w && !FILLER.has(w))
    .map(word);
  return [...new Set(words)].sort().join(" ");
}

/** The searches grouped by what they ask, biggest group first. Each group's top search is its biggest one. */
export function groupSearches(rows: Search[], max = 40): SearchGroup[] {
  const groups = new Map<string, Search[]>();
  for (const r of rows) {
    const q = r.keyword.trim().toLowerCase().replace(/\s+/g, " ");
    if (!q) continue;
    const k = searchKey(q);
    const list = groups.get(k) ?? [];
    if (!list.some((x) => x.keyword === q)) list.push({ keyword: q, volume: r.volume });
    groups.set(k, list);
  }
  return [...groups.values()]
    .map((list) => {
      const searches = [...list].sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0));
      return { top: searches[0].keyword, volume: searches.reduce((n, s) => n + (s.volume ?? 0), 0), searches };
    })
    .sort((a, b) => b.volume - a.volume)
    .slice(0, max);
}

/** The groups as the brief prompt reads them. */
export function searchesText(groups: SearchGroup[]): string {
  if (!groups.length) return "";
  const lines = groups.map((g, i) => `G${i + 1} (${g.volume.toLocaleString("en-US")} a month): ${g.searches.map((s) => `${s.keyword}${s.volume ? ` (${s.volume.toLocaleString("en-US")})` : ""}`).join("; ")}`);
  return `What people search about this keyword, grouped by what they ask (Google, United States, searches a month):\n${lines.join("\n")}`;
}

// ─────────────── the heading check ───────────────
const STOP = new Set([...FILLER, "and", "or", "with", "your", "how", "what", "why", "when", "which", "who", "vs", "versus", "on", "at", "by", "from", "about", "use", "using"]);
const content = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP.has(w))
    .map(word);

/**
 * A topic the top pages share: at least `min` of the given pages have a heading with two or more of the heading's
 * content words (or all of them, for a one-word heading). The keyword's own words don't count: nearly every heading
 * on the page has them.
 */
export function sharedByTopPages(h2: string, pageHeadings: string[][], keyword = "", min = 2): boolean {
  const skip = new Set(content(keyword));
  const mine = new Set(content(h2).filter((w) => !skip.has(w)));
  if (!mine.size) return false;
  const need = Math.min(2, mine.size);
  const hits = pageHeadings.filter((heads) => heads.some((h) => content(h).filter((w) => mine.has(w)).length >= need));
  return hits.length >= min;
}

/**
 * The H2s that match no search and no heading the top pages share. The last H2 may be the brand's own section.
 * `searches` are the searches the brief says each H2 answers, already checked against the list.
 */
export function offSearchHeadings(outline: { h2: string; searches?: string[] }[], pageHeadings: string[][], brand: string, keyword = ""): string[] {
  const b = brand.toLowerCase();
  return outline
    .filter((o, i) => !(o.searches?.length) && !(i === outline.length - 1 && b && o.h2.toLowerCase().includes(b)) && !sharedByTopPages(o.h2, pageHeadings, keyword))
    .map((o) => o.h2);
}
