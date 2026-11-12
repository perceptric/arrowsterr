import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

// The page a CMS sign-in window lands on (Webflow, Shopify, HubSpot): it tells the connect wizard how it went and
// closes. Opened on its own (no wizard behind it), it goes back to Settings › Publishing sites.

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const LABEL: Record<string, string> = { webflow: "Webflow", shopify: "Shopify", hubspot: "HubSpot" };

export function oauthAnswer(base: string, kind: string, msg: { ok: boolean; reason?: string; check?: string }) {
  const name = LABEL[kind] ?? kind;
  const text = msg.ok ? `${name} is connected. You can close this window.` : (msg.reason ?? `Could not connect ${name}.`);
  const payload = JSON.stringify({ type: `arrowsterr:${kind}`, ...msg }).replace(/</g, "\\u003c");
  const back = `${base}/settings/publishing?${new URLSearchParams({ [kind]: msg.ok ? "connected" : "error", ...(msg.reason ? { reason: msg.reason } : {}) })}`;
  const html = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(name)}</title><body style="font:14px/1.5 system-ui,sans-serif;padding:32px;color:#171717"><p>${esc(text)}</p><script>(function(){var m=${payload};if(window.opener){try{window.opener.postMessage(m,${JSON.stringify(base)})}catch(e){}setTimeout(function(){window.close()},400)}else{location.replace(${JSON.stringify(back)})}})()</script></body>`;
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}

export const callbackBase = (request: Request) => {
  const host = request.headers.get("x-forwarded-host");
  return host ? `https://${host}` : new URL(request.url).origin;
};

/** Connecting a site is for admins, as with a pasted key. The person who started must still be one, and the brand still there. */
export async function mayConnect(db: SupabaseClient, s: { workspaceId: string; userId: string; brandId: string }): Promise<string | null> {
  const { data: member } = await db.from("workspace_members").select("role").eq("workspace_id", s.workspaceId).eq("user_id", s.userId).maybeSingle();
  if (!member || !["owner", "admin"].includes(String(member.role))) return "You need admin access to connect a publishing site.";
  const { data: brand } = await db.from("brands").select("id").eq("id", s.brandId).eq("workspace_id", s.workspaceId).maybeSingle();
  return brand ? null : "That brand is gone.";
}

/** Save a signed-in site. Signing in again to the same store or blog refreshes that site instead of adding another. */
export async function saveSite(db: SupabaseClient, s: { workspaceId: string; brandId: string }, kind: string, name: string, config: Record<string, string>, same: (old: Record<string, string>) => boolean) {
  const { data } = await db.from("cms_connections").select("id, config").eq("workspace_id", s.workspaceId).eq("brand_id", s.brandId).eq("kind", kind);
  const old = (data ?? []).find((c) => same((c.config ?? {}) as Record<string, string>));
  const res = old ? await db.from("cms_connections").update({ name, config }).eq("id", old.id) : await db.from("cms_connections").insert({ workspace_id: s.workspaceId, brand_id: s.brandId, kind, name, config });
  if (res.error) throw new Error(res.error.message);
}
