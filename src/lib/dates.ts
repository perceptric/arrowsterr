// Dates in words, the same on every screen. Pure, so tests can cover them.

type When = string | number | Date | null | undefined;

const toMs = (t: When) => (t === null || t === undefined || t === "" ? NaN : t instanceof Date ? t.getTime() : typeof t === "number" ? t : Date.parse(t));
const dayStart = (ms: number) => {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
};

/**
 * A day as people say it: "Oct 3", with the year only when it isn't this year ("Oct 3, 2025").
 * year: true always shows the year, false never does. now is for tests. Missing or bad dates print as "–".
 */
export function formatDate(t: When, opts: { year?: boolean; now?: number } = {}): string {
  const ms = toMs(t);
  if (Number.isNaN(ms)) return "–";
  const d = new Date(ms);
  const showYear = opts.year ?? d.getFullYear() !== new Date(opts.now ?? Date.now()).getFullYear();
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", ...(showYear ? { year: "numeric" } : {}) });
}

/** How long ago: "just now", "5 min ago", "2 h ago", "Yesterday", then the date ("Oct 3"). now is for tests. */
export function ago(t: When, now = Date.now()): string {
  const ms = toMs(t);
  if (Number.isNaN(ms)) return "–";
  const s = (now - ms) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  const days = Math.round((dayStart(now) - dayStart(ms)) / 86_400_000);
  if (days === 1) return "Yesterday";
  return formatDate(ms, { now });
}
