/** One keyword in a keyword gap: the competitor's spot (them) and yours (you), when ranked. */
export type GapRow = { keyword: string; volume: number | null; kd: number | null; intent: string | null; them: number | null; you: number | null; url: string | null };
/** Keywords only the competitor ranks for, keywords you both rank for, and keywords only you rank for. */
export type Gap = { missing: GapRow[]; shared: GapRow[]; only: GapRow[]; totals: { missing: number; shared: number; only: number } };

/** Shared keywords split by who ranks higher: weaker when they beat you, lead when you beat them or tie. */
export function splitShared(shared: GapRow[]) {
  const weaker = shared.filter((r) => r.you !== null && r.them !== null && r.you > r.them);
  return { weaker, lead: shared.filter((r) => !weaker.includes(r)) };
}

/** A domain without www, lowercased, for comparing. */
export const bare = (d: string | null | undefined) => (d ?? "").toLowerCase().replace(/^www\./, "");

/** A readable name from a domain: animalz.co → Animalz, the-hoth.com → The Hoth, acme.co.uk → Acme. */
export function nameFromDomain(d: string) {
  const parts = bare(d).split("/")[0].split(".");
  const base = parts.length > 2 && /^(co|com|org|net|ac|gov|edu)$/.test(parts[parts.length - 2]) ? parts[parts.length - 3] : (parts[parts.length - 2] ?? parts[0]);
  return base
    .split(/[-_]/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}
