// Comparing a scan with the one before it: the recheck rule and the alerts.

import { NOT_FOUND, type Summary } from "./metrics.ts";

/** A pin that moves more than this many spots since the last scan is searched again before it counts. */
export const RECHECK_JUMP = 5;
/** Average rank (over every pin) worse by more than this raises an alert. */
export const AVG_DROP = 2;

const r = (rank: number | null) => rank ?? NOT_FOUND;

/** Should this pin be searched again? Only when a previous scan had the same pin and the jump is big. */
export function needsRecheck(prev: number | null | undefined, next: number | null): boolean {
  if (prev === undefined) return false;
  return Math.abs(r(prev) - r(next)) > RECHECK_JUMP;
}

export type AlertDraft = { kind: "avg_drop" | "top3_lost" | "pack_lost"; message: string };

export function alertsFor(keyword: string, prev: Summary | null, curr: Summary): AlertDraft[] {
  if (!prev || !prev.maps.done || !curr.maps.done || prev.pins !== curr.pins) return [];
  const out: AlertDraft[] = [];
  if (prev.maps.avg_all != null && curr.maps.avg_all != null && curr.maps.avg_all - prev.maps.avg_all > AVG_DROP) {
    out.push({ kind: "avg_drop", message: `Average Maps rank for "${keyword}" went from ${prev.maps.avg_all} to ${curr.maps.avg_all}.` });
  }
  if (curr.maps.top3 < prev.maps.top3) {
    const lost = prev.maps.top3 - curr.maps.top3;
    out.push({ kind: "top3_lost", message: `${lost} ${lost === 1 ? "pin" : "pins"} left the top 3 for "${keyword}" (${prev.maps.top3} to ${curr.maps.top3} of ${curr.pins}).` });
  }
  if (prev.pack.done && curr.pack.done && curr.pack.in_pack < prev.pack.in_pack) {
    out.push({ kind: "pack_lost", message: `In the Local Pack at ${curr.pack.in_pack} of ${curr.pins} pins for "${keyword}", down from ${prev.pack.in_pack}.` });
  }
  return out;
}

/** Per-pin change in Maps rank: positive means better (moved up). Null when either side is missing. */
export function pinChange(prev: number | null | undefined, next: number | null | undefined): number | null {
  if (prev === undefined || next === undefined) return null;
  if (prev == null && next == null) return 0;
  return r(prev) - r(next);
}
