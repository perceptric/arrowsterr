import "server-only";
import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { row } from "./db";

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;
const COOKIE = "rl_session";
const DAYS = 30;

export async function hashPassword(pw: string) {
  const salt = randomBytes(16);
  const key = await scrypt(pw, salt, 64);
  return `scrypt$${salt.toString("base64")}$${key.toString("base64")}`;
}

export async function verifyPassword(pw: string, stored: string) {
  const [kind, salt, key] = stored.split("$");
  if (kind !== "scrypt" || !salt || !key) return false;
  const want = Buffer.from(key, "base64");
  const got = await scrypt(pw, Buffer.from(salt, "base64"), want.length);
  return timingSafeEqual(got, want);
}

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

export async function startSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  await row("insert into sessions (id, user_id, expires_at) values ($1, $2, now() + make_interval(days => $3))", [sha(token), userId, DAYS]);
  (await cookies()).set(COOKIE, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: DAYS * 86400 });
}

export async function endSession() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) await row("delete from sessions where id = $1", [sha(token)]);
  jar.delete(COOKIE);
}

export type Workspace = {
  id: string;
  name: string;
  role: "owner" | "admin" | "editor" | "viewer";
  credits: number;
  monthly_credits: number;
  credits_reset_at: Date;
  report_name: string;
  report_logo_url: string;
  report_color: string;
  report_footer: string;
  alert_emails: boolean;
};
export type Ctx = { user: { id: string; email: string; name: string }; workspace: Workspace };

export async function getCtx(): Promise<Ctx | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const r = await row<{ uid: string; email: string; uname: string } & Workspace>(
    `select u.id as uid, u.email, u.name as uname, w.id, w.name, m.role, w.credits, w.monthly_credits, w.credits_reset_at,
       w.report_name, w.report_logo_url, w.report_color, w.report_footer, w.alert_emails
     from sessions s join users u on u.id = s.user_id
     join members m on m.user_id = u.id join workspaces w on w.id = m.workspace_id
     where s.id = $1 and s.expires_at > now() order by w.created_at limit 1`,
    [sha(token)],
  );
  if (!r) return null;
  const { uid, email, uname, ...workspace } = r;
  return { user: { id: uid, email, name: uname }, workspace };
}

export async function requireCtx(): Promise<Ctx> {
  const ctx = await getCtx();
  if (!ctx) redirect("/login");
  return ctx;
}

export const canEdit = (ctx: Ctx) => ctx.workspace.role !== "viewer";

/** A short hash of the caller's IP for public limits. The raw IP is never stored. */
export async function ipKey() {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "local";
  return sha(`${process.env.RL_IP_SALT || "riselocale"}|${ip}`).slice(0, 32);
}
