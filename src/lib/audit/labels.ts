// Audit's words for the screens. No server code here, so the browser can load it.

/** Why a crawl is partial or failed (docs/audit-plan.md, section 10.1). */
export const PARTIAL_TEXT: Record<string, string> = {
  home: "The home page didn't load, so this crawl has no score.",
  no_answer: "More than half the pages didn't answer, so this crawl has no score.",
  time: "The crawl ran out of time before reading half the pages it found.",
  robots: "robots.txt answered with a server error, so crawlers treat the whole site as blocked.",
  firewall: "Your firewall blocked our crawler. Allow ArrowsterrBot in your firewall or CDN, then crawl again.",
  stalled: "The crawl stopped answering three times, so it kept what it read.",
};

/** The quick views of crawled pages, in the order the Pages tab lists them. */
export const VIEW_LABELS = {
  all: "All pages",
  ok: "Pages that answer",
  orphans: "Orphans",
  deep: "4+ clicks deep",
  unreachable: "Not reachable from home",
  one_link: "One link in",
  bad_links: "Link to redirects or broken pages",
  redirects: "Redirects",
  broken: "Broken",
  not_indexable: "Not indexable",
  cited: "Cited by AI",
} as const;
export type PageView = keyof typeof VIEW_LABELS;

export const SPEED_LABELS = { gentle: "Gentle, 1 page a second", normal: "Normal, 2 pages a second", fast: "Fast, 5 pages a second" } as const;

/** Where a crawl is, in a few words. */
export function stageText(a: { status: string; stage: string; pages_done: number; pages_found: number }): string {
  if (a.status === "queued") return "Waiting to start";
  if (a.stage === "seed") return "Reading robots.txt and sitemaps";
  if (a.stage === "fetch") return `Reading pages: ${a.pages_done.toLocaleString("en-US")} of ${a.pages_found.toLocaleString("en-US")}`;
  if (a.stage === "graph") return "Working out the links";
  return "Finishing";
}
