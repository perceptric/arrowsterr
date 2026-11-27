import { analyticsDashboard, articleResults, dashboardRows, googleFor, gscSitesFor, hasGscScope, ownRanks, queueSyncNow } from "@/lib/seoAnalyticsServer";
import { googleReady } from "@/lib/google";
import { adminClient, requireRole } from "@/lib/serverAuth";

// The Analytics page: Search Console and Google Analytics 4 for one brand, from the daily sync (seoAnalyticsServer.ts).
//   { workspaceId, brandId, action }
//   "status"    the Google sign-in, the picked properties and the sync. Viewers and up.
//   "dashboard" { days: 7 | 28 | 90 | 365, page? } everything on the Analytics page against the period before. Viewers and up.
//   "rows"      { days, kind: "pages" | "queries", offset } 25 more rows of the Pages or Searches table. Viewers and up.
//   "ranks"     { queries: string[] } where the brand ranks for each, from Search Console. Viewers and up.
//   "results"   { itemId? } before and after for published articles and refreshes (all recent ones, or one). Viewers and up.
//   "sites"     the Search Console properties the sign-in can read. Editors only.
//   "site"      { property } use one for this brand and sync it. Editors only.
//   "sync"      sync now. Editors only.
const EDIT = new Set(["sites", "site", "sync"]);

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const action = String(body.action ?? "status");
  const auth = await requireRole(request, body.workspaceId, EDIT.has(action) ? "editor" : "viewer");
  if ("denied" in auth) return auth.denied;
  const db = adminClient();
  if (!db) return Response.json({ error: "Add SUPABASE_SECRET_KEY to the server's settings." }, { status: 500 });
  const { data: own } = await auth.sb.from("brands").select("id").eq("id", String(body.brandId ?? "")).eq("workspace_id", String(body.workspaceId)).maybeSingle();
  if (!own) return Response.json({ error: "Brand not found." }, { status: 404 });

  try {
    const g = await googleFor(db, own.id);
    if (!g) return Response.json({ error: "Brand not found." }, { status: 404 });
    const { brand, conn, state } = g;

    if (action === "status")
      return Response.json({
        ready: googleReady(),
        connected: Boolean(conn),
        email: conn?.email ?? null,
        gsc: hasGscScope(conn?.scopes),
        gscProperty: brand.gsc_property,
        ga4Property: brand.ga4_property,
        ga4Name: brand.ga4_property_name,
        state,
      });

    const days = [7, 28, 90, 365].includes(Number(body.days)) ? Number(body.days) : 28;
    if (action === "dashboard") return Response.json(await analyticsDashboard(db, brand, days, state, typeof body.page === "string" ? body.page : null));
    if (action === "rows") return Response.json(await dashboardRows(db, brand, body.kind === "queries" ? "queries" : "pages", days, state, Math.max(0, Math.floor(Number(body.offset) || 0))));

    if (action === "ranks") {
      const queries = Array.isArray(body.queries) ? body.queries.map(String).slice(0, 300) : [];
      return Response.json({ ranks: brand.gsc_property ? await ownRanks(db, brand.id, queries, state) : {} });
    }

    if (action === "results") {
      const itemId = typeof body.itemId === "string" ? body.itemId : undefined;
      return Response.json({ results: await articleResults(db, brand.id, state, { itemId, limit: itemId ? 1 : 20 }), connected: Boolean(conn && (brand.gsc_property || brand.ga4_property)) });
    }

    if (!conn) return Response.json({ error: "Connect Google first." }, { status: 400 });

    if (action === "sites") {
      if (!hasGscScope(conn.scopes)) return Response.json({ error: "Reconnect Google to add Search Console." }, { status: 400 });
      return Response.json(await gscSitesFor(conn, brand.domain));
    }

    if (action === "site") {
      const { sites } = await gscSitesFor(conn, brand.domain);
      const pick = sites.find((s) => s.url === String(body.property));
      if (!pick) return Response.json({ error: "That property is not on this Google account." }, { status: 400 });
      if (pick.url !== brand.gsc_property) {
        // A new property starts its history again.
        await db.from("brands").update({ gsc_property: pick.url }).eq("id", brand.id);
        await Promise.all([
          db.from("analytics_gsc").delete().eq("brand_id", brand.id),
          db.from("analytics_gsc_days").delete().eq("brand_id", brand.id),
          db.from("analytics_state").update({ gsc_from: null, gsc_to: null, backfilled: false }).eq("brand_id", brand.id),
        ]);
      }
      await queueSyncNow(brand);
      return Response.json({ ok: true, property: pick.url });
    }

    if (action === "sync") {
      await queueSyncNow(brand);
      return Response.json({ ok: true });
    }
    return Response.json({ error: "Unknown action." }, { status: 400 });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
