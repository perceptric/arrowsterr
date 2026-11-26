// The Writer (Plan & Create › Writer): which Calendar pieces to write next, and when Autopilot runs. Pure, so tests
// cover the ranking and the schedule. zippieWriter.ts and the worker read the database and call these.

export type PickInput = {
  id: string;
  keyword: string;
  volume: number | null;
  difficulty: number | null;
  stage: string | null;
  due_date: string | null;
  status: string;
  /** True when the piece already has an outline or a draft. */
  written: boolean;
};
export type Pick = { item_id: string; keyword: string; volume: number | null; kd: number | null; due: string | null; why: string; score: number };

const STAGE: Record<string, number> = { bofu: 1.4, mofu: 1.15, tofu: 1 };
const DAY = 86_400_000;
const daysUntil = (due: string, today: string) => Math.round((Date.parse(`${due}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / DAY);
const short = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/**
 * The pieces worth writing next, best first: not written yet and not published. The score weighs searches (on a log
 * scale, so one huge keyword doesn't drown the rest), how easy the keyword is to rank for, the funnel stage (pieces
 * that bring buyers first) and how soon the piece is due. Each pick says why in a few words.
 */
export function rankPicks(items: PickInput[], today: string, n = 3): Pick[] {
  return items
    .filter((i) => !i.written && i.status !== "published" && i.keyword.trim())
    .map((i) => {
      const volume = Math.max(0, i.volume ?? 0);
      const ease = i.difficulty === null || i.difficulty === undefined ? 0.6 : Math.max(0.15, (100 - Math.min(100, i.difficulty)) / 100);
      const stage = STAGE[i.stage ?? ""] ?? 1;
      const days = i.due_date ? daysUntil(i.due_date, today) : null;
      const soon = days === null ? 1 : days < 0 ? 1.4 : days <= 7 ? 1.3 : days <= 30 ? 1.1 : 1;
      const score = Math.log10(volume + 10) * ease * stage * soon;
      const why = [
        i.difficulty !== null && i.difficulty !== undefined && i.difficulty < 30 ? "Easy to rank" : i.difficulty !== null && i.difficulty !== undefined && i.difficulty >= 60 ? "Hard to rank" : "",
        volume ? `${volume.toLocaleString("en-US")} searches a month` : "",
        i.stage === "bofu" ? "brings buyers" : "",
        days === null ? "" : days < 0 ? `overdue since ${short(i.due_date!)}` : `due ${short(i.due_date!)}`,
      ].filter(Boolean);
      const text = why.join(", ");
      return { item_id: i.id, keyword: i.keyword, volume: i.volume, kd: i.difficulty, due: i.due_date, why: text ? text[0].toUpperCase() + text.slice(1) : "On your Calendar", score: Math.round(score * 1000) / 1000 };
    })
    .sort((a, b) => b.score - a.score || (b.volume ?? 0) - (a.volume ?? 0))
    .slice(0, Math.max(1, Math.min(10, n)));
}

// ─────────────── Autopilot ───────────────
/** A brand's Autopilot, kept in sites.profile.autopilot. `by` is who turned it on: the runs start as them. */
/** `after`: what happens to a finished draft: it waits in Drafts, goes to the brand's site as a draft, or goes live on its Calendar date. */
export type Autopilot = { on: boolean; cadence: "daily" | "weekdays"; hour: number; count: number; stop: "outline" | "draft"; after: "keep" | "draft" | "live"; by?: string | null; lastRun?: string | null; threadId?: string | null };
export const AUTOPILOT_OFF: Autopilot = { on: false, cadence: "daily", hour: 8, count: 1, stop: "draft", after: "keep" };

/** A saved Autopilot, with every field checked. */
export function cleanAutopilot(x: unknown): Autopilot {
  const o = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
  const hour = Number(o.hour);
  const count = Number(o.count);
  return {
    on: o.on === true,
    cadence: o.cadence === "weekdays" ? "weekdays" : "daily",
    hour: Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : 8,
    count: Number.isInteger(count) && count >= 1 && count <= 3 ? count : 1,
    stop: o.stop === "outline" ? "outline" : "draft",
    after: o.after === "draft" || o.after === "live" ? o.after : "keep",
    by: typeof o.by === "string" ? o.by : null,
    lastRun: typeof o.lastRun === "string" ? o.lastRun : null,
    threadId: typeof o.threadId === "string" ? o.threadId : null,
  };
}

/** The date, hour and weekday in a time zone (UTC when the zone is unknown). */
export function localClock(now: Date, tz: string | null | undefined): { day: string; hour: number; weekday: number } {
  let zone = tz || "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
  } catch {
    zone = "UTC";
  }
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23", weekday: "short" }).formatToParts(now).map((p) => [p.type, p.value]));
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.weekday);
  return { day: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour), weekday };
}

/** True when Autopilot should run now: it's on, today is a run day, its hour has come, and it hasn't run today. */
export function autopilotDue(a: Autopilot, now: Date, tz: string | null | undefined): { due: boolean; day: string } {
  const c = localClock(now, tz);
  const workday = c.weekday >= 1 && c.weekday <= 5;
  const due = a.on && Boolean(a.by) && (a.cadence === "daily" || workday) && c.hour >= a.hour && a.lastRun !== c.day;
  return { due, day: c.day };
}

/** "8:00 AM", for the Writer's Autopilot button. */
export const hourLabel = (h: number) => `${h % 12 === 0 ? 12 : h % 12}:00 ${h < 12 ? "AM" : "PM"}`;

// ─────────────── the Writer's cards in Zippie ───────────────
/** A card under Zippie's reply: the top picks with Write buttons, or one piece that updates as the writer works. */
export type WriterCard =
  | { view: "picks"; brand: string; picks: Pick[] }
  | { view: "piece"; item_id: string; keyword: string }
  /** A finished piece ready to send out: Publish opens the Publish panel, where the person picks the site, draft or live and the date. */
  | { view: "publish"; item_id: string; keyword: string }
  /** Changes to a saved draft's text, applied only when the person presses Apply (draftEdits.ts). A refresh adds `refresh`. */
  | { view: "revise"; doc_id: string; title: string; edits: { find: string; replace: string; why?: string }[]; refresh?: RefreshInfo }
  /** A change to an outline's sections asked for in chat: the headings before and after, applied only on Apply (editSections in writerBrief.ts). */
  | { view: "outline_edit"; item_id: string; keyword: string; brief_id: string; before: string[]; sections: OutlineSection[]; why?: string };

/**
 * A refresh of a live page (pageRefreshServer.ts): the sections kept because they still rank, the ones rewritten,
 * new sections for searches no section answers, and a new SEO title and meta description when the click rate is weak.
 */
export type RefreshInfo = {
  item_id: string;
  url: string;
  keep: string[];
  rewrite: string[];
  add: { h2: string; paragraphs: string[]; why?: string }[];
  seo: { title: string; description: string; why?: string } | null;
};

/** One section in an outline edit: the old section it keeps (its index), or none for a new one; its heading and subheadings. */
export type OutlineSection = { from: number | null; h2: string; h3?: string[] };

/** Where one piece stands, for its card and for writing_status. */
export type PieceStatus = {
  item_id: string;
  keyword: string;
  /** For the Publish panel: the brand's site and brand. */
  site_id: string;
  brand_id: string | null;
  outline: {
    /** The outline's id, for edits from its card (/api/agentic-writer "edit"). */
    brief_id: string;
    status: string;
    busy: boolean;
    error: string | null;
    title: string | null;
    words: number | null;
    /** Each section's planned blocks: `id` is what removeModules takes. */
    headings: { h2: string; searches_a_month: number | null; subheadings: string[]; blocks: { id: string; label: string }[] }[];
  } | null;
  draft: { status: string; busy: boolean; error: string | null; words: number | null; doc_id: string | null } | null;
};
