import { clientIp, LIMITS } from "@/lib/authGuard";
import { adminClient, supabaseUrl } from "@/lib/serverAuth";

const err = (error: string, status = 400, extra: Record<string, unknown> = {}) => Response.json({ error, ...extra }, { status, headers: { "Cache-Control": "no-store" } });

// Password sign-in through the server, so wrong tries can be counted and locked out.
// Too many wrong passwords for one email from one address, from one address in total, or for one email in an hour
// pause sign-in for a while. The answer never says whether the email has an account.
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { email?: unknown; password?: unknown; captchaToken?: unknown };
  const email = String(body.email ?? "").trim().toLowerCase().slice(0, 320);
  const password = String(body.password ?? "").slice(0, 200);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !password) return err("Enter your email and password.");
  const url = supabaseUrl();
  const key = process.env.SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!url || !key) return err("Sign-in is not set up on the server.", 500);
  const db = adminClient();
  const ip = clientIp(request);

  if (db) {
    const since = new Date(Date.now() - 15 * 60_000).toISOString();
    const hour = new Date(Date.now() - 60 * 60_000).toISOString();
    const count = async (q: PromiseLike<{ count: number | null; error: unknown }>) => {
      const r = await q;
      return r.error ? 0 : (r.count ?? 0);
    };
    const base = () => db.from("auth_attempts").select("id", { count: "exact", head: true }).eq("ok", false);
    const [pair, byIp, byEmail] = await Promise.all([
      count(base().eq("email", email).eq("ip", ip).gt("created_at", since)),
      ip ? count(base().eq("ip", ip).gt("created_at", since)) : Promise.resolve(0),
      count(base().eq("email", email).gt("created_at", hour)),
    ]);
    if (pair >= LIMITS.pair || byIp >= LIMITS.ip || byEmail >= LIMITS.emailHour) return err("Too many wrong tries. Wait 15 minutes, or reset your password.", 429, { locked: true });
  }

  const captcha = typeof body.captchaToken === "string" && body.captchaToken ? { gotrue_meta_security: { captcha_token: body.captchaToken } } : {};
  const res = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: key, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, ...captcha }),
    signal: AbortSignal.timeout(15_000),
  }).catch(() => null);
  if (!res) return err("Couldn't reach the sign-in service. Try again.", 502);
  const out = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  const said = String(out.error_description ?? out.msg ?? out.message ?? out.error ?? "");
  const wrong = !res.ok && !/captcha|confirm/i.test(said) && res.status !== 429;
  if (db) {
    await db.from("auth_attempts").insert({ email, ip, ok: res.ok });
    if (res.ok) await db.from("auth_attempts").delete().eq("email", email).eq("ip", ip).eq("ok", false);
    if (Math.random() < 0.05) await db.from("auth_attempts").delete().lt("created_at", new Date(Date.now() - 86_400_000).toISOString());
  }
  if (!res.ok) {
    if (/confirm/i.test(said)) return err("Confirm your email first. Click the link we sent you, or use a sign-in link.");
    if (/captcha/i.test(said)) return err("Please finish the security check and try again.");
    if (res.status === 429) return err("Too many tries. Wait a few minutes and try again.", 429, { locked: true });
    return err(wrong ? "Email or password is wrong." : said || "Sign-in failed. Try again.");
  }
  return Response.json({ access_token: out.access_token, refresh_token: out.refresh_token }, { headers: { "Cache-Control": "no-store" } });
}
