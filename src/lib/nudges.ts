import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { flatPrompts, topicsOf, type Brand } from "./db";
import { emailReady, sendBuilt } from "./email";
import type { Email } from "./emailKit";
import { tasksEmail, trialEmail, type Footer } from "./emails";
import { entitlement } from "./entitlements";
import { cycleEnd, periodOf, PLANS, SELF_SERVE, TASK_PACKS } from "./plans";
import { weekOf, type Metric } from "./visibility";

// Emails that help people before they hit a wall: tasks at 80% for the month, and a trial with 3 days left.
// Each one goes out once per workspace and period (email_log). Runs from the worker or the cron, about hourly.
// What each email says: src/lib/emails.ts.

const billing = () => (process.env.APP_URL?.trim().replace(/\/+$/, "") || "https://app.arrowsterr.com") + "/settings/billing";
const DAY = 864e5;

async function admins(db: SupabaseClient, ws: string) {
  const { data } = await db.from("workspace_members").select("email, role").eq("workspace_id", ws).in("role", ["owner", "admin"]);
  return [...new Set((data ?? []).map((m) => m.email as string | null).filter((e): e is string => Boolean(e)))];
}

const adminFooter = (): Footer => ({ text: "You get this because you're an admin of this workspace.", links: [{ label: "Billing", url: billing() }] });

/** Send one email once. The log row goes in first, so two runs at once never send twice. */
async function once(db: SupabaseClient, ws: string, kind: string, period: string, send: () => Promise<boolean>) {
  const { error } = await db.from("email_log").insert({ workspace_id: ws, kind, period });
  if (error) return false; // already sent, or 023_emails.sql not run yet
  try {
    if (await send()) return true;
  } catch (e) {
    console.error(`Email ${kind} failed:`, e instanceof Error ? e.message : e);
  }
  await db.from("email_log").delete().eq("workspace_id", ws).eq("kind", kind).eq("period", period);
  return false;
}

async function toAdmins(db: SupabaseClient, ws: string, mail: Email) {
  const to = await admins(db, ws);
  return sendBuilt(to, mail);
}

/** What the trial found: the first brand's visibility this week, the prompts tracked and the briefs made. */
async function trialStats(db: SupabaseClient, ws: string) {
  const today = new Date().toISOString().slice(0, 10);
  const since = new Date(Date.now() - 14 * DAY).toISOString().slice(0, 10);
  const { data: brands } = await db.from("brands").select("id, prompts, topics").eq("workspace_id", ws).order("created_at");
  const list = (brands ?? []) as Pick<Brand, "id" | "prompts" | "topics">[];
  const prompts = list.reduce((n, b) => n + flatPrompts(topicsOf({ prompts: b.prompts ?? [], topics: b.topics ?? [] })).length, 0);
  let visibility: number | null = null;
  if (list[0]) {
    const { data: rows } = await db.from("daily_metrics").select("day, engine, named, is_you, answers, mentions").eq("brand_id", list[0].id).gte("day", since).lt("day", today);
    visibility = weekOf((rows ?? []) as Metric[], today)?.visibility ?? null;
  }
  const { count } = await db.from("calendar_items").select("id", { count: "exact", head: true }).eq("workspace_id", ws).eq("brief_status", "done");
  return { visibility, prompts, briefs: count ?? 0 };
}

export async function sendNudges(db: SupabaseClient) {
  if (!emailReady()) return { sent: 0, skipped: "RESEND_API_KEY is not set." };
  const { data: list, error } = await db.from("workspaces").select("id, name, plan, trial_ends_at");
  if (error) throw new Error(error.message);
  let sent = 0;
  const now = Date.now();

  for (const w of list ?? []) {
    const e = await entitlement(w.id);
    if (e.readOnly) continue;

    // Trial ending in 3 days or less.
    if (w.plan === "trial" && w.trial_ends_at) {
      const left = Date.parse(w.trial_ends_at) - now;
      if (left > 0 && left <= 3 * DAY) {
        const days = Math.max(1, Math.ceil(left / DAY));
        const ok = await once(db, w.id, "trial3", String(w.trial_ends_at).slice(0, 10), async () => {
          const stats = await trialStats(db, w.id).catch(() => ({}));
          const plans = SELF_SERVE.map((id) => PLANS[id]).map((p) => ({ name: p.name, tagline: p.tagline, price: p.price }));
          return toAdmins(db, w.id, trialEmail({ workspace: w.name, days, ends: new Date(w.trial_ends_at), ...stats, plans, url: billing() }, adminFooter()));
        });
        if (ok) sent++;
      }
    }

    // Tasks at 80% or more of the month.
    const limit = e.limits.tasksPerMonth;
    if (limit > 0) {
      const at = new Date();
      const period = periodOf("tasks", at, e.anchor);
      const { data: row } = await db.from("usage_counters").select("used").eq("workspace_id", w.id).eq("metric", "tasks").eq("period", period).maybeSingle();
      const used = Number(row?.used ?? 0);
      if (used >= limit * 0.8) {
        const resets = e.anchor ? cycleEnd(new Date(e.anchor), at) : new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth() + 1, 1));
        const ok = await once(db, w.id, "tasks80", period, async () =>
          toAdmins(
            db,
            w.id,
            tasksEmail({ workspace: w.name, used: Math.min(used, limit), limit, plan: e.limits.name, resets, packs: TASK_PACKS.map((p) => ({ tasks: p.tasks, price: p.price })), credits: e.credits, url: billing() }, adminFooter()),
          ),
        );
        if (ok) sent++;
      }
    }
  }
  return { sent };
}
