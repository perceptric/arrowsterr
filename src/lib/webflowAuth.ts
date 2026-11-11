import "server-only";
import { mapFields, pickCollection } from "./cmsMap";

// Sign in with Webflow (docs/drafts-plan.md, 3.3): one click instead of a pasted token. Needs WEBFLOW_CLIENT_ID and
// WEBFLOW_CLIENT_SECRET from a Webflow Data Client app whose redirect URI is <app>/api/cms/webflow/callback.
// After the sign-in, the blog collection and its fields are found on their own.

const SCOPES = ["sites:read", "cms:read", "cms:write"];
const API = "https://api.webflow.com/v2";

export const webflowReady = () => Boolean(process.env.WEBFLOW_CLIENT_ID?.trim() && process.env.WEBFLOW_CLIENT_SECRET?.trim());
export const webflowRedirect = (origin: string) => `${origin}/api/cms/webflow/callback`;

export function webflowAuthUrl(origin: string, state: string) {
  const q = new URLSearchParams({ response_type: "code", client_id: process.env.WEBFLOW_CLIENT_ID!.trim(), redirect_uri: webflowRedirect(origin), scope: SCOPES.join(" "), state });
  return `https://webflow.com/oauth/authorize?${q}`;
}

async function wf<T>(path: string, token: string): Promise<T> {
  const res = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }, signal: AbortSignal.timeout(20_000) });
  const data = (await res.json().catch(() => ({}))) as T & { message?: string };
  if (!res.ok) throw new Error(`Webflow said ${res.status}: ${String(data.message ?? res.statusText).slice(0, 200)}`);
  return data;
}

/** Trade the code from Webflow's sign-in for an access token. */
export async function webflowToken(code: string, origin: string) {
  const res = await fetch("https://api.webflow.com/oauth/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({ client_id: process.env.WEBFLOW_CLIENT_ID!.trim(), client_secret: process.env.WEBFLOW_CLIENT_SECRET!.trim(), code, grant_type: "authorization_code", redirect_uri: webflowRedirect(origin) }),
    signal: AbortSignal.timeout(20_000),
  });
  const data = (await res.json().catch(() => ({}))) as { access_token?: string; error?: string; error_description?: string };
  if (!res.ok || !data.access_token) throw new Error(`Webflow sign-in failed: ${data.error_description || data.error || res.status}`);
  return data.access_token;
}

type Site = { id: string; displayName?: string; shortName?: string };
type Collection = { id: string; displayName: string; slug?: string };
type Field = { slug: string; displayName: string; type: string };

/**
 * The site and blog collection the sign-in allowed, with the fields mapped: the first site with a collection that
 * looks like a blog and has a rich text field. The connection is saved with these, the same as a pasted token.
 */
export async function webflowSetup(token: string): Promise<{ name: string; config: Record<string, string>; check: string }> {
  const { sites } = await wf<{ sites: Site[] }>("/sites", token);
  if (!sites?.length) throw new Error("No Webflow site was shared. Sign in again and pick your site.");
  for (const site of sites) {
    const { collections } = await wf<{ collections: Collection[] }>(`/sites/${site.id}/collections`, token);
    const col = pickCollection((collections ?? []).map((c) => ({ id: c.id, name: c.displayName })));
    if (!col) continue;
    const full = await wf<{ fields: Field[] }>(`/collections/${col.id}`, token);
    const map = mapFields((full.fields ?? []).map((f) => ({ id: f.slug, name: f.displayName, type: f.type })));
    if (!map) continue;
    const config: Record<string, string> = { token, siteId: site.id, collectionId: col.id, bodyField: map.body };
    if (map.summary) config.summaryField = map.summary;
    if (map.image) config.imageField = map.image;
    const name = site.displayName || site.shortName || "Webflow";
    return { name, config, check: `Collection: ${col.name}` };
  }
  throw new Error("None of the shared sites has a blog collection with a rich text field. Add one in Webflow, then sign in again.");
}
