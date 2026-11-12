import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { needsRefresh, pickBlog, refreshed } from "./cmsOauth";

// One-click sign-in for Shopify and HubSpot (docs/drafts-plan.md, phase 3). Each needs its app's keys on the server:
// SHOPIFY_CLIENT_ID and SHOPIFY_CLIENT_SECRET (redirect <app>/api/cms/shopify/callback, scopes read_content,
// write_content and read_products for AI Shopping's catalog), HUBSPOT_CLIENT_ID and HUBSPOT_CLIENT_SECRET (redirect <app>/api/cms/hubspot/callback, scopes
// oauth and content). Both hand out short access tokens with a refresh token; freshConfig renews them before each call.

export type OauthKind = "shopify" | "hubspot";
export const SHOPIFY_API = "2026-10";

const env = (k: string) => process.env[k]?.trim() ?? "";
export const oauthReady = (kind: OauthKind) => (kind === "shopify" ? Boolean(env("SHOPIFY_CLIENT_ID") && env("SHOPIFY_CLIENT_SECRET")) : Boolean(env("HUBSPOT_CLIENT_ID") && env("HUBSPOT_CLIENT_SECRET")));
export const oauthRedirect = (kind: OauthKind, origin: string) => `${origin}/api/cms/${kind}/callback`;

export function oauthUrl(kind: OauthKind, origin: string, state: string, shop = "") {
  if (kind === "shopify") {
    const q = new URLSearchParams({ client_id: env("SHOPIFY_CLIENT_ID"), scope: "read_content,write_content,read_products", redirect_uri: oauthRedirect(kind, origin), state });
    return `https://${shop}/admin/oauth/authorize?${q}`;
  }
  const q = new URLSearchParams({ client_id: env("HUBSPOT_CLIENT_ID"), scope: "oauth content", redirect_uri: oauthRedirect(kind, origin), state });
  return `https://app.hubspot.com/oauth/authorize?${q}`;
}

type Tokens = { access_token: string; expires_in?: number; refresh_token?: string };

async function form(url: string, body: Record<string, string>): Promise<Tokens> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" }, body: new URLSearchParams(body), signal: AbortSignal.timeout(20_000) });
  const data = (await res.json().catch(() => ({}))) as Tokens & { error?: string; error_description?: string; message?: string };
  if (!res.ok || !data.access_token) throw Object.assign(new Error(data.error_description || data.message || data.error || `status ${res.status}`), { status: res.status });
  return data;
}

/** Trade the code from the sign-in for tokens. Shopify gets expiring tokens, as new public apps must. */
export function oauthExchange(kind: OauthKind, code: string, origin: string, shop = ""): Promise<Tokens> {
  if (kind === "shopify") return form(`https://${shop}/admin/oauth/access_token`, { client_id: env("SHOPIFY_CLIENT_ID"), client_secret: env("SHOPIFY_CLIENT_SECRET"), code, expiring: "1" });
  return form("https://api.hubapi.com/oauth/v1/token", { grant_type: "authorization_code", client_id: env("HUBSPOT_CLIENT_ID"), client_secret: env("HUBSPOT_CLIENT_SECRET"), redirect_uri: oauthRedirect(kind, origin), code });
}

function refreshCall(kind: OauthKind, c: Record<string, string>): Promise<Tokens> {
  if (kind === "shopify") return form(`https://${c.shop}/admin/oauth/access_token`, { client_id: env("SHOPIFY_CLIENT_ID"), client_secret: env("SHOPIFY_CLIENT_SECRET"), grant_type: "refresh_token", refresh_token: c.refreshToken });
  return form("https://api.hubapi.com/oauth/v1/token", { grant_type: "refresh_token", client_id: env("HUBSPOT_CLIENT_ID"), client_secret: env("HUBSPOT_CLIENT_SECRET"), refresh_token: c.refreshToken });
}

/** One Shopify GraphQL call. userErrors come back as a thrown error with their messages. */
export async function shopifyGql<T>(c: Record<string, string>, query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const shop = c.shop.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  const res = await fetch(`https://${shop}/admin/api/${SHOPIFY_API}/graphql.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json", "X-Shopify-Access-Token": c.token },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(30_000),
  });
  const data = (await res.json().catch(() => ({}))) as { data?: T; errors?: { message: string }[] | string };
  if (!res.ok || data.errors) {
    const why = Array.isArray(data.errors) ? data.errors.map((e) => e.message).join(" ") : (data.errors ?? res.statusText);
    throw new Error(`${res.status}: ${String(why).slice(0, 300)}`);
  }
  return data.data as T;
}

/** After the sign-in: the site's name and blog, saved with the tokens like a pasted connection. */
export async function oauthSetup(kind: OauthKind, t: Tokens, shop = ""): Promise<{ name: string; config: Record<string, string>; check: string }> {
  const base: Record<string, string> = { token: t.access_token, ...(t.refresh_token ? { refreshToken: t.refresh_token } : {}), expiresAt: new Date(Date.now() + (t.expires_in ?? 1800) * 1000).toISOString() };
  if (kind === "shopify") {
    const c = { ...base, shop };
    const d = await shopifyGql<{ shop: { name: string }; blogs: { nodes: { id: string; title: string }[] } }>(c, "{ shop { name } blogs(first: 50) { nodes { id title } } }");
    const blog = pickBlog(d.blogs.nodes);
    if (!blog) throw new Error("This store has no blog yet. Add one in Shopify under Online Store, then Blog posts, and connect again.");
    return { name: d.shop.name || shop, config: { ...c, blogId: blog.id, shopName: d.shop.name }, check: `Blog: ${blog.title}` };
  }
  const res = await fetch("https://api.hubapi.com/cms/v3/blog-settings/settings?limit=50", { headers: { Authorization: `Bearer ${t.access_token}`, Accept: "application/json" }, signal: AbortSignal.timeout(20_000) });
  const data = (await res.json().catch(() => ({}))) as { results?: { id: string; name?: string; publicTitle?: string; absoluteUrl?: string }[]; message?: string };
  if (!res.ok) throw new Error(`HubSpot said ${res.status}: ${String(data.message ?? res.statusText).slice(0, 200)}`);
  const blog = pickBlog((data.results ?? []).map((b) => ({ ...b, title: b.name || b.publicTitle || "Blog" })));
  if (!blog) throw new Error("This HubSpot account has no blog yet. Add one in HubSpot, then connect again.");
  return { name: blog.absoluteUrl?.replace(/^https?:\/\//, "") || blog.title, config: { ...base, blogId: String(blog.id) }, check: `Blog: ${blog.title}` };
}

/**
 * A site's config with a live token. A signed-in Shopify or HubSpot site renews its token when it ends soon and saves
 * the new one. When two calls renew at once and Shopify has already rotated the refresh token, the second reads the
 * saved config back and uses the first one's token.
 */
export async function freshConfig(db: SupabaseClient, conn: { id: string; kind: string; config: unknown }): Promise<Record<string, string>> {
  const c = (conn.config ?? {}) as Record<string, string>;
  if ((conn.kind !== "shopify" && conn.kind !== "hubspot") || !needsRefresh(c, Date.now())) return c;
  try {
    const next = refreshed(c, await refreshCall(conn.kind, c), Date.now());
    const { error } = await db.from("cms_connections").update({ config: next }).eq("id", conn.id);
    if (error) throw new Error(error.message);
    return next;
  } catch (e) {
    const { data } = await db.from("cms_connections").select("config").eq("id", conn.id).maybeSingle();
    const saved = (data?.config ?? {}) as Record<string, string>;
    if (saved.refreshToken && saved.refreshToken !== c.refreshToken && !needsRefresh(saved, Date.now())) return saved;
    const name = conn.kind === "shopify" ? "Shopify" : "HubSpot";
    throw new Error(`${name} needs you to connect again: ${e instanceof Error ? e.message : String(e)}`);
  }
}
