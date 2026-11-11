import { readState, stateReady } from "@/lib/google";
import { adminClient } from "@/lib/serverAuth";
import { webflowReady, webflowSetup, webflowToken } from "@/lib/webflowAuth";

// Webflow sends people back here after they allow access (a popup opened by the connect wizard). Save the site, then
// tell the wizard and close. Opened on its own, it goes back to Settings › Publishing sites.
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export async function GET(request: Request) {
  const url = new URL(request.url);
  const host = request.headers.get("x-forwarded-host");
  const base = host ? `https://${host}` : url.origin;
  const answer = (msg: { ok: boolean; reason?: string; check?: string }) => {
    const text = msg.ok ? "Webflow is connected. You can close this window." : (msg.reason ?? "Could not connect Webflow.");
    const payload = JSON.stringify({ type: "arrowsterr:webflow", ...msg }).replace(/</g, "\\u003c");
    const back = `${base}/settings/publishing?${new URLSearchParams({ webflow: msg.ok ? "connected" : "error", ...(msg.reason ? { reason: msg.reason } : {}) })}`;
    const html = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Webflow</title><body style="font:14px/1.5 system-ui,sans-serif;padding:32px;color:#171717"><p>${esc(text)}</p><script>(function(){var m=${payload};if(window.opener){try{window.opener.postMessage(m,${JSON.stringify(base)})}catch(e){}setTimeout(function(){window.close()},400)}else{location.replace(${JSON.stringify(back)})}})()</script></body>`;
    return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
  };

  const state = stateReady() ? readState(url.searchParams.get("state") ?? "") : null;
  if (!state || state.kind !== "webflow") return answer({ ok: false, reason: "The sign-in link expired. Try again." });
  if (url.searchParams.get("error")) return answer({ ok: false, reason: "Webflow access was not allowed." });
  if (!webflowReady()) return answer({ ok: false, reason: "Webflow sign-in is not set up on the server." });
  const db = adminClient();
  if (!db) return answer({ ok: false, reason: "Add SUPABASE_SECRET_KEY to the server's settings." });
  try {
    // Connecting a site is for admins, as with a pasted token. They must still be one.
    const { data: member } = await db.from("workspace_members").select("role").eq("workspace_id", state.workspaceId).eq("user_id", state.userId).maybeSingle();
    if (!member || !["owner", "admin"].includes(String(member.role))) return answer({ ok: false, reason: "You need admin access to connect a publishing site." });
    const { data: brand } = await db.from("brands").select("id").eq("id", state.brandId).eq("workspace_id", state.workspaceId).maybeSingle();
    if (!brand) return answer({ ok: false, reason: "That brand is gone." });
    const token = await webflowToken(url.searchParams.get("code") ?? "", base);
    const { name, config, check } = await webflowSetup(token);
    // Signing in again for the same collection refreshes that site instead of adding a second one.
    const { data: same } = await db.from("cms_connections").select("id, config").eq("workspace_id", state.workspaceId).eq("brand_id", state.brandId).eq("kind", "webflow");
    const old = (same ?? []).find((c) => (c.config as Record<string, string>)?.collectionId === config.collectionId);
    const res = old ? await db.from("cms_connections").update({ name, config }).eq("id", old.id) : await db.from("cms_connections").insert({ workspace_id: state.workspaceId, brand_id: state.brandId, kind: "webflow", name, config });
    if (res.error) throw new Error(res.error.message);
    return answer({ ok: true, check });
  } catch (e) {
    return answer({ ok: false, reason: e instanceof Error ? e.message.slice(0, 200) : "Could not connect Webflow." });
  }
}
