import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Chat } from "./chats";
import { flatPrompts, listRuns, topicsOf, type Brand } from "./db";
import type { EmailExtra } from "./email";
import { appUrl, type Email } from "./emailKit";
import { contentPlanEmail, firstLookEmail, helpEmail, noBrandEmail, promptsEmail, trialOverEmail, upgradeEmail, welcomeEmail, winBackEmail, type Footer, type Sign } from "./emails";
import { ENGINES } from "./engines";
import { entitlement } from "./entitlements";
import { brandStats } from "./metrics";
import { emailTips } from "./notify";
import { isPartnerBrand } from "./partnerBrand";
import { listOf, pickStep, promptIdeas, type NurtureStep } from "./nurturePlan";
import { PLANS, type Plan, type PlanId } from "./plans";
import { weekOf, type Metric } from "./visibility";

// Getting-started emails for a new workspace's first weeks, sent to the person who made it. Which one goes out
// when: src/lib/nurturePlan.ts. The words: src/lib/emails.ts. Runs about hourly with the other nudges.
//
// Settings (all optional):
//   NURTURE_START       only workspaces made on or after this time get them (default 2026-11-19), so older ones never do
//   NURTURE_SIGN_NAME   a person's name to sign the welcome and help emails and send them from ("Sam at Arrowsterr")
//   NURTURE_SIGN_ROLE   the line under that name (default "Arrowsterr")
//   NURTURE_REPLY_TO    where replies go (default support@arrowsterr.com)
//   NURTURE_OFF=1       stops them

const HOUR = 36e5;
const DAY = 864e5;
const WINBACK_EVERY = 90 * DAY;

const start = () => process.env.NURTURE_START?.trim() || "2026-11-19T00:00:00Z";
const signer = (): Sign | null => {
  const name = process.env.NURTURE_SIGN_NAME?.trim();
  return name ? { name, role: process.env.NURTURE_SIGN_ROLE?.trim() || "Arrowsterr" } : null;
};
const sendExtra = (personal: boolean): EmailExtra => {
  const s = signer();
  return { replyTo: process.env.NURTURE_REPLY_TO?.trim() || "support@arrowsterr.com", ...(personal && s ? { fromName: `${s.name} at Arrowsterr` } : {}) };
};

type Ws = { id: string; name: string; plan: PlanId; trial_ends_at: string | null; created_by: string; created_at: string; timezone?: string | null };
type BrandRow = Pick<Brand, "id" | "name" | "domain" | "prompts" | "topics"> & { profile: Record<string, unknown> | null };

function hourIn(tz: string | null | undefined) {
  try {
    return Number(new Intl.DateTimeFormat("en-US", { timeZone: tz || "UTC", hour: "numeric", hourCycle: "h23" }).format(new Date()));
  } catch {
    return new Date().getUTCHours();
  }
}

const promptsOf = (b: BrandRow) => flatPrompts(topicsOf({ prompts: b.prompts ?? [], topics: b.topics ?? [] }));
const topicNames = (b: BrandRow) => [...(b.topics ?? []).map((t) => t?.name).filter((t): t is string => Boolean(t)), ...listOf(b.profile?.products)];

/** The plans compared in the trial-over email: what the trial had, what Free has, and Starter. */
function planRows(cols: Plan[]) {
  const engines = (p: Plan) => (p.engines ? String(p.engines.length) : `All ${ENGINES.length}`);
  return [
    { label: "AIs checked", values: cols.map(engines) },
    { label: "How often", values: cols.map((p) => (p.checkEvery === 1 ? "Daily" : p.checkEvery === 7 ? "Weekly" : `Every ${p.checkEvery} days`)) },
    { label: "Prompts", values: cols.map((p) => String(p.prompts)) },
    { label: "Competitors", values: cols.map((p) => String(p.competitors)) },
    { label: "Days of history", values: cols.map((p) => String(p.historyDays)) },
    { label: "Content Plans a month", values: cols.map((p) => (p.plansPerMonth ? String(p.plansPerMonth) : "None")) },
  ];
}

/** The first answers: share of answers per brand, and one answer to show, preferring one that skipped the brand. */
function firstLook(chats: Chat[], brand: BrandRow) {
  const answered = chats.filter((c) => !c.error && (c.answered || c.text) && c.shown !== false);
  if (!answered.length) return null;
  const stats = brandStats(answered, { name: brand.name, domain: brand.domain ?? "" });
  const me = stats.find((s) => s.isYou);
  const top = stats.filter((s) => !s.isYou && s.mentions > 0).slice(0, 4).map((s) => ({ name: s.name, visibility: s.visibility }));
  const same = (n: string) => n.trim().toLowerCase() === brand.name.trim().toLowerCase();
  const withBrands = answered.filter((c) => c.brands.length >= 2);
  const pick = withBrands.find((c) => !c.brands.some((b) => same(b.name))) ?? withBrands.find((c) => c.brands.some((b) => same(b.name)));
  const example = pick
    ? { engine: pick.engine, prompt: pick.prompt, names: [...pick.brands].sort((a, b) => a.position - b.position).map((b) => b.name), youNamed: pick.brands.some((b) => same(b.name)) }
    : null;
  return { visibility: me?.visibility ?? 0, answers: answered.length, top, example };
}

async function metrics(db: SupabaseClient, brandId: string, days: number) {
  const since = new Date(Date.now() - days * DAY).toISOString().slice(0, 10);
  const { data } = await db.from("daily_metrics").select("day, engine, named, is_you, answers, mentions").eq("brand_id", brandId).gte("day", since);
  return (data ?? []) as Metric[];
}

/** Build the email for one step, or null when there's nothing worth sending (no answers yet, say). */
async function build(db: SupabaseClient, step: NurtureStep, w: Ws, ctx: { plan: Plan; brands: BrandRow[]; prompts: number; hasAnswers: boolean; contentPlans: number; lastSeen: Date | null }): Promise<((f: Footer) => Email) | null> {
  const app = appUrl();
  const brand = ctx.brands[0];
  const sign = signer();
  const onTrial = ctx.plan.id === "trial" && w.trial_ends_at ? new Date(w.trial_ends_at) : null;
  const today = new Date().toISOString().slice(0, 10);

  switch (step) {
    case "welcome": {
      const steps = [
        { title: "Make your workspace", done: true },
        { title: "Add your brand", done: ctx.brands.length > 0 },
        { title: "See your first answers", done: ctx.hasAnswers },
        { title: "Track 10 or more prompts", done: ctx.prompts >= 10 },
        { title: "Make a Content Plan", done: ctx.contentPlans > 0 },
      ];
      return (f) => welcomeEmail({ brand: brand?.name ?? null, steps, trialEnds: onTrial, url: brand ? `${app}/prompts?brand=${brand.id}` : `${app}/onboarding`, sign }, f);
    }
    case "nobrand":
      return (f) => noBrandEmail({ url: `${app}/onboarding`, sign }, f);
    case "firstlook": {
      if (!brand) return null;
      const runs = await listRuns(db, brand.id, 7).catch(() => []);
      const look = firstLook(runs.flatMap((r) => r.chats ?? []) as Chat[], brand);
      if (!look) return null;
      return (f) => firstLookEmail({ brand: brand.name, ...look, url: `${app}/prompts?brand=${brand.id}` }, f);
    }
    case "prompts": {
      if (!brand) return null;
      const existing = promptsOf(brand);
      const ideas = promptIdeas({ name: brand.name, topics: topicNames(brand), customers: typeof brand.profile?.customers === "string" ? brand.profile.customers : null, competitors: listOf(brand.profile?.competitors), existing, year: new Date().getUTCFullYear() });
      return (f) => promptsEmail({ brand: brand.name, count: existing.length, limit: ctx.plan.prompts, ideas, url: `${app}/prompts?brand=${brand.id}` }, f);
    }
    case "plan":
      if (!brand) return null;
      return (f) => contentPlanEmail({ brand: brand.name, site: brand.domain || brand.name, trialEnds: onTrial, url: `${app}/opportunities` }, f);
    case "trialover": {
      const cols = [PLANS.trial, PLANS.free, PLANS.foundation];
      return (f) => trialOverEmail({ workspace: w.name, cols: ["Trial", "Free", PLANS.foundation.name], rows: planRows(cols), pick: 2, price: PLANS.foundation.price, annual: PLANS.foundation.annual, url: `${app}/settings/billing`, stayUrl: `${app}/prompts` }, f);
    }
    case "upgrade": {
      if (!brand) return null;
      const engines = PLANS.free.engines ?? [...ENGINES];
      const week = weekOf(await metrics(db, brand.id, 14), today);
      const up = PLANS.foundation;
      return (f) =>
        upgradeEmail(
          { brand: brand.name, visibility: week?.visibility ?? null, prompts: ctx.prompts, promptLimit: PLANS.free.prompts, engines, missing: ENGINES.filter((e) => !engines.includes(e)), plan: { name: up.name, price: up.price, prompts: up.prompts, competitors: up.competitors }, url: `${app}/settings/billing` },
          f,
        );
    }
    case "help":
      return (f) => helpEmail({ brand: brand?.name ?? null, url: brand ? `${app}/prompts?brand=${brand.id}` : `${app}/onboarding`, sign }, f);
    case "winback": {
      if (!brand || !ctx.lastSeen) return null;
      const rows = await metrics(db, brand.id, 120);
      const seenDay = ctx.lastSeen.toISOString().slice(0, 10);
      const now = weekOf(rows, today);
      const then = weekOf(rows, seenDay);
      if (!now || !then) return null;
      return (f) => winBackEmail({ brand: brand.name, since: new Date(Date.parse(`${seenDay}T12:00:00Z`) - 7 * DAY), before: then.visibility, now: now.visibility, byEngine: now.byEngine, top: now.top, url: `${app}/prompts?brand=${brand.id}` }, f);
    }
  }
}

/** One workspace: work out its state, pick a step, claim it in email_log and send. True when an email went out. */
async function nurtureOne(db: SupabaseClient, w: Ws): Promise<boolean> {
  // Someone making a second workspace isn't new. Only their first gets these.
  const { data: older } = await db.from("workspaces").select("id").eq("created_by", w.created_by).lt("created_at", w.created_at).limit(1);
  if (older?.length) return false;

  const { data: pref } = await db.from("notification_prefs").select("tips").eq("workspace_id", w.id).eq("user_id", w.created_by).maybeSingle();
  if (pref && (pref as { tips?: boolean }).tips === false) return false;

  const e = await entitlement(w.id);
  if (e.readOnly) return false;

  const now = Date.now();
  const { data: log } = await db.from("email_log").select("kind, sent_at").eq("workspace_id", w.id);
  const rows = (log ?? []) as { kind: string; sent_at: string }[];
  const sent = new Set(
    rows
      .filter((r) => r.kind.startsWith("nurture:"))
      .filter((r) => r.kind !== "nurture:winback" || now - Date.parse(r.sent_at) < WINBACK_EVERY)
      .map((r) => r.kind.slice("nurture:".length)),
  );
  const sentRecently = rows.some((r) => (r.kind.startsWith("nurture:") || r.kind === "trial3") && now - Date.parse(r.sent_at) < 20 * HOUR);

  const { data: brandData } = await db.from("brands").select("id, name, domain, prompts, topics, profile, created_by_key").eq("workspace_id", w.id).order("created_at");
  // A partner's customers' brands are never in these emails (src/lib/partnerBrand.ts).
  const brands = ((brandData ?? []) as (BrandRow & { created_by_key?: string | null })[]).filter((b) => !isPartnerBrand(b));
  const prompts = brands.reduce((n, b) => n + promptsOf(b).length, 0);
  const { data: anyMetric } = brands.length ? await db.from("daily_metrics").select("day").in("brand_id", brands.map((b) => b.id)).limit(1) : { data: [] };
  const { count: contentPlans } = await db.from("keyword_runs").select("id", { count: "exact", head: true }).eq("workspace_id", w.id).neq("status", "failed");
  const { data: seen } = await db.from("login_devices").select("last_seen").eq("user_id", w.created_by).order("last_seen", { ascending: false }).limit(1);
  const lastSeen = seen?.[0]?.last_seen ? new Date(seen[0].last_seen as string) : null;
  const trialEnd = w.trial_ends_at ? Date.parse(w.trial_ends_at) : null;

  const step = pickStep({
    ageHours: (now - Date.parse(w.created_at)) / HOUR,
    plan: e.plan,
    storedPlan: w.plan,
    trialEndedHours: w.plan === "trial" && trialEnd !== null && trialEnd < now ? (now - trialEnd) / HOUR : null,
    brands: brands.length,
    prompts,
    hasAnswers: Boolean(anyMetric?.length),
    contentPlans: contentPlans ?? 0,
    idleDays: lastSeen ? (now - lastSeen.getTime()) / DAY : null,
    localHour: hourIn(w.timezone),
    sent,
    sentRecently,
  });
  if (!step) return false;

  const mail = await build(db, step, w, { plan: e.limits, brands, prompts, hasAnswers: Boolean(anyMetric?.length), contentPlans: contentPlans ?? 0, lastSeen });
  if (!mail) return false;

  // The log row goes in first, so two runs at once never send twice. Win-backs repeat at most every 90 days.
  const kind = `nurture:${step}`;
  const period = step === "winback" ? String(Math.floor(now / WINBACK_EVERY)) : "once";
  const { error } = await db.from("email_log").insert({ workspace_id: w.id, kind, period });
  if (error) return false;
  const personal = step === "welcome" || step === "help" || step === "nobrand";
  const n = await emailTips(db, w.id, w.created_by, mail, sendExtra(personal)).catch((err) => {
    console.error(`Nurture ${step} failed:`, err instanceof Error ? err.message : err);
    return 0;
  });
  if (n) return true;
  await db.from("email_log").delete().eq("workspace_id", w.id).eq("kind", kind).eq("period", period);
  return false;
}

export async function sendNurture(db: SupabaseClient) {
  if (process.env.NURTURE_OFF?.trim() === "1") return { sent: 0, skipped: "NURTURE_OFF is set." };
  const load = (cols: string) => db.from("workspaces").select(cols).gte("created_at", start()).not("created_by", "is", null);
  let res = await load("id, name, plan, trial_ends_at, created_by, created_at, timezone");
  // Before 034_settings.sql there is no time zone. Use UTC.
  if (res.error) res = await load("id, name, plan, trial_ends_at, created_by, created_at");
  if (res.error) throw new Error(res.error.message);
  let sent = 0;
  for (const w of (res.data ?? []) as unknown as Ws[]) {
    try {
      if (await nurtureOne(db, w)) sent++;
    } catch (err) {
      console.error(`Nurture for ${w.id} failed:`, err instanceof Error ? err.message : err);
    }
  }
  return { sent };
}
