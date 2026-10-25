// Small number words for the research screens. Pure, so tests can cover them.

/** n in short form: 12.4K, 1.2M. Missing prints as "–". */
export const shortNum = (n: number | null | undefined) =>
  n === null || n === undefined ? "–" : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1).replace(/\.0$/, "")}K` : String(n);

export type Trend = { tone: "up" | "down" | "flat"; text: string };

/**
 * How searches moved from the first month to the last, against 12 months ago.
 * From zero it is "new"; a change that rounds to 0 is "no change", grey. Null when there is nothing to compare.
 */
export function trendChange(values: number[]): Trend | null {
  if (values.length < 2) return null;
  const first = values[0];
  const last = values[values.length - 1];
  if (!first) return last > 0 ? { tone: "flat", text: "(new)" } : null;
  const pct = Math.round(((last - first) / first) * 100);
  if (pct === 0) return { tone: "flat", text: "no change vs 12 months ago" };
  return { tone: pct > 0 ? "up" : "down", text: `${pct > 0 ? "+" : "−"}${Math.abs(pct)}% vs 12 months ago` };
}

/** A tab's count against the real total: "100 of 12.4K", or just "100" when the list is whole. */
export function countOf(shown: number, total: number | null | undefined) {
  return total && total > shown ? `${shown.toLocaleString("en-US")} of ${shortNum(total)}` : shown.toLocaleString("en-US");
}

/** A signed count for new and lost keywords: "+12", "−4", and "0" for none. */
export function signed(n: number | null | undefined, sign: "+" | "−") {
  if (n === null || n === undefined) return "–";
  return n ? `${sign}${shortNum(n)}` : "0";
}
