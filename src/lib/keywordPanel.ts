// Pure helpers for the Analytics keyword research panel: which numbers belong to the keyword, which keywords are
// close variations, and an honest line about where the brand ranks.
import { broadWords, stem, type Keyword } from "./research.ts";

/** A keyword as the research route stores it: lower case, single spaces, no quotes or end marks. */
export const normalizeKeyword = (s: string) => s.toLowerCase().replace(/["“”?!.]/g, "").replace(/\s+/g, " ").trim();

/** The keyword's own numbers: Google's exact lookup, else a row with the very same words. Never another keyword's. */
export function exactKeyword(query: string, rows: Keyword[] | null | undefined, exact?: Keyword | null): Keyword | null {
  const q = normalizeKeyword(query);
  if (exact && normalizeKeyword(exact.keyword) === q) return exact;
  return rows?.find((r) => normalizeKeyword(r.keyword) === q) ?? null;
}

/** Close variations: keywords holding every main word of the query, any word form, by searches (most first). */
export function closeVariations(query: string, rows: Keyword[] | null | undefined, limit = 10): Keyword[] {
  const q = normalizeKeyword(query);
  const need = broadWords(q);
  const seen = new Set<string>([q]);
  const out: Keyword[] = [];
  for (const r of rows ?? []) {
    const k = normalizeKeyword(r.keyword);
    if (seen.has(k)) continue;
    const have = new Set(k.split(" ").map(stem));
    if (!need.every((w) => have.has(w))) continue;
    seen.add(k);
    out.push(r);
  }
  return out.sort((a, b) => (b.volume ?? -1) - (a.volume ?? -1)).slice(0, limit);
}

const whole = (v: number) => Math.round(v).toLocaleString("en-US");
const plural = (v: number, word: string) => `${whole(v)} ${word}${Math.round(v) === 1 ? "" : "s"}`;

/**
 * Where the brand ranks, in one plain sentence. "Top 3" only when it is. A clicks estimate only when it is worth
 * reading: the page is within the first two pages and moving to #3 would add at least 5 clicks a month.
 */
export function rankSentence(r: { position: number | null; impressions: number; clicks: number; days: number; top3Ctr: number }): string | null {
  if (!r.position || r.position <= 0) return null;
  const pos = Math.max(1, Math.round(r.position));
  const seen = `${plural(r.impressions, "impression")}${r.clicks > 0 ? ` and ${plural(r.clicks, "click")}` : ""}`;
  if (pos <= 3) return `You rank #${pos}, in the top 3, with ${seen}.`;
  const gain = Math.round((r.top3Ctr * r.impressions - r.clicks) * (30 / Math.max(1, r.days)));
  const tip = pos <= 20 && gain >= 5 ? ` Moving into the top 3 could add about ${plural(gain, "click")} a month.` : "";
  return `You rank #${pos} with ${seen}.${tip}`;
}
