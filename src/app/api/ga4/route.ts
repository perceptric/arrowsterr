import { accessToken, listProperties } from "@/lib/google";
import { adminClient, requireRole } from "@/lib/serverAuth";
import { queueSyncNow } from "@/lib/seoAnalyticsServer";
import { errorResponse } from "@/lib/errorsServer";

// Google Analytics for one brand, after sign-in. Picking a property starts the Analytics sync.
//   action "properties": every GA4 property the account can read. Editors only.
//   action "select": use one property for this brand. Editors only.
//   action "disconnect": remove the Google sign-in. Editors only.
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const auth = await requireRole(request, body.workspaceId, "editor");
  if ("denied" in auth) return auth.denied;
  const db = adminClient();
  if (!db) return Response.json({ error: "Add SUPABASE_SECRET_KEY to the server's settings." }, { status: 500 });
  const { data: brand } = await auth.sb.from("brands").select("id, workspace_id").eq("id", body.brandId).eq("workspace_id", body.workspaceId).maybeSingle();
  if (!brand) return Response.json({ error: "Brand not found." }, { status: 404 });

  try {
    if (body.action === "disconnect") {
      await db.from("ga4_connections").delete().eq("brand_id", brand.id);
      await db.from("brands").update({ ga4_property: null, ga4_property_name: null, ga4_email: null }).eq("id", brand.id);
      // The same sign-in reads Search Console (Analytics page). Before supabase/104_analytics.sql there is no column.
      await db.from("brands").update({ gsc_property: null }).eq("id", brand.id);
      return Response.json({ ok: true });
    }
    const { data: conn } = await db.from("ga4_connections").select("refresh_token").eq("brand_id", brand.id).maybeSingle();
    if (!conn) return Response.json({ error: "Connect Google Analytics first." }, { status: 400 });
    const list = await listProperties(await accessToken(conn.refresh_token));
    if (body.action === "select") {
      const pick = list.find((p) => p.id === String(body.property));
      if (!pick) return Response.json({ error: "That property is not on this Google account." }, { status: 400 });
      await db.from("brands").update({ ga4_property: pick.id, ga4_property_name: pick.name }).eq("id", brand.id);
      await queueSyncNow(brand).catch(() => null);
      return Response.json({ ok: true, property: pick });
    }
    return Response.json({ properties: list });
  } catch (e) {
    return errorResponse(e, "api/ga4");
  }
}
