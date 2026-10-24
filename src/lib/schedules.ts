// Scheduled reports (docs/reports.md, section 32.4): when a schedule is due, what it may hold, and each step of a
// send. Pure, shared by the server, the browser and tests. The server and the worker do the reading and writing.
import { cleanParams, isAiPage, type AiPage, type PdfParams } from "./pdf/pages.ts";
import type { PdfDesign } from "./pdf/design.ts";

export type Cadence = "weekly" | "monthly";
export type When = { cadence: Cadence; weekday: number | null; monthday: number | null; hour: number; timezone: string };
export type ScheduleInput = When & { brandId: string; name: string; pages: AiPage[]; design: PdfDesign; params: PdfParams; recipients: string[]; subject: string | null };

export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
/** Months are short, so a monthly schedule picks day 1 to 28 and runs every month. */
export const MAX_MONTHDAY = 28;
export const MAX_RECIPIENTS = 25;
/** How long a send waits for its PDFs before it gives up. */
export const PDF_WAIT_MS = 30 * 60_000;

/** True when the time zone is one this computer knows, like Europe/London. */
export function validZone(tz: string) {
  if (!tz || tz.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** The wall clock in a time zone at instant t. */
function wall(t: number, tz: string) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric", weekday: "short" }).formatToParts(new Date(t));
  const n = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const wd = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.find((p) => p.type === "weekday")?.value ?? "");
  return { y: n("year"), m: n("month"), d: n("day"), h: n("hour") % 24, min: n("minute"), s: n("second"), wd };
}

/** How far the zone's clock is ahead of UTC at instant t, in ms. */
function offsetAt(t: number, tz: string) {
  const w = wall(t, tz);
  return Date.UTC(w.y, w.m - 1, w.d, w.h, w.min, w.s) - Math.floor(t / 1000) * 1000;
}

/**
 * The instant a zone's clock reads y-m-d h:00. When the clocks jump forward past that hour, the first instant after
 * the jump; when they fall back and the hour happens twice, the first one.
 */
export function zonedTime(y: number, m: number, d: number, h: number, tz: string) {
  const guess = Date.UTC(y, m - 1, d, h);
  // The zone's offset half a day before and after: one of them is right unless the clocks change at that hour.
  const ts = [...new Set([guess - offsetAt(guess - 43_200_000, tz), guess - offsetAt(guess + 43_200_000, tz)])].sort((a, b) => a - b);
  const hit = ts.find((t) => {
    const w = wall(t, tz);
    return w.y === y && w.m === m && w.d === d && w.h === h;
  });
  // No match means the hour was skipped: the old offset lands just after the jump.
  return hit ?? ts[ts.length - 1];
}

/** The next time a schedule is due, strictly after `after`. Weekly: that weekday. Monthly: that day of the month. */
export function nextRun(w: When, after: Date | number): Date {
  const from = typeof after === "number" ? after : after.getTime();
  const tz = validZone(w.timezone) ? w.timezone : "UTC";
  const start = wall(from, tz);
  // Walk day by day on the zone's calendar; a month is at most 31 days away.
  for (let i = 0; i < 40; i++) {
    const day = new Date(Date.UTC(start.y, start.m - 1, start.d + i));
    const y = day.getUTCFullYear();
    const m = day.getUTCMonth() + 1;
    const d = day.getUTCDate();
    const ok = w.cadence === "weekly" ? day.getUTCDay() === (w.weekday ?? 1) : d === (w.monthday ?? 1);
    if (!ok) continue;
    const t = zonedTime(y, m, d, w.hour, tz);
    if (t > from) return new Date(t);
  }
  return new Date(from + 7 * 864e5);
}

/** "Every Monday at 9:00", "Monthly on the 1st at 14:00". */
export function whenLine(w: When) {
  const hour = `${String(w.hour).padStart(2, "0")}:00`;
  if (w.cadence === "weekly") return `Every ${WEEKDAYS[w.weekday ?? 1]} at ${hour}`;
  const n = w.monthday ?? 1;
  const th = n % 10 === 1 && n !== 11 ? "st" : n % 10 === 2 && n !== 12 ? "nd" : n % 10 === 3 && n !== 13 ? "rd" : "th";
  return `Monthly on the ${n}${th} at ${hour}`;
}

const EMAIL = /^[^\s@<>()[\],;:"]+@[^\s@<>()[\],;:"]+\.[a-z]{2,}$/i;

/** Email addresses from a pasted list: commas, spaces or new lines, lowercased, no repeats. */
export function recipientList(x: unknown): { emails: string[]; bad: string[] } {
  const raw = Array.isArray(x) ? x.map(String) : String(x ?? "").split(/[\s,;]+/);
  const all = [...new Set(raw.map((e) => e.trim().toLowerCase()).filter(Boolean))];
  return { emails: all.filter((e) => EMAIL.test(e) && e.length <= 254), bad: all.filter((e) => !EMAIL.test(e) || e.length > 254) };
}

/** Clean a schedule someone saved. The error says what to fix. */
export function cleanSchedule(x: unknown, maxDays = 365): { value: ScheduleInput } | { error: string } {
  const o = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
  const brandId = typeof o.brandId === "string" ? o.brandId : "";
  if (!brandId) return { error: "Pick a brand." };
  const pages = [...new Set(Array.isArray(o.pages) ? o.pages.filter(isAiPage) : [])];
  if (!pages.length) return { error: "Pick at least one page." };
  const cadence: Cadence = o.cadence === "monthly" ? "monthly" : "weekly";
  const hour = Math.round(Number(o.hour));
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return { error: "Pick an hour." };
  const weekday = Math.round(Number(o.weekday));
  const monthday = Math.round(Number(o.monthday));
  if (cadence === "weekly" && !(weekday >= 0 && weekday <= 6)) return { error: "Pick a day of the week." };
  if (cadence === "monthly" && !(monthday >= 1 && monthday <= MAX_MONTHDAY)) return { error: `Pick a day from 1 to ${MAX_MONTHDAY}.` };
  const timezone = typeof o.timezone === "string" ? o.timezone.trim() : "";
  if (!validZone(timezone)) return { error: "Pick a time zone." };
  const { emails, bad } = recipientList(o.recipients);
  if (bad.length) return { error: `Check ${bad.length === 1 ? "this address" : "these addresses"}: ${bad.slice(0, 3).join(", ")}.` };
  if (!emails.length) return { error: "Add at least one email address." };
  if (emails.length > MAX_RECIPIENTS) return { error: `Up to ${MAX_RECIPIENTS} email addresses.` };
  const name = typeof o.name === "string" ? o.name.trim().replace(/\s+/g, " ").slice(0, 120) : "";
  const subject = typeof o.subject === "string" && o.subject.trim() ? o.subject.trim().replace(/\s+/g, " ").slice(0, 200) : null;
  return {
    value: {
      brandId,
      name: name || (cadence === "weekly" ? "Weekly report" : "Monthly report"),
      pages,
      design: o.design === "brand" ? "brand" : "arrowsterr",
      params: { ...cleanParams(o.params, maxDays), topic: null, model: null },
      cadence,
      weekday: cadence === "weekly" ? weekday : null,
      monthday: cadence === "monthly" ? monthday : null,
      hour,
      timezone,
      recipients: emails,
      subject,
    },
  };
}

/** Why a schedule can't be added or turned on, or null when it can. limit is the plan's number of schedules. */
export function scheduleProblem(activeOthers: number, limit: number): { error: string; limit: true } | null {
  if (limit <= 0) return { error: "Scheduled reports are on Starter and up.", limit: true };
  if (activeOthers >= limit) return { error: `Your plan has ${limit} active ${limit === 1 ? "schedule" : "schedules"}. Pause one, or upgrade.`, limit: true };
  return null;
}

// ─────────────── one send ───────────────

export type SendRow = { status: "working" | "sent" | "failed"; file_ids: string[]; created_at: string };
export type FileState = { status: "making" | "ready" | "failed"; error: string | null; jobDead?: boolean };
export type Step = { do: "done" } | { do: "make" } | { do: "wait" } | { do: "email" } | { do: "fail"; error: string };

/**
 * What a send does next. A send that already went out (or already failed) never does anything again, so a job
 * that runs twice can't email twice. Files are made once; the email waits until every PDF is ready.
 */
export function sendStep(send: SendRow, files: FileState[] | null, ok: { active: boolean; allowed: boolean; email: boolean }, now = Date.now()): Step {
  if (send.status !== "working") return { do: "done" };
  if (!ok.active) return { do: "fail", error: "The schedule was paused before this send." };
  if (!ok.allowed) return { do: "fail", error: "This plan has no scheduled reports." };
  if (!ok.email) return { do: "fail", error: "Email is not set up on the server." };
  if (!send.file_ids.length) return { do: "make" };
  if (!files || files.length < send.file_ids.length) return { do: "fail", error: "A PDF for this send was deleted." };
  const bad = files.find((f) => f.status === "failed" || f.jobDead);
  if (bad) return { do: "fail", error: bad.error || "A PDF failed." };
  if (files.some((f) => f.status === "making")) return now - Date.parse(send.created_at) > PDF_WAIT_MS ? { do: "fail", error: "The PDFs took too long." } : { do: "wait" };
  return { do: "email" };
}

/** The email provider's idempotency key for a send: a retry after a crash can never deliver it twice. */
export const sendKey = (sendId: string) => `report-send-${sendId}`;

/**
 * The scheduler's work for one tick: every active schedule due by now gets one send for its due time,
 * then moves to its next time after now. Missed times while the worker was down are sent once, not caught up.
 */
export function dueWork<S extends When & { id: string; next_run_at: string | null; active: boolean }>(schedules: S[], now: number) {
  return schedules
    .filter((s) => s.active && s.next_run_at && Date.parse(s.next_run_at) <= now)
    .map((s) => ({ schedule: s, dueAt: s.next_run_at!, next: nextRun(s, now).toISOString() }));
}
