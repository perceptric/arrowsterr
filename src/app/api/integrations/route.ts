import { entitlement } from "@/lib/entitlements";
import { makeKey } from "@/lib/apiKeys";
import { discordSend, newKey, slackSend, teamsSend } from "@/lib/integrations";
import { DEFAULT_ALERT_POINTS, DISCORD_HOOK, SLACK_HOOK, TEAMS_HOOK } from "@/lib/integrationTypes";
import { adminClient, requireRole } from "@/lib/serverAuth";
import { NOT_READY } from "@/lib/errors";
import { errorResponse } from "@/lib/errorsServer";

const err = (error: string, status = 400) => Response.json({ error }, { status });

// Slack, API keys and webhooks for a workspace. Secrets stay on the server; the page sees only names and prefixes.
//   get: {}                                  viewers
//   slack: { url, points }                   admins: save and send a test message
//   slackOff: {}                             admins
//   points: { points }                       admins
//   teams / discord: { url }                 admins: save and send a test message
//   teamsOff / discordOff: {}                admins
//   key: { name }                            admins: returns the key once
//   partnerKey: { name }                     owners of a partner workspace: an aw_partner_ key, returned once
//   revoke: { id }                           admins
//   unhook: { id }                           admins
// One brand's Slack channel and alert size, each falling back to the workspace's:
//   brandGet: { brandId }                    viewers
//   brandSlack: { brandId, url }             admins: save and send a test message
//   brandSlackOff: { brandId }               admins: back to the workspace's channel
//   brandPoints: { brandId, points | null }  admins: null goes back to the workspace's alert size
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const auth = await requireRole(request, body.workspaceId, body.action === "get" || body.action === "brandGet" ? "viewer" : "admin");
  if ("denied" in auth) return auth.denied;
  const db = adminClient();
  if (!db) return err("Add SUPABASE_SECRET_KEY to the server's settings.", 500);
  const ws = String(body.workspaceId);
  const e = await entitlement(ws);

  if (typeof body.action === "string" && body.action.startsWith("brand")) {
    const { data: brand } = await auth.sb.from("brands").select("id, name").eq("id", String(body.brandId ?? "")).eq("workspace_id", ws).maybeSingle();
    if (!brand) return err("That brand is not in this workspace.", 404);
    const save = async (patch: { slack_channel?: string | null; alert_points?: number | null }) => {
      const { error } = await db.from("brand_settings").upsert({ brand_id: brand.id, workspace_id: ws, ...patch, updated_at: new Date().toISOString() }, { onConflict: "brand_id" });
      if (error) return errorResponse(error, "api/integrations");
      return Response.json({ ok: true });
    };
    if (body.action === "brandGet") {
      const [cfg, own] = await Promise.all([
        db.from("integrations").select("slack_webhook, alert_points").eq("workspace_id", ws).maybeSingle(),
        db.from("brand_settings").select("slack_channel, alert_points").eq("brand_id", brand.id).maybeSingle(),
      ]);
      if (own.error && /brand_settings/.test(own.error.message)) return Response.json({ allowed: e.limits.alerts, setup: NOT_READY });
      return Response.json({
        allowed: e.limits.alerts,
        slack: Boolean(own.data?.slack_channel),
        workspaceSlack: Boolean(cfg.data?.slack_webhook),
        points: own.data?.alert_points ?? null,
        defaultPoints: cfg.data?.alert_points ?? DEFAULT_ALERT_POINTS,
      });
    }
    if (!e.limits.alerts) return Response.json({ error: "Slack, Zapier and the API are on Pro and up.", limit: true, boost: "scale" }, { status: 429 });
    if (body.action === "brandSlack") {
      const url = String(body.url ?? "").trim();
      if (!SLACK_HOOK.test(url)) return err("Paste a Slack webhook URL. It starts with https://hooks.slack.com/services/.");
      try {
        await slackSend(url, `Arrowsterr alerts for ${brand.name}`, [`You'll get a message here when ${brand.name}'s AI visibility moves or a competitor overtakes it.`]);
      } catch (x) {
        return errorResponse(x, "api/integrations", { status: 400, hint: "Slack didn't accept that webhook. Check the URL." });
      }
      return save({ slack_channel: url });
    }
    if (body.action === "brandSlackOff") return save({ slack_channel: null });
    if (body.action === "brandPoints") return save({ alert_points: body.points === null ? null : Math.min(50, Math.max(1, Number(body.points) || DEFAULT_ALERT_POINTS)) });
    return err("Unknown action.");
  }

  if (body.action === "get") {
    const [cfg, keys, hooks] = await Promise.all([
      db.from("integrations").select("*").eq("workspace_id", ws).maybeSingle(),
      // "*" so the list works before 098_partner.sql. Brand keys belong to the partner API, so they are left out here.
      db.from("api_keys").select("*").eq("workspace_id", ws).is("revoked_at", null).order("created_at"),
      db.from("webhooks").select("id, url, event, source, created_at").eq("workspace_id", ws).order("created_at"),
    ]);
    if (cfg.error && /integrations/.test(cfg.error.message)) return Response.json({ allowed: e.limits.alerts, mcp: e.limits.mcp, setup: NOT_READY });
    return Response.json({
      allowed: e.limits.alerts,
      mcp: e.limits.mcp,
      slack: Boolean(cfg.data?.slack_webhook),
      teams: Boolean(cfg.data?.teams_webhook),
      discord: Boolean(cfg.data?.discord_webhook),
      points: cfg.data?.alert_points ?? 5,
      keys: ((keys.data ?? []) as { id: string; name: string; prefix: string; created_at: string; last_used_at: string | null; partner?: boolean; brand_id?: string | null }[])
        .filter((k) => !k.brand_id)
        .map((k) => ({ id: k.id, name: k.name, prefix: k.prefix, created_at: k.created_at, last_used_at: k.last_used_at, partner: k.partner === true })),
      partner: e.limits.partner,
      hooks: (hooks.data ?? []).map((h) => ({ ...h, url: h.url.replace(/^(https?:\/\/[^/]+).*/, "$1/…") })),
    });
  }
  // Revoking a key or a connected AI app works on any plan that can connect AI apps (Starter and up) or use the API.
  if (body.action === "revoke") {
    if (!e.limits.alerts && !e.limits.mcp) return Response.json({ error: "AI apps are on Starter and up.", limit: true, boost: "foundation" }, { status: 429 });
    await db.from("api_keys").update({ revoked_at: new Date().toISOString() }).eq("id", String(body.id)).eq("workspace_id", ws);
    return Response.json({ ok: true });
  }
  if (!e.limits.alerts) return Response.json({ error: "Slack, Zapier and the API are on Pro and up.", limit: true, boost: "scale" }, { status: 429 });

  if (body.action === "slack") {
    const url = String(body.url ?? "").trim();
    if (!/^https:\/\/hooks\.slack\.com\/services\/\S+$/.test(url)) return err("Paste a Slack webhook URL. It starts with https://hooks.slack.com/services/.");
    try {
      await slackSend(url, "Arrowsterr is connected", ["You'll get a message here when your AI visibility moves or a competitor overtakes you."]);
    } catch (x) {
      return errorResponse(x, "api/integrations", { status: 400, hint: "Slack didn't accept that webhook. Check the URL." });
    }
    const points = Math.min(50, Math.max(1, Number(body.points) || 5));
    const { error } = await db.from("integrations").upsert({ workspace_id: ws, slack_webhook: url, alert_points: points, updated_at: new Date().toISOString() });
    if (error) return errorResponse(error, "api/integrations");
    return Response.json({ ok: true });
  }
  if (body.action === "teams" || body.action === "discord") {
    const teams = body.action === "teams";
    const url = String(body.url ?? "").trim();
    if (!(teams ? TEAMS_HOOK : DISCORD_HOOK).test(url)) return err(teams ? "Paste a Teams Workflows webhook URL. In Teams, open the channel, then Workflows, then \"Send webhook alerts to a channel\"." : "Paste a Discord webhook URL. It starts with https://discord.com/api/webhooks/.");
    try {
      await (teams ? teamsSend : discordSend)(url, "Arrowsterr is connected", ["You'll get a message here when your AI visibility moves or a competitor overtakes you."]);
    } catch (x) {
      return errorResponse(x, "api/integrations", { status: 400, hint: `${teams ? "Teams" : "Discord"} didn't accept that webhook. Check the URL.` });
    }
    const { error } = await db.from("integrations").upsert({ workspace_id: ws, [teams ? "teams_webhook" : "discord_webhook"]: url, updated_at: new Date().toISOString() });
    if (error) return errorResponse(error, "api/integrations");
    return Response.json({ ok: true });
  }
  if (body.action === "teamsOff" || body.action === "discordOff") {
    await db.from("integrations").update({ [body.action === "teamsOff" ? "teams_webhook" : "discord_webhook"]: null }).eq("workspace_id", ws);
    return Response.json({ ok: true });
  }
  if (body.action === "slackOff") {
    await db.from("integrations").update({ slack_webhook: null }).eq("workspace_id", ws);
    return Response.json({ ok: true });
  }
  if (body.action === "points") {
    const points = Math.min(50, Math.max(1, Number(body.points) || 5));
    const { error } = await db.from("integrations").upsert({ workspace_id: ws, alert_points: points, updated_at: new Date().toISOString() });
    if (error) return errorResponse(error, "api/integrations");
    return Response.json({ ok: true });
  }
  if (body.action === "key") {
    const name = String(body.name ?? "").trim().slice(0, 60) || "API key";
    const k = newKey();
    const { data, error } = await db.from("api_keys").insert({ workspace_id: ws, name, prefix: k.prefix, hash: k.hash, created_by: auth.userId }).select("id, name, prefix, created_at, last_used_at").single();
    if (error) return errorResponse(error, "api/integrations");
    return Response.json({ key: k.key, row: data });
  }
  if (body.action === "partnerKey") {
    if (!e.limits.partner) return err("This workspace does not have the partner API.", 403);
    const { data: owner } = await auth.sb.rpc("has_role", { ws, min: "owner" });
    if (!owner) return err("Only the workspace owner can make a partner key.", 403);
    const name = String(body.name ?? "").trim().slice(0, 60) || "Partner key";
    const k = makeKey("partner");
    const { data, error } = await db.from("api_keys").insert({ workspace_id: ws, name, prefix: k.prefix, hash: k.hash, created_by: auth.userId, partner: true }).select("id, name, prefix, created_at, last_used_at").single();
    if (error) return errorResponse(error, "api/integrations");
    return Response.json({ key: k.key, row: { ...data, partner: true } });
  }
  if (body.action === "unhook") {
    await db.from("webhooks").delete().eq("id", String(body.id)).eq("workspace_id", ws);
    return Response.json({ ok: true });
  }
  return err("Unknown action.");
}
