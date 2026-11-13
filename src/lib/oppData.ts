// Opportunities in the browser (docs/content-v3-plan.md, section 3): the plan's ideas with their cluster, score and
// reason, and the clusters themselves. Shared by the page and the tests.

import type { Level } from "./clusters";
import type { CalendarItem } from "./db";

export type OppItem = CalendarItem & {
  cluster_id: string | null;
  cluster_role: "pillar" | "page" | null;
  score: number | null;
  chance: number | null;
  level: Level | null;
  reason: string | null;
  reason_engine: string | null;
  ai_prompt: string | null;
  dismissed_at: string | null;
};
export type OppCluster = { id: string; name: string; theme: string | null; pillar: string | null; score: number; position: number; updates: boolean };

export const LEVELS: Record<Level, { label: string; tone: string; rank: number }> = {
  high: { label: "High", tone: "aw-status--ranked", rank: 3 },
  medium: { label: "Medium", tone: "aw-status--warn", rank: 2 },
  low: { label: "Low", tone: "aw-status--pending", rank: 1 },
};
export const STAGE_LABEL: Record<"bofu" | "mofu" | "tofu", string> = { bofu: "Buy", mofu: "Compare", tofu: "Learn" };

/** The group a row sits in on the sheet: its cluster, or "other" for rows from before clusters or added by hand. */
export const OTHER_GROUP = "other";
export function groupOf(i: Pick<OppItem, "cluster_id">, clusters: Set<string>): string {
  return i.cluster_id && clusters.has(i.cluster_id) ? i.cluster_id : OTHER_GROUP;
}
