import { createClient } from "@supabase/supabase-js";
import { clientIp, deviceLabel } from "@/lib/authGuard";
import { sendBuilt } from "@/lib/email";
import { appUrl } from "@/lib/emailKit";
import { newDeviceEmail } from "@/lib/emails";
import { adminClient, supabaseUrl } from "@/lib/serverAuth";

// The app calls this once each time it opens with a session. A device this person hasn't used before gets an
// email, whatever way they signed in (password, Google or a link). Their first device stays quiet.
export async function POST(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  const key = process.env.SUPABASE_PUBLISHABLE_KEY?.trim();
  const url = supabaseUrl();
  const db = adminClient();
  if (!token || !key || !url || !db) return Response.json({ ok: false });
  const body = (await request.json().catch(() => ({}))) as { device?: unknown };
  const device = String(body.device ?? "").replace(/[^\w-]/g, "").slice(0, 64);
  if (device.length < 16) return Response.json({ ok: false });
  const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data } = await sb.auth.getUser(token);
  const user = data.user;
  if (!user) return Response.json({ ok: false }, { status: 401 });

  const now = new Date();
  const label = deviceLabel(request.headers.get("user-agent") ?? "");
  const { data: known, error } = await db.from("login_devices").select("device").eq("user_id", user.id);
  if (error) return Response.json({ ok: false });
  if ((known ?? []).some((d) => d.device === device)) {
    await db.from("login_devices").update({ last_seen: now.toISOString(), label }).eq("user_id", user.id).eq("device", device);
    return Response.json({ ok: true, fresh: false });
  }
  await db.from("login_devices").insert({ user_id: user.id, device, label });
  if (known?.length && user.email) {
    await sendBuilt([user.email], newDeviceEmail({ device: label, ip: clientIp(request), when: now, resetUrl: appUrl() }), undefined, { idempotencyKey: `device-${user.id}-${device}` }).catch(() => false);
  }
  return Response.json({ ok: true, fresh: true });
}
