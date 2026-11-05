import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Run } from "./chats";
import { listRuns } from "./db";
import { emailReady, sendBuilt } from "./email";
import type { Email } from "./emailKit";
import { alertEmail, weeklyEmail, type AlertData, type Footer, type WeeklyBrand } from "./emails";
import { entitlement } from "./entitlements";
import { brandStats, promptMoves } from "./metrics";
import { weekOf, type Metric } from "./visibility";

// Notification emails people choose in Settings → Notifications (supabase/035_notifications.sql):
//   weekly: a Monday summary of each brand's AI visibility,
//   alerts: visibility moved by the alert size, or a competitor overtook a brand (Pro and up),
//   jobs:   a Content Plan or a brief finished or failed, sent to the person who started it.
// Every email carries a one-click unsubscribe link for its kind. What each email says: src/lib/emails.ts.

export type Kind = "weekly" | "alerts" | "jobs";
export const KINDS: Record<Kind, string> = {
  weekly: "the weekly summary",
  alerts: "visibility alerts",
  jobs: "Content Plan and brief updates",
};

const app = () => process.env.APP_URL?.trim().replace(/\/+$/, "") || "https://app.arrowsterr.com";
const secret = () => process.env.CRON_SECRET?.trim() || process.env.SUPABASE_SECRET_KEY?.trim() || "";
const DAY = 864e5;

/** A signature for an unsubscribe link, so nobody can turn off someone else's emails. */
function sign(user: string, ws: string, kind: Kind) {
  return createHmac("sha256", secret()).update(`${user}.${ws}.${kind}`).digest("base64url").slice(0, 32);
}

export function signedOk(user: string, ws: string, kind: string, sig: string) {
  if (!secret() || !(kind in KINDS)) return false;
  const want = Buffer.from(sign(user, ws, kind as Kind));
  const got = Buffer.from(sig);
  return want.length === got.length && timingSafeEqual(want, got);
}

export const unsubscribeUrl = (user: string, ws: string, kind: Kind) => `${app()}/api/notifications/unsubscribe?u=${user}&w=${ws}&k=${kind}&s=${sign(user, ws, kind)}`;

type Person = { user_id: string; email: string };

/** Members who get this kind of email: everyone, minus those who turned it off. Narrowed to `only` when given. */
async function recipients(db: SupabaseClient, ws: string, kind: Kind, only?: string[]): Promise<Person[]> {
  let q = db.from("workspace_members").select("user_id, email").eq("workspace_id", ws);
  if (only) q = q.in("user_id", only);
  const { data: members } = await q;
  const { data: prefs, error } = await db.from("notification_prefs").select(`user_id, ${kind}`).eq("workspace_id", ws);
  // Before 035_notifications.sql there are no choices yet, so everyone gets everything.
  const off = new Set(error ? [] : ((prefs ?? []) as unknown as Record<string, unknown>[]).filter((p) => p[kind] === false).map((p) => String(p.user_id)));
  return ((members ?? []) as Person[]).filter((m) => m.email && !off.has(m.user_id));
}

/** Send one email per person, each with their own unsubscribe link. Returns how many went out. */
async function sendEach(people: Person[], ws: string, kind: Kind, build: (footer: Footer) => Email) {
  let sent = 0;
  for (const p of people) {
    const url = unsubscribeUrl(p.user_id, ws, kind);
    const footer: Footer = {
      text: `You get ${KINDS[kind]} for this workspace.`,
      links: [
        { label: "Unsubscribe", url },
        { label: "Choose your emails", url: `${app()}/settings/notifications` },
      ],
    };
    try {
      if (await sendBuilt([p.email], build(footer), { "List-Unsubscribe": `<${url}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" })) sent++;
    } catch (e) {
      console.error(`Email ${kind} to ${p.email} failed:`, e instanceof Error ? e.message : e);
    }
  }
  return sent;
}

/** Claim an email once per workspace, kind and period (email_log). False when it was already sent. */
async function claim(db: SupabaseClient, ws: string, kind: string, period: string) {
  const { error } = await db.from("email_log").insert({ workspace_id: ws, kind, period });
  return !error;
}

/** Runs whose UTC day is in [from, to). */
const between = (runs: Run[], from: string, to: string) => runs.filter((r) => r.at.slice(0, 10) >= from && r.at.slice(0, 10) < to);

// ─────────────── alerts ───────────────

/** Email the day's visibility alert for a brand. Called after the Slack alert, once per brand and day. */
export async function emailAlert(db: SupabaseClient, ws: string, brand: { id: string; name: string }, day: string, data: Omit<AlertData, "brand" | "day" | "url" | "lost"> & { prevDay: string }) {
  if (!emailReady() || !(await claim(db, ws, `alert:${brand.id}`, day))) return 0;
  const people = await recipients(db, ws, "alerts");
  if (!people.length) return 0;
  // The prompts the brand dropped out of since the check before. Optional: the alert still goes out without them.
  const runs = (await listRuns(db, brand.id, 4).catch(() => [])) as Run[];
  const next = new Date(Date.parse(`${day}T00:00:00Z`) + DAY).toISOString().slice(0, 10);
  const { lost } = promptMoves(between(runs, day, next), between(runs, data.prevDay, day), brand.name);
  const mail: AlertData = { ...data, brand: brand.name, day: new Date(`${day}T12:00:00Z`), lost, url: `${app()}/prompts?brand=${brand.id}` };
  return sendEach(people, ws, "alerts", (footer) => alertEmail(mail, footer));
}

// ─────────────── jobs ───────────────

/** Tell the person who started a Content Plan or a brief that it finished or failed. */
export async function emailJob(db: SupabaseClient, ws: string, userId: string | null | undefined, build: (footer: Footer) => Email) {
  if (!userId || !emailReady()) return 0;
  const people = await recipients(db, ws, "jobs", [userId]);
  return sendEach(people, ws, "jobs", build);
}

// ─────────────── weekly summary ───────────────

/** The local weekday (0 Sunday), hour and date in a time zone. */
function localNow(tz: string | null) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: tz || "UTC", weekday: "short", hour: "numeric", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit" })
      .formatToParts(new Date())
      .map((p) => [p.type, p.value]),
  );
  return { weekday: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.weekday), hour: Number(parts.hour), date: `${parts.year}-${parts.month}-${parts.day}` };
}

/** Position, sentiment and the prompts gained and lost this week, from the saved runs. Empty when they can't load. */
async function weekDetail(db: SupabaseClient, brand: { id: string; name: string; domain: string | null }, today: string) {
  const start = new Date(Date.parse(`${today}T00:00:00Z`) - 7 * DAY).toISOString().slice(0, 10);
  const prevStart = new Date(Date.parse(`${today}T00:00:00Z`) - 14 * DAY).toISOString().slice(0, 10);
  try {
    const runs = (await listRuns(db, brand.id, 16)) as Run[];
    const now = between(runs, start, today);
    const before = between(runs, prevStart, start);
    const me = brandStats(now.flatMap((r) => r.chats), { name: brand.name, domain: brand.domain ?? "" }).find((s) => s.isYou);
    const { gained, lost } = promptMoves(now, before, brand.name);
    return { position: me?.position ?? null, sentiment: me?.sentiment ?? null, gained, lost };
  } catch (e) {
    console.error(`Weekly detail for ${brand.name} failed:`, e instanceof Error ? e.message : e);
    return {};
  }
}

/**
 * Monday from 8am in each workspace's time zone (Settings → General), once per week: the summary for every brand
 * with answers in the last 7 days. Runs about hourly from the worker and the cron.
 */
export async function sendWeekly(db: SupabaseClient) {
  if (!emailReady()) return { sent: 0 };
  let { data: list, error } = await db.from("workspaces").select("id, name, timezone");
  // Before 034_settings.sql there is no time zone. Use UTC.
  if (error) ({ data: list, error } = await db.from("workspaces").select("id, name"));
  if (error) throw new Error(error.message);
  let sent = 0;
  for (const w of (list ?? []) as { id: string; name: string; timezone?: string | null }[]) {
    let local;
    try {
      local = localNow(w.timezone ?? null);
    } catch {
      local = localNow(null);
    }
    if (local.weekday !== 1 || local.hour < 8) continue;
    const e = await entitlement(w.id);
    if (e.readOnly) continue;
    const { data: brands } = await db.from("brands").select("id, name, domain").eq("workspace_id", w.id).order("created_at");
    if (!brands?.length) continue;
    if (!(await claim(db, w.id, "weekly", local.date))) continue;

    const since = new Date(Date.parse(`${local.date}T00:00:00Z`) - 14 * DAY).toISOString().slice(0, 10);
    const weeks: (WeeklyBrand & { id: string })[] = [];
    for (const b of brands as { id: string; name: string; domain: string | null }[]) {
      const { data: rows } = await db.from("daily_metrics").select("day, engine, named, is_you, answers, mentions").eq("brand_id", b.id).gte("day", since).lt("day", local.date);
      const week = weekOf((rows ?? []) as Metric[], local.date);
      if (!week) continue;
      weeks.push({ id: b.id, name: b.name, ...week, ...(await weekDetail(db, b, local.date)) });
    }
    if (!weeks.length) continue;
    const people = await recipients(db, w.id, "weekly");
    const to = new Date(Date.parse(`${local.date}T12:00:00Z`) - DAY);
    const from = new Date(to.getTime() - 6 * DAY);
    const url = weeks.length === 1 ? `${app()}/prompts?brand=${weeks[0].id}` : `${app()}/prompts`;
    sent += await sendEach(people, w.id, "weekly", (footer) => weeklyEmail({ workspace: w.name, from, to, brands: weeks, url, appUrl: app() }, footer));
  }
  return { sent };
}
