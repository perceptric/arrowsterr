"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { canEdit, endSession, hashPassword, ipKey, requireCtx, startSession, verifyPassword } from "@/lib/auth";
import { row, tx } from "@/lib/db";
import { parseConfig, gridPoints } from "@/lib/geo";
import type { Listing } from "@/lib/match";
import { createScan, NoCredits, nextRun, type ScanRow } from "@/lib/scans";
import { isDemo, NO_SOURCE, provider } from "@/lib/source";

export type FormState = { error?: string; ok?: string } | null;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const text = (f: FormData, k: string, max = 200) => String(f.get(k) ?? "").trim().slice(0, max);

export async function signup(_: FormState, f: FormData): Promise<FormState> {
  const email = text(f, "email").toLowerCase();
  const name = text(f, "name", 80);
  const company = text(f, "company", 80);
  const password = String(f.get("password") ?? "");
  if (!EMAIL.test(email)) return { error: "Enter a valid email address." };
  if (password.length < 10) return { error: "Use a password of at least 10 characters." };
  if (await row("select 1 from users where email = $1", [email])) return { error: "That email already has an account. Sign in instead." };
  const hash = await hashPassword(password);
  const monthly = Number(process.env.RL_MONTHLY_CREDITS) || 10000;
  const userId = await tx(async (c) => {
    const u = await c.query<{ id: string }>("insert into users (email, name, password_hash) values ($1, $2, $3) returning id", [email, name, hash]);
    const w = await c.query<{ id: string }>("insert into workspaces (name, credits, monthly_credits) values ($1, $2, $2) returning id", [company || (name ? `${name}'s workspace` : "My workspace"), monthly]);
    await c.query("insert into members (workspace_id, user_id, role) values ($1, $2, 'owner')", [w.rows[0].id, u.rows[0].id]);
    return u.rows[0].id;
  });
  await startSession(userId);
  redirect("/app");
}

export async function login(_: FormState, f: FormData): Promise<FormState> {
  const email = text(f, "email").toLowerCase();
  const u = await row<{ id: string; password_hash: string }>("select id, password_hash from users where email = $1", [email]);
  if (!u || !(await verifyPassword(String(f.get("password") ?? ""), u.password_hash))) return { error: "That email and password don't match." };
  await startSession(u.id);
  redirect("/app");
}

export async function logout() {
  await endSession();
  redirect("/login");
}

/** Look a business up on Google Maps. Counts against a daily limit per workspace. */
export async function searchBusinesses(query: string): Promise<{ results?: Listing[]; error?: string }> {
  const ctx = await requireCtx();
  const q = query.trim().slice(0, 160);
  if (q.length < 3) return { error: "Type the business name and city." };
  const src = provider();
  if (!src) return { error: NO_SOURCE };
  const used = await row<{ n: number }>("select count(*)::int as n from rate_events where key = $1 and at > now() - interval '1 day'", [`search:${ctx.workspace.id}`]);
  if ((used?.n ?? 0) >= 200) return { error: "You've used today's 200 business lookups. Add the business by hand or try tomorrow." };
  await row("insert into rate_events (key) values ($1)", [`search:${ctx.workspace.id}`]);
  try {
    return { results: await src.search(q) };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function addBusiness(l: Partial<Listing> & { title: string; lat: number; lng: number }) {
  const ctx = await requireCtx();
  if (!canEdit(ctx)) return { error: "Viewers can't add businesses." };
  if (!l.title?.trim() || !Number.isFinite(l.lat) || !Number.isFinite(l.lng)) return { error: "Pick a business with a location." };
  const dup = l.cid ? await row<{ id: string }>("select id from businesses where workspace_id = $1 and cid = $2 and not archived", [ctx.workspace.id, l.cid]) : null;
  if (dup) return { id: dup.id };
  const b = await row<{ id: string }>(
    `insert into businesses (workspace_id, name, address, domain, category, place_id, cid, lat, lng, rating, reviews)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) returning id`,
    [ctx.workspace.id, l.title.trim().slice(0, 160), (l.address ?? "").slice(0, 300), (l.domain ?? "").slice(0, 200), (l.category ?? "").slice(0, 120), l.place_id ?? "", l.cid ?? "", l.lat, l.lng, l.rating ?? null, l.reviews ?? null],
  );
  revalidatePath("/app");
  return { id: b!.id };
}

export async function addBusinessByHand(_: FormState, f: FormData): Promise<FormState> {
  const lat = Number(f.get("lat"));
  const lng = Number(f.get("lng"));
  const name = text(f, "name", 160);
  if (!name) return { error: "Enter the business name." };
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 85 || Math.abs(lng) > 180) return { error: "Enter the latitude and longitude, like 41.8781 and -87.6298." };
  const res = await addBusiness({ title: name, lat, lng, domain: text(f, "domain").replace(/^https?:\/\//, "").replace(/\/.*$/, ""), address: text(f, "address", 300) });
  if ("error" in res && res.error) return { error: res.error };
  redirect(`/app/businesses/${res.id}`);
}

export async function setArchived(businessId: string, archived: boolean) {
  const ctx = await requireCtx();
  if (!canEdit(ctx)) return;
  await row("update businesses set archived = $3 where id = $1 and workspace_id = $2", [businessId, ctx.workspace.id, archived]);
  if (archived) await row("update schedules set active = false where business_id = $1 and workspace_id = $2", [businessId, ctx.workspace.id]);
  revalidatePath("/app/businesses");
}

export async function deleteBusiness(businessId: string) {
  const ctx = await requireCtx();
  if (!canEdit(ctx)) return;
  await row("delete from businesses where id = $1 and workspace_id = $2", [businessId, ctx.workspace.id]);
  redirect("/app/businesses");
}

export type ScanRequest = { businessId: string; keyword: string; config: unknown; frequency: "once" | "daily" | "weekly" | "monthly"; reportTo: string };

export async function startScan(req: ScanRequest): Promise<{ error?: string; id?: string }> {
  const ctx = await requireCtx();
  if (!canEdit(ctx)) return { error: "Viewers can't run scans." };
  const src = provider();
  if (!src) return { error: NO_SOURCE };
  const b = await row<{ id: string; name: string; domain: string; cid: string; place_id: string; lat: number; lng: number }>(
    "select id, name, domain, cid, place_id, lat, lng from businesses where id = $1 and workspace_id = $2 and not archived",
    [req.businessId, ctx.workspace.id],
  );
  if (!b) return { error: "Pick a business first." };
  let config;
  try {
    config = parseConfig(req.config);
  } catch (e) {
    return { error: (e as Error).message };
  }
  const reportTo = req.reportTo
    .split(/[\s,;]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (reportTo.some((e) => !EMAIL.test(e))) return { error: "One of the report emails isn't valid." };
  if (reportTo.length > 10) return { error: "Send the report to 10 people at most." };
  const keywords = [...new Set(req.keyword.split(/\n|,/).map((k) => k.trim()).filter(Boolean))];
  if (!keywords.length) return { error: "Enter a keyword." };
  if (keywords.length > 10) return { error: "Add up to 10 keywords at a time." };
  try {
    const ids = await tx(async (c) => {
      const out: string[] = [];
      for (const keyword of keywords) {
        let scheduleId: string | null = null;
        if (req.frequency !== "once") {
          const now = new Date();
          const s = await c.query<{ id: string }>(
            "insert into schedules (workspace_id, business_id, keyword, config, frequency, next_run_at, report_to) values ($1, $2, $3, $4, $5, $6, $7) returning id",
            [ctx.workspace.id, b.id, keyword, JSON.stringify(config), req.frequency, nextRun(now, req.frequency, now), reportTo],
          );
          scheduleId = s.rows[0].id;
        }
        out.push(
          await createScan(c, {
            workspaceId: ctx.workspace.id,
            businessId: b.id,
            scheduleId,
            keyword,
            target: { name: b.name, domain: b.domain, cid: b.cid, place_id: b.place_id, lat: b.lat, lng: b.lng },
            config,
            priority: 2,
            demo: isDemo(),
          }),
        );
      }
      return out;
    });
    revalidatePath("/app");
    return { id: ids[0] };
  } catch (e) {
    if (e instanceof NoCredits) return { error: `${e.message} Credits reset each month.` };
    return { error: (e as Error).message };
  }
}

export async function rerunScan(scanId: string) {
  const ctx = await requireCtx();
  const s = await row<ScanRow>("select * from scans where id = $1 and workspace_id = $2", [scanId, ctx.workspace.id]);
  if (!s?.business_id) return { error: "That scan can't be run again." };
  const res = await startScan({ businessId: s.business_id, keyword: s.keyword, config: s.config, frequency: "once", reportTo: "" });
  if (res.id) redirect(`/app/scans/${res.id}`);
  return res;
}

export async function deleteScan(scanId: string) {
  const ctx = await requireCtx();
  if (!canEdit(ctx)) return;
  await row("delete from scans where id = $1 and workspace_id = $2", [scanId, ctx.workspace.id]);
  redirect("/app");
}

export async function setSchedule(scheduleId: string, active: boolean) {
  const ctx = await requireCtx();
  if (!canEdit(ctx)) return;
  await row(
    "update schedules set active = $3, next_run_at = case when $3 and next_run_at < now() then now() + interval '5 minutes' else next_run_at end where id = $1 and workspace_id = $2",
    [scheduleId, ctx.workspace.id, active],
  );
  revalidatePath("/app");
}

export async function deleteSchedule(scheduleId: string) {
  const ctx = await requireCtx();
  if (!canEdit(ctx)) return;
  await row("delete from schedules where id = $1 and workspace_id = $2", [scheduleId, ctx.workspace.id]);
  revalidatePath("/app");
}

export async function newShareLink(scanId: string) {
  const ctx = await requireCtx();
  const { newToken } = await import("@/lib/scans");
  await row("update scans set share_token = $3 where id = $1 and workspace_id = $2", [scanId, ctx.workspace.id, newToken()]);
  revalidatePath(`/app/scans/${scanId}`);
}

export async function saveSettings(_: FormState, f: FormData): Promise<FormState> {
  const ctx = await requireCtx();
  if (!["owner", "admin"].includes(ctx.workspace.role)) return { error: "Only owners and admins can change settings." };
  const color = text(f, "report_color", 7);
  if (color && !/^#[0-9a-f]{6}$/i.test(color)) return { error: "Enter the color as a hex code, like #3358ff." };
  const logo = text(f, "report_logo_url", 500);
  if (logo && !/^https:\/\//.test(logo)) return { error: "The logo link must start with https://." };
  await row(
    "update workspaces set name = $2, report_name = $3, report_logo_url = $4, report_color = $5, report_footer = $6, alert_emails = $7 where id = $1",
    [ctx.workspace.id, text(f, "name", 80) || ctx.workspace.name, text(f, "report_name", 80), logo, color, text(f, "report_footer", 200), f.get("alert_emails") === "on"],
  );
  revalidatePath("/app");
  return { ok: "Saved." };
}

export async function markAlertsRead() {
  const ctx = await requireCtx();
  await row("update alerts set read_at = now() where workspace_id = $1 and read_at is null", [ctx.workspace.id]);
  revalidatePath("/app");
}

// The free 5×5 scan on the website.

const FREE_SIZE = 5;
const FREE_SPACING = 1609;

export async function freeSearch(query: string): Promise<{ results?: Listing[]; error?: string }> {
  const q = query.trim().slice(0, 160);
  if (q.length < 3) return { error: "Type the business name and city." };
  const src = provider();
  if (!src) return { error: NO_SOURCE };
  const key = `free-search:${await ipKey()}`;
  const used = await row<{ n: number }>("select count(*)::int as n from rate_events where key = $1 and at > now() - interval '1 day'", [key]);
  if ((used?.n ?? 0) >= 20) return { error: "That's the most lookups for today. Create a free account to keep going." };
  await row("insert into rate_events (key) values ($1)", [key]);
  try {
    return { results: await src.search(q) };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function startFreeScan(input: { business: Listing; keyword: string; email: string }): Promise<{ error?: string; url?: string }> {
  const src = provider();
  if (!src) return { error: NO_SOURCE };
  const email = input.email.trim().toLowerCase().slice(0, 200);
  if (!EMAIL.test(email)) return { error: "Enter your email to get the result." };
  const b = input.business;
  if (!b?.title || !Number.isFinite(b.lat) || !Number.isFinite(b.lng)) return { error: "Pick your business from the list." };
  const ip = await ipKey();
  const perIp = Number(process.env.FREE_SCANS_PER_IP) || 2;
  const perDay = Number(process.env.FREE_SCANS_PER_DAY) || 100;
  const mine = await row<{ n: number }>("select count(*)::int as n from scans where workspace_id is null and free_ip = $1 and created_at > now() - interval '1 day'", [ip]);
  if ((mine?.n ?? 0) >= perIp) return { error: `You've run ${perIp} free scans today. Create a free account to run more.` };
  const all = await row<{ n: number }>("select count(*)::int as n from scans where workspace_id is null and created_at > now() - interval '1 day'");
  if ((all?.n ?? 0) >= perDay) return { error: "Free scans are full for today. Create a free account to run one now." };
  try {
    const center = { lat: b.lat!, lng: b.lng! };
    gridPoints(center, FREE_SIZE, FREE_SPACING);
    const id = await tx((c) =>
      createScan(c, {
        workspaceId: null,
        businessId: null,
        keyword: input.keyword,
        target: { name: b.title, domain: b.domain ?? "", cid: b.cid ?? "", place_id: b.place_id ?? "", lat: center.lat, lng: center.lng },
        config: { shape: "grid", size: FREE_SIZE, spacing_m: FREE_SPACING, center },
        priority: 2,
        demo: isDemo(),
        freeEmail: email,
        freeIp: ip,
      }),
    );
    const s = await row<{ share_token: string }>("select share_token from scans where id = $1", [id]);
    return { url: `/free/${s!.share_token}` };
  } catch (e) {
    return { error: (e as Error).message };
  }
}
