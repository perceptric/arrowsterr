import { createHmac, timingSafeEqual } from "node:crypto";
import { emailReady, sendBuilt } from "@/lib/email";
import { appUrl } from "@/lib/emailKit";
import { authEmail, securityNoticeEmail, type AuthKind } from "@/lib/emails";
import { supabaseUrl } from "@/lib/serverAuth";

// Supabase's Send Email hook: Supabase calls this for every sign-in email, and Arrowsterr designs and sends it
// through Resend. Turn it on in Supabase: Authentication, Hooks, Send Email, HTTPS, with this address and a
// generated secret. Put the same secret (v1,whsec_...) in SEND_EMAIL_HOOK_SECRET on the server.

type Payload = {
  user: { id: string; email: string; new_email?: string; user_metadata?: Record<string, unknown> };
  email_data: { token?: string; token_hash?: string; redirect_to?: string; email_action_type: string; site_url?: string; token_new?: string; token_hash_new?: string; old_email?: string; email?: string; provider?: string; factor_type?: string };
};

const fail = (message: string, status = 401) => Response.json({ error: { http_code: status, message } }, { status });

/** Standard Webhooks check: HMAC-SHA256 of "id.timestamp.body" with the secret, sent within 5 minutes. */
function signed(request: Request, body: string): boolean {
  const secret = process.env.SEND_EMAIL_HOOK_SECRET?.trim().replace(/^v1,whsec_/, "");
  const id = request.headers.get("webhook-id");
  const ts = request.headers.get("webhook-timestamp");
  const sigs = request.headers.get("webhook-signature");
  if (!secret || !id || !ts || !sigs) return false;
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false;
  const want = createHmac("sha256", Buffer.from(secret, "base64")).update(`${id}.${ts}.${body}`).digest();
  return sigs.split(" ").some((part) => {
    const [v, sig] = part.split(",");
    if (v !== "v1" || !sig) return false;
    const got = Buffer.from(sig, "base64");
    return got.length === want.length && timingSafeEqual(got, want);
  });
}

/** The link Supabase checks before signing the person in or finishing the change. */
function verifyUrl(hash: string, type: string, redirect?: string) {
  const q = new URLSearchParams({ token: hash, type, redirect_to: redirect || appUrl() });
  return `${supabaseUrl()}/auth/v1/verify?${q}`;
}

export async function POST(request: Request) {
  const body = await request.text();
  if (!signed(request, body)) return fail("Bad or missing signature.");
  if (!emailReady()) return fail("Email is not set up on the server.", 500);
  let p: Payload;
  try {
    p = JSON.parse(body) as Payload;
  } catch {
    return fail("Bad body.", 400);
  }
  const d = p.email_data;
  const to = p.user.email;
  const kind = d.email_action_type;
  const send = (address: string, mail: ReturnType<typeof authEmail>) => sendBuilt([address], mail, undefined, { idempotencyKey: `auth-${request.headers.get("webhook-id")}-${address}` });
  const make = (k: AuthKind, address: string, hash: string | undefined, token: string | undefined, type: string) =>
    authEmail(k, { url: hash ? verifyUrl(hash, type, d.redirect_to) : appUrl(), email: address, code: token, newEmail: p.user.new_email, inviter: typeof p.user.user_metadata?.invited_by === "string" ? p.user.user_metadata.invited_by : undefined });

  try {
    if (kind === "signup") await send(to, make("confirm", to, d.token_hash, d.token, "signup"));
    else if (kind === "magiclink") await send(to, make("magic", to, d.token_hash, d.token, "magiclink"));
    else if (kind === "recovery") await send(to, make("recovery", to, d.token_hash, d.token, "recovery"));
    else if (kind === "invite") await send(to, make("invite", to, d.token_hash, d.token, "invite"));
    else if (kind === "reauthentication") await send(to, make("reauth", to, undefined, d.token, "reauthentication"));
    else if (kind === "email_change") {
      // Supabase swaps these names: token_hash_new goes to the current address, token_hash to the new one.
      const next = p.user.new_email;
      if (d.token_hash_new) await send(to, make("email_change_old", to, d.token_hash_new, d.token_new, "email_change"));
      if (next && d.token_hash) await send(next, make("email_change_new", next, d.token_hash, d.token, "email_change"));
    } else {
      const detail = d.email ?? d.provider ?? d.factor_type ?? d.old_email;
      const mail = securityNoticeEmail(kind, { email: to, detail, settingsUrl: `${appUrl()}/settings/security`, resetUrl: appUrl() });
      if (mail) await send(to, mail);
    }
  } catch (e) {
    return fail(`Couldn't send the email: ${e instanceof Error ? e.message : String(e)}`, 500);
  }
  return Response.json({});
}
