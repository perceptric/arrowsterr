// Scheduled publishing for every site but WordPress (docs/drafts-plan.md, 3.2). Schedule sends the article as a
// draft right away, so it's there with its id, then a cms_publish job puts it live at the time with the article as it
// is then. Pure, so tests can cover it; the database and the CMS calls come in as deps.
import type { Published } from "./cmsTypes";

export type ScheduleDeps = {
  /** The draft's record for this site, as saved on the doc. */
  record(): Promise<Published | null>;
  /** Send the saved article live to the same post or item. */
  goLive(id: string): Promise<{ id: string; url: string | null }>;
  save(rec: Published): Promise<void>;
  /** The piece is published: the calendar, the alert. */
  published(rec: Published): Promise<void>;
  now?: () => Date;
};

/** One job per draft, site and time. A new time makes a new key, and the old job finds it no longer matches. */
export const cmsScheduleKey = (docId: string, connectionId: string, at: string) => `cms:${docId}:${connectionId}:${at}`;

/**
 * Put a scheduled article live. Skipped when the schedule changed or was cleared since the job was queued, or the
 * article already went live, so a job that runs twice never publishes twice. A failure throws and leaves the record
 * as it was, so the queue tries again.
 */
export async function runCmsSchedule(deps: ScheduleDeps, at: string): Promise<"published" | "skipped"> {
  const rec = await deps.record();
  if (!rec || rec.scheduledFor !== at || rec.live) return "skipped";
  const out = await deps.goLive(rec.id);
  const next: Published = { ...rec, id: out.id || rec.id, url: out.url ?? rec.url, live: true, at: (deps.now?.() ?? new Date()).toISOString() };
  delete next.scheduledFor;
  await deps.save(next);
  await deps.published(next);
  return "published";
}

/** What a Publish asks for, once the time is checked: a time already gone publishes now. */
export function publishPlan(mode: unknown, scheduleAt: unknown, now: Date): { live: boolean; at: string | null } | { error: string } {
  if (mode === "schedule") {
    const t = Date.parse(String(scheduleAt ?? ""));
    if (!Number.isFinite(t)) return { error: "Pick a date and time to publish." };
    if (t <= now.getTime() + 60_000) return { live: true, at: null };
    return { live: false, at: new Date(t).toISOString() };
  }
  return { live: mode === "publish", at: null };
}
