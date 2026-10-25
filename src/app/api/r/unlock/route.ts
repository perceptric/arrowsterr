import { clientIp } from "@/lib/clientIp";
import { limitKey, underLimit } from "@/lib/limit";
import { findLink } from "@/lib/reportLinks";
import { checkPassword, unlockCookie, unlockValue } from "@/lib/reportServer";
import { adminClient } from "@/lib/serverAuth";

// Open a share link that has a password. A right password sets a cookie for 30 days.
// 10 tries an hour per link and 30 an hour per address, counted in the database, so a password can't be guessed by brute force.
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const token = String(body.token ?? "");
  const password = String(body.password ?? "");
  if (!/^[a-f0-9]{48,64}$/.test(token) || !password) return Response.json({ error: "Enter the password." }, { status: 400 });

  const db = adminClient();
  if (!db) return Response.json({ error: "This link can't be opened right now." }, { status: 500 });
  const [perLink, perIp] = await Promise.all([underLimit(db, limitKey("unlock-link", token), 10, 3600), underLimit(db, limitKey("unlock-ip", clientIp(request)), 30, 3600)]);
  if (!perLink || !perIp) return Response.json({ error: "Too many tries. Wait an hour, or ask for a new link." }, { status: 429 });

  const { data } = await findLink(db, token, "password_hash, revoked_at, expires_at");
  const link = data as unknown as { password_hash: string | null; revoked_at: string | null; expires_at: string | null } | null;
  if (!link?.password_hash || link.revoked_at || (link.expires_at && Date.parse(link.expires_at) < Date.now())) return Response.json({ error: "This link is no longer shared." }, { status: 404 });

  if (!(await checkPassword(password, link.password_hash))) return Response.json({ error: "That password is not right." }, { status: 403 });
  const cookie = `${unlockCookie(token)}=${unlockValue(token, link.password_hash)}; Path=/r/${token}; Max-Age=${30 * 86400}; HttpOnly; Secure; SameSite=Lax`;
  return Response.json({ ok: true }, { headers: { "Set-Cookie": cookie } });
}
