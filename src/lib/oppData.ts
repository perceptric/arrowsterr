// Opportunities in the browser (docs/content-v3-plan.md, section 3): the plan's ideas with their cluster, score and
// reason, and the clusters themselves. Shared by the page and the tests.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Level } from "./clusters";
import { CAL_COLS, type CalendarItem } from "./db";
import { inWriterAt } from "./writerImport";

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

const OPP_COLS = `${CAL_COLS}, extra, cluster_id, cluster_role, score, chance, level, reason, reason_engine, ai_prompt, dismissed_at`;

export async function listOpportunities(sb: SupabaseClient, siteId: string): Promise<{ items: OppItem[]; clusters: OppCluster[] }> {
  const [items, clusters] = await Promise.all([
    sb.from("calendar_items").select(OPP_COLS).eq("site_id", siteId).order("created_at"),
    sb.from("content_clusters").select("id, name, theme, pillar, score, position, updates").eq("site_id", siteId).is("archived_at", null).order("position"),
  ]);
  if (items.error) throw new Error(/cluster_id|dismissed_at|content_clusters/.test(items.error.message) ? "Opportunities need supabase/082_opportunities.sql." : items.error.message);
  if (clusters.error) throw new Error(/content_clusters/.test(clusters.error.message) ? "Opportunities need supabase/082_opportunities.sql." : clusters.error.message);
  return { items: (items.data ?? []) as unknown as OppItem[], clusters: (clusters.data ?? []) as OppCluster[] };
}

export type OppState = "new" | "calendar" | "drafts" | "published" | "dismissed";
export const OPP_STATES: Record<OppState, { label: string; tone: string }> = {
  new: { label: "New", tone: "aw-status--pending" },
  calendar: { label: "On calendar", tone: "aw-status--ranked" },
  drafts: { label: "In Drafts", tone: "aw-badge" },
  published: { label: "Published", tone: "aw-status--ranked" },
  dismissed: { label: "Dismissed", tone: "aw-status--pending" },
};

/** Where an idea is now: published, in Drafts, on the calendar with a date, dismissed, or new. */
export function oppState(i: Pick<OppItem, "status" | "due_date" | "dismissed_at" | "extra">): OppState {
  if (i.status === "published") return "published";
  if (inWriterAt(i) || i.status === "brief" || i.status === "writing" || i.status === "review") return "drafts";
  if (i.dismissed_at) return "dismissed";
  if (i.due_date) return "calendar";
  return "new";
}

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

/** Ideas that belong on Opportunities: everything except pieces already published long ago with no cluster. */
export function isOpportunity(i: OppItem): boolean {
  return Boolean(i.cluster_id) || i.status !== "published";
}
