import { exchange, googleReady, readState, seal } from "@/lib/google";
import { adminClient } from "@/lib/serverAuth";
import { merchantConnected } from "@/lib/shopServer";
import { gscSitesFor, hasGscScope, queueSyncNow } from "@/lib/seoAnalyticsServer";

// Google sends people back here after they allow access. Save the encrypted sign-in, then return to the app.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const host = request.headers.get("x-forwarded-host");
  const base = host ? `https://${host}` : url.origin;
  const go = (path: string, q: Record<string, string>) => Response.redirect(`${base}${path}?${new URLSearchParams(q)}`, 302);
  const state = googleReady() ? readState(url.searchParams.get("state") ?? "") : null;
  if (!state) return go("/analytics", { ga4: "error", reason: "The sign-in link expired. Try again." });
  if (url.searchParams.get("error")) return go(state.back, { [state.kind === "merchant" ? "catalog" : "ga4"]: "error", reason: "Google access was not allowed." });

  const db = adminClient();
  if (!db) return go(state.back, { ga4: "error", reason: "Add SUPABASE_SECRET_KEY to the server's settings." });
  try {
    // The person who started must still be an editor of the brand's workspace.
    const { data: member } = await db.from("workspace_members").select("role").eq("workspace_id", state.workspaceId).eq("user_id", state.userId).maybeSingle();
    if (!member || member.role === "viewer") return go(state.back, { [state.kind === "merchant" ? "catalog" : "ga4"]: "error", reason: "You need editor access to connect this." });

    // Google Merchant Center for AI Shopping's catalog (shopServer.ts).
    if (state.kind === "merchant") {
      const m = await exchange(url.searchParams.get("code") ?? "", base);
      if (!m.refresh) return go(state.back, { catalog: "error", reason: "Google did not return access. Try again." });
      await merchantConnected(db, state, m.refresh, m.email);
      return go(state.back, { catalog: "connected" });
    }
    // Google Analytics and Search Console share one sign-in (Analytics page).
    const { refresh, email, scopes } = await exchange(url.searchParams.get("code") ?? "", base);
    if (!refresh) return go(state.back, { ga4: "error", reason: "Google did not return access. Try again." });
    const sealed = seal(refresh);
    let res = await db.from("ga4_connections").upsert({ brand_id: state.brandId, workspace_id: state.workspaceId, refresh_token: sealed, email, connected_by: state.userId, scopes });
    // Before supabase/104_analytics.sql there is no scopes column.
    if (res.error && /scopes/.test(res.error.message)) res = await db.from("ga4_connections").upsert({ brand_id: state.brandId, workspace_id: state.workspaceId, refresh_token: sealed, email, connected_by: state.userId });
    if (res.error) throw new Error(res.error.message + (/ga4_connections/.test(res.error.message) ? " Run supabase/014_google_analytics.sql in Supabase." : ""));
    // A different Google account can't read the old property: pick again. The same account keeps its picks.
    const { data: brand } = await db.from("brands").select("id, workspace_id, domain, ga4_email, gsc_property").eq("id", state.brandId).maybeSingle();
    const same = Boolean(brand?.ga4_email && brand.ga4_email === email);
    await db.from("brands").update(same ? { ga4_email: email } : { ga4_email: email, ga4_property: null, ga4_property_name: null, gsc_property: null }).eq("id", state.brandId);
    // Search Console: pick the property that fits the brand's domain, then start the first sync.
    if (brand && hasGscScope(scopes) && !(same && brand.gsc_property)) {
      const fit = await gscSitesFor({ refresh_token: sealed, email, scopes }, String(brand.domain ?? "")).catch(() => null);
      if (fit?.suggested) await db.from("brands").update({ gsc_property: fit.suggested }).eq("id", state.brandId);
    }
    if (brand) await queueSyncNow({ id: brand.id, workspace_id: brand.workspace_id }).catch(() => null);
    return go(state.back, { ga4: "connected" });
  } catch (e) {
    return go(state.back, { [state.kind === "merchant" ? "catalog" : "ga4"]: "error", reason: e instanceof Error ? e.message.slice(0, 200) : "Could not connect." });
  }
}
