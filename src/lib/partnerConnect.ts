import "server-only";
import { createHash, randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AppOwner, AppSlug } from "./composio";
import { own, perr, type Partner } from "./partnerApi";

// Partner connect links (docs/API.md, "Partner API" → "Connect an app", supabase/100_partner_connect.sql).
// A partner's customer connects their own app from the partner's product, never on an Arrowsterr page:
//   1. The partner calls POST /api/partner/brands/:id/connect/start with { integration, return_url } and gets
//      { url }, the sign-in link to send the customer to.
//   2. The customer signs in with the provider. Composio holds the sign-in, as one Composio user per partner
//      brand ({ brand } in composio.ts), so a customer's app is never shared with the partner's other customers.
//   3. Our callback (CALLBACK_PATH/<state>) checks the link, then sends the customer straight back with a 302:
//      return_url?aw_status=connected&integration=<id>, or aw_status=error&integration=<id>&reason=<code>.
// A link's state is random, saved only as a hash, bound to one brand and one partner workspace, used once,
// and dead after 30 minutes. return_url must be https on a host in PARTNER_RETURN_HOSTS.

/** The apps a partner brand can connect, and the MCP tool each one feeds. Only Cloudflare today (get_ai_crawlers). */
export const PARTNER_INTEGRATIONS = [{ id: "cloudflare", name: "Cloudflare", slug: "cloudflare" }] as const satisfies readonly { id: string; name: string; slug: AppSlug }[];
export type IntegrationId = (typeof PARTNER_INTEGRATIONS)[number]["id"];

export const STATE_TTL = 30 * 60_000;
export const CALLBACK_PATH = "/api/partner/connect/callback"; // + /<state>: in the path, so no provider can mangle it with its own query
const TABLE = "partner_connect_states";

/** Why a connect ended badly, as the reason in the redirect. */
export type Reason = "expired" | "used" | "denied" | "not_connected" | "brand_gone" | "provider_error";

/** What the connect code needs from the outside world, so tests can fake Composio, the clock and the settings. */
export type ConnectDeps = {
  db: SupabaseClient;
  /** True when Composio is set up on the server. */
  ready: () => boolean;
  /** The provider sign-in link for this owner and app, coming back to callbackUrl. */
  link: (owner: AppOwner, slug: AppSlug, callbackUrl: string) => Promise<string>;
  /** True when the owner has this app connected and working now. */
  connected: (owner: AppOwner, slug: AppSlug) => Promise<boolean>;
  /** Hosts return_url may point at, lowercase. */
  hosts: () => string[];
  /** This app's public address, for the callback. */
  origin: () => string;
  now?: () => number;
};

/** PARTNER_RETURN_HOSTS: a comma-separated list of exact hosts, like "chat.morningtelos.com,app.example.com". */
export const returnHosts = (raw = process.env.PARTNER_RETURN_HOSTS ?? "") =>
  raw
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);

/** The integrations a partner brand can use on this server. None when Composio is not set up. */
export function usableIntegrations(ready: boolean) {
  return ready ? PARTNER_INTEGRATIONS.map(({ id, name }) => ({ id, name })) : [];
}

/** return_url as a URL when it is https on an allowed host, with no user name or password in it. Null otherwise. */
export function allowedReturn(raw: unknown, hosts: string[]): URL | null {
  if (typeof raw !== "string" || raw.length > 2000) return null;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" || u.username || u.password) return null;
  return hosts.includes(u.hostname.toLowerCase()) ? u : null;
}

export const hashState = (state: string) => createHash("sha256").update(state).digest("hex");

/** return_url with the outcome added to its query. Its own query and path stay. */
export function outcomeUrl(returnUrl: string, integration: string, reason: Reason | null) {
  const u = new URL(returnUrl);
  u.searchParams.set("aw_status", reason ? "error" : "connected");
  u.searchParams.set("integration", integration);
  if (reason) u.searchParams.set("reason", reason);
  else u.searchParams.delete("reason");
  return u.toString();
}

/** POST /api/partner/brands/:id/connect/start */
export async function startConnect(p: Partner, id: string, body: unknown, deps: ConnectDeps): Promise<Response> {
  const b = await own(p, id);
  if (b instanceof Response) return b;
  const input = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const usable = usableIntegrations(deps.ready());
  const pick = PARTNER_INTEGRATIONS.find((x) => x.id === input.integration && usable.some((u) => u.id === x.id));
  if (!pick) return perr(422, "unknown_integration", `Send integration as one of: ${usable.map((u) => u.id).join(", ") || "none on this server yet"}. GET /api/partner/integrations lists them.`);
  const back = allowedReturn(input.return_url, deps.hosts());
  if (!back) return perr(422, "bad_return_url", "Send return_url as an https address on a host we allow for your account.");
  const now = deps.now?.() ?? Date.now();
  // Old links are no use to anyone. Clearing them is best effort.
  await deps.db.from(TABLE).delete().lt("expires_at", new Date(now - 86_400_000).toISOString());
  const state = randomBytes(32).toString("base64url");
  const { error } = await deps.db.from(TABLE).insert({ state_hash: hashState(state), workspace_id: p.ws, brand_id: b.id, key_id: p.keyId, integration: pick.id, return_url: back.toString(), expires_at: new Date(now + STATE_TTL).toISOString() });
  if (error) throw new Error(error.message);
  const url = await deps.link({ brand: b.id }, pick.slug, `${deps.origin()}${CALLBACK_PATH}/${state}`);
  return Response.json({ url });
}

type StateRow = { state_hash: string; workspace_id: string; brand_id: string; integration: string; return_url: string; expires_at: string; used_at: string | null };

/** A plain answer for a link we can't send anywhere. No page, no name: the customer only sees this line. */
const dead = () => new Response("This link is not valid. Go back and try again.", { status: 400, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
const go = (location: string) => new Response(null, { status: 302, headers: { Location: location, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });

/** GET /api/partner/connect/callback/<state>, where the provider sends the customer back. query: what the provider added. */
export async function finishConnect(state: string, query: URLSearchParams, deps: ConnectDeps): Promise<Response> {
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(state)) return dead();
  const hash = hashState(state);
  const { data } = await deps.db.from(TABLE).select("state_hash, workspace_id, brand_id, integration, return_url, expires_at, used_at").eq("state_hash", hash).maybeSingle();
  const row = data as StateRow | null;
  if (!row) return dead();
  const pick = PARTNER_INTEGRATIONS.find((x) => x.id === row.integration);
  const end = (reason: Reason | null) => go(outcomeUrl(row.return_url, row.integration, reason));
  // Claim the link first, so two callbacks at once can't both use it.
  const now = deps.now?.() ?? Date.now();
  const { data: claimed } = await deps.db.from(TABLE).update({ used_at: new Date(now).toISOString() }).eq("state_hash", hash).is("used_at", null).select("state_hash");
  if (!(claimed as unknown[] | null)?.length) return end("used");
  if (Date.parse(row.expires_at) <= now) return end("expired");
  if (!pick) return end("provider_error");
  // Composio adds status=failed (or error) when the customer said no or the sign-in broke.
  if (/^(failed|error|cancel+ed|denied)$/i.test(query.get("status") ?? "")) return end("denied");
  // The brand must still be this partner's: deleted, or no longer a partner brand, ends here.
  const { data: brand } = await deps.db.from("brands").select("id, workspace_id, created_by_key").eq("id", row.brand_id).maybeSingle();
  const b = brand as { workspace_id: string; created_by_key: string | null } | null;
  if (!b || b.workspace_id !== row.workspace_id || !b.created_by_key) return end("brand_gone");
  try {
    return end((await deps.connected({ brand: row.brand_id }, pick.slug)) ? null : "not_connected");
  } catch (e) {
    console.error("Partner connect check failed:", e instanceof Error ? e.message : e);
    return end("provider_error");
  }
}

/** The live connect deps: Composio, PARTNER_RETURN_HOSTS and APP_URL. */
export async function liveConnectDeps(db: SupabaseClient): Promise<ConnectDeps> {
  const c = await import("./composio");
  const { appUrl } = await import("./emailKit");
  return {
    db,
    ready: c.composioReady,
    link: c.connectLink,
    connected: async (owner, slug) => (await c.connections(owner, true)).some((x) => x.slug === slug && x.status === "ACTIVE"),
    hosts: () => returnHosts(),
    origin: appUrl,
  };
}
