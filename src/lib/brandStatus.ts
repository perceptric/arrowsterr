// What the Brand page's side list says about each section. Pure, so tests can cover it.

import { formatDate } from "./dates.ts";

export type BrandSection = "voice" | "kit" | "guidelines";

/** The section a tab address opens: Tone of voice is the page's own (/brand). */
export const sectionOf = (sub?: string): BrandSection => (sub === "kit" || sub === "guidelines" ? sub : "voice");

/** A section's state: "Not set", or "Saved Oct 3". undefined while it loads prints nothing. now is for tests. */
export function savedLine(at: string | null | undefined, now?: number): string {
  if (at === undefined) return "";
  return at ? `Saved ${formatDate(at, { now })}` : "Not set";
}

/** When the voice was saved, or null when there's no voice yet. */
export const voiceSavedAt = (row: { voice: unknown; updated_at: string | null } | null | undefined) => (row?.voice ? (row.updated_at ?? null) : null);

/** When the guidelines were saved, or null when they hold nothing: no text, no links and no files. */
export const guidelinesSavedAt = (row: { body: string; links: string[]; files: unknown[]; updated_at: string | null } | null | undefined) =>
  row && (row.body.trim() || row.links.length || row.files.length) ? (row.updated_at ?? null) : null;

/** When the Brand Kit was last saved or learned, or null when there's none. */
export const kitSavedAt = (row: { confirmed_at: string | null; learned_at: string | null } | null | undefined) => (row ? (row.confirmed_at ?? row.learned_at ?? null) : null);
