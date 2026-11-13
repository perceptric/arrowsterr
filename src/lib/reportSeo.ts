// The client report's old "SEO" block. Backlinks and Link Building were removed, so new reports have no SEO block;
// reports made before keep and show what they saved.

export type SeoSnapshot = {
  /** Backlinks and links won: only on reports made before those tools were removed. */
  backlinks?: { domains: number; before: number | null; backlinks: number; rank: number } | null;
  links?: { won: number; wonInPeriod: number; gone: number; contacted: number } | null;
};
