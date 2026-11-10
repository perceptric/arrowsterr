// Site Audit screen rules (docs/site-audit.md). Pure, so the page, the worker and the tests share one copy.
// The crawler itself lives in audit.ts. A partial crawl never gets a score: a wrong "healthy" costs more than no score.

export type CrawledPage = { url: string; status: number };
export type IssueLite = { id: string; count: number; severity: "high" | "medium" | "low"; play?: string };
export type AuditRow = { id: string; status: "running" | "done" | "failed"; score: number | null; created_at: string; result?: { partial?: string | null } | null };

/** The plays a Site Audit issue can start in a connected CMS. */
export const FIX_PLAYS = ["meta", "alt", "schema"] as const;
export type FixPlay = (typeof FIX_PLAYS)[number];
export const fixPlayOf = (issue: { play?: string }): FixPlay | null => (FIX_PLAYS as readonly string[]).includes(issue.play ?? "") ? (issue.play as FixPlay) : null;

/** A score drop this big, between two full crawls, sends an alert. */
export const DROP_ALERT = 5;
/** Weekly crawls run when the brand's last crawl started this long ago. */
export const WEEK_MS = 7 * 864e5;
const SLACK_MS = 3 * 3600_000; // daily ticks drift, so a crawl a few hours short of a week still counts as due

/**
 * Why a crawl can't be trusted for a score, or null when it can. The homepage must load, and at least half of the
 * pages must answer. Pages that answer with an error (404, 500) still count as answered: they are real findings.
 */
export function partialReason(pages: CrawledPage[], home: string): string | null {
  if (!pages.length) return "No pages could be read.";
  const bare = (u: string) => u.replace(/^https?:\/\/(www\.)?/i, "").replace(/\/+$/, "").toLowerCase();
  const homePage = pages.find((p) => bare(p.url) === bare(home));
  if (homePage && homePage.status === 0) return "The homepage didn't load.";
  const silent = pages.filter((p) => p.status === 0).length;
  if (silent * 2 > pages.length) return `${silent} of ${pages.length} pages didn't load.`;
  return null;
}

/** The score to save: none for a partial crawl. */
export const scoreToSave = (score: number, partial: string | null) => (partial ? null : score);

/** True when an audit counts as a full crawl with a score. */
export const isFull = (a: AuditRow) => a.status === "done" && a.score !== null && !a.result?.partial;

/** The last full crawl before the given one, for the change arrow. Audits come newest first. */
export function previousFull(audits: AuditRow[], current: AuditRow): AuditRow | null {
  const i = audits.findIndex((a) => a.id === current.id);
  return audits.slice(i + 1).find(isFull) ?? null;
}

/** An alert goes out only between two full crawls, when the score fell by DROP_ALERT or more. */
export function dropAlert(prev: AuditRow | null, current: AuditRow): number | null {
  if (!prev || !isFull(prev) || !isFull(current)) return null;
  const drop = (prev.score as number) - (current.score as number);
  return drop >= DROP_ALERT ? drop : null;
}

export type IssueChange = { kind: "new" } | { kind: "more"; by: number } | { kind: "fewer"; by: number } | { kind: "same" };

/** How each issue moved since the last full crawl. Issues gone since then come back as `fixed`. */
export function issueChanges<T extends IssueLite>(prev: T[] | null, now: T[]): { changes: Map<string, IssueChange>; fixed: T[] } {
  const changes = new Map<string, IssueChange>();
  if (!prev) return { changes, fixed: [] };
  const before = new Map(prev.map((i) => [i.id, i]));
  for (const i of now) {
    const b = before.get(i.id);
    changes.set(i.id, !b ? { kind: "new" } : i.count > b.count ? { kind: "more", by: i.count - b.count } : i.count < b.count ? { kind: "fewer", by: b.count - i.count } : { kind: "same" });
  }
  const ids = new Set(now.map((i) => i.id));
  return { changes, fixed: prev.filter((i) => !ids.has(i.id)) };
}

/** Is the brand's weekly crawl due? Only for brands with weekly on, and never while one is running. */
export function weeklyDue(opts: { weekly: boolean; lastStarted: string | null; running: boolean; now: number }): boolean {
  if (!opts.weekly || opts.running || !opts.lastStarted) return false;
  return opts.now - Date.parse(opts.lastStarted) >= WEEK_MS - SLACK_MS;
}

/** A running crawl older than this is stuck (the worker died): the next crawl may start. */
export const STUCK_MS = 45 * 60_000;
/** A crawl with no progress report for this long has stopped (crawls report progress every few seconds while they run). */
export const QUIET_MS = 20 * 60_000;
/** A running crawl is stuck when it went quiet for 20 minutes, or, before progress reports existed, ran 45 minutes. */
export const isStuck = (a: { status: string; created_at: string; heartbeat_at?: string | null }, now: number) =>
  a.status === "running" && (a.heartbeat_at ? now - Date.parse(a.heartbeat_at) > QUIET_MS : now - Date.parse(a.created_at) > STUCK_MS);

/** A domain the way crawls store it: no scheme, no www, no path. Empty when it isn't a domain. */
export function cleanDomain(raw: string): string {
  const d = raw.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/[/?#].*$/, "").replace(/\.$/, "");
  return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(d) ? d : "";
}

/** One page, however the crawl or the CMS wrote its address: scheme, www, trailing slash, case and #part don't matter. */
export function pageKey(url: string): string {
  return url.trim().replace(/#.*$/, "").replace(/^https?:\/\/(www\.)?/i, "").replace(/\/+(\?|$)/, "$1").toLowerCase();
}

/** Does a CMS item match one of the pages an issue lists, by id or by address? */
export function matchesPages(item: { id: string; url: string }, ids: string[]): boolean {
  if (ids.includes(item.id)) return true;
  const keys = new Set(ids.map(pageKey));
  return keys.has(pageKey(item.url));
}

/** Severity groups in the order the page shows them. */
export const SEVERITY_LABEL = { high: "High", medium: "Medium", low: "Low" } as const;
