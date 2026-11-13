// The client report's old "SEO" block. Backlinks, Content Map and Local Research were removed, so new reports have no
// SEO block; reports made before keep and show what they saved.

export type SeoSnapshot = {
  /** Backlinks and links won: only on reports made before those tools were removed. */
  backlinks?: { domains: number; before: number | null; backlinks: number; rank: number } | null;
  links?: { won: number; wonInPeriod: number; gone: number; contacted: number } | null;
  map?: { covered: number; missing: number; overlap: number; progress: number } | null;
  local?: { keyword: string; avg: number; before: number | null; top3: number; read: number }[] | null;
};
