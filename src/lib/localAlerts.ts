// Local Research, phase 6 (docs/local-research-plan.md, 4.8): what's worth an alert. A wrong alert costs more than a
// missing one, so a rank drop is only sent after the points that dropped are read again and still agree, a profile
// change only after two reads agree (localProfile.ts), and a first scan or first pull never alerts. Pure.

import { MAX_DEPTH, type Location, type PointResult, type Rival, type ScanResult } from "./local.ts";
import type { Change } from "./localProfile.ts";

export type AlertKind = "rank_drop" | "new_rival" | "profile_change" | "bad_review" | "rating_low";
export type LocalAlert = { kind: AlertKind; key: string; title: string; detail: string };
export type AlertSettings = { on: boolean; ratingBelow: number | null };

export const ALERT_LABEL: Record<AlertKind, string> = {
  rank_drop: "Rank drop",
  new_rival: "New in the top 3",
  profile_change: "Changed on Google",
  bad_review: "Low review",
  rating_low: "Rating",
};

/** A location's alert settings: on unless turned off; no rating level unless one is set. */
export function alertSettings(loc: Pick<Location, "alerts">): AlertSettings {
  const r = Number(loc.alerts?.ratingBelow);
  return { on: loc.alerts?.on !== false, ratingBelow: Number.isFinite(r) && r > 1 && r <= 5 ? Math.round(r * 10) / 10 : null };
}

const val = (r: number | null | undefined) => Math.min(r ?? MAX_DEPTH + 1, MAX_DEPTH + 1);
const share = (s: Pick<ScanResult, "top3" | "read">) => (s.read ? (s.top3 / s.read) * 100 : 0);

/** Two scans drawn on the same grid, so their points can be compared. */
export function sameGrid(a: Pick<ScanResult, "size" | "spacing" | "shape" | "center">, b: Pick<ScanResult, "size" | "spacing" | "shape" | "center">) {
  const c = (x: typeof a) => (x.center ? `${x.center.lat.toFixed(5)},${x.center.lng.toFixed(5)}` : "");
  return (a.size ?? 7) === (b.size ?? 7) && Number(a.spacing) === Number(b.spacing) && (a.shape ?? "square") === (b.shape ?? "square") && c(a) === c(b);
}

/**
 * A rank drop between a scan and the one before on the same grid: the average rank 2 or more worse, or the top 3 share
 * down 15 points or more. `points` are the grid points that got worse, to read again before any alert goes out.
 */
export function rankDrop(now: ScanResult, before: ScanResult): { avg: { now: number; before: number } | null; top3: { now: number; before: number }; points: number[] } | null {
  if (!sameGrid(now, before) || !now.read || !before.read) return null;
  const avgWorse = now.avg !== null && before.avg !== null && now.avg - before.avg >= 2;
  const shareWorse = share(before) - share(now) >= 15;
  if (!avgWorse && !shareWorse) return null;
  const was = new Map(before.points.filter((p) => !p.error).map((p) => [p.i, p.rank]));
  const points = now.points.filter((p) => !p.error && was.has(p.i) && val(p.rank) > val(was.get(p.i))).map((p) => p.i);
  if (!points.length) return null;
  return { avg: now.avg !== null && before.avg !== null ? { now: now.avg, before: before.avg } : null, top3: { now: Math.round(share(now)), before: Math.round(share(before)) }, points };
}

/**
 * Whether reading the dropped points again agrees: at least half of them answered, and at least half of those are
 * still worse than in the scan before. Otherwise the drop was a one-read blip and no alert goes out.
 */
export function dropConfirmed(points: number[], before: Pick<PointResult, "i" | "rank" | "error">[], again: Record<string, number | null | undefined>): boolean {
  const was = new Map(before.filter((p) => !p.error).map((p) => [p.i, p.rank]));
  const read = points.filter((i) => again[String(i)] !== undefined);
  if (!points.length || read.length * 2 < points.length) return false;
  const worse = read.filter((i) => val(again[String(i)]) > val(was.get(i))).length;
  return worse * 2 >= read.length;
}

const rivalKey = (r: Pick<Rival, "cid" | "title">) => r.cid || r.title.toLowerCase();

/** Competitors now in the top 3 at 5 points or more that weren't in the scan before. A first scan has none. */
export function newRivals(now: ScanResult, before: ScanResult | null): Rival[] {
  if (!before || !before.read) return [];
  const had = new Map(before.rivals.map((r) => [rivalKey(r), r.top3]));
  return now.rivals.filter((r) => r.top3 >= 5 && (had.get(rivalKey(r)) ?? 0) < 5);
}

/** The Google rating crossed below the level set: it was at or above it on the read before, and is below it now. */
export function ratingCrossed(now: number | null, before: number | null, level: number | null): boolean {
  return level !== null && now !== null && before !== null && before >= level && now < level;
}

/** The alerts a finished Maps scan raises (the rank drop waits for its second read). */
export function scanAlerts(scanId: string, now: ScanResult, before: ScanResult | null): { drop: ReturnType<typeof rankDrop>; alerts: LocalAlert[] } {
  const drop = before ? rankDrop(now, before) : null;
  const alerts = newRivals(now, before).map((r) => ({
    kind: "new_rival" as const,
    key: `new_rival:${now.keyword}:${rivalKey(r)}:${scanId}`,
    title: `${r.title} is in the top 3 for “${now.keyword}”`,
    detail: `In the map pack's top 3 at ${r.top3} of ${now.read} points${r.rating !== null ? `, rated ${r.rating} from ${r.reviews ?? 0} reviews` : ""}.`,
  }));
  return { drop, alerts };
}

/** The rank drop alert, once the second read agrees. */
export function dropAlert(scanId: string, keyword: string, d: NonNullable<ReturnType<typeof rankDrop>>): LocalAlert {
  const parts = [d.avg ? `Average rank ${d.avg.before} to ${d.avg.now}` : "", d.top3.before !== d.top3.now ? `top 3 share ${d.top3.before}% to ${d.top3.now}%` : ""].filter(Boolean);
  return {
    kind: "rank_drop",
    key: `rank_drop:${keyword}:${scanId}`,
    title: `Rank drop for “${keyword}”`,
    detail: `${parts.join(", ")}. Worse at ${d.points.length} ${d.points.length === 1 ? "point" : "points"}, read twice.`,
  };
}

/** A confirmed change Google made to the listing. One alert per field and new value. */
export function changeAlert(c: Change): LocalAlert {
  return { kind: "profile_change", key: `profile_change:${c.field}:${c.now.slice(0, 200)}`, title: `${c.label} changed on Google`, detail: `Was “${c.before.slice(0, 200)}”, now “${c.now.slice(0, 200)}”.` };
}

/** A new 1 or 2 star review of the business. */
export function reviewAlert(r: { cid: string; review_id: string; rating: number; author: string | null; text: string | null }): LocalAlert {
  const quote = (r.text ?? "").replace(/\s+/g, " ").trim();
  return {
    kind: "bad_review",
    key: `bad_review:${r.cid}:${r.review_id}`,
    title: `New ${r.rating} star review${r.author ? ` from ${r.author}` : ""}`,
    detail: quote ? `“${quote.length > 240 ? `${quote.slice(0, 239)}…` : quote}”` : "Rating only, no text.",
  };
}

export function ratingAlert(now: number, level: number, readAt: string): LocalAlert {
  return { kind: "rating_low", key: `rating_low:${readAt}`, title: `Your Google rating fell to ${now}`, detail: `Below the ${level} you set.` };
}
