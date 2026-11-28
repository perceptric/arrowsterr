import { articleResults, googleFor, gscSitesFor, hasGscScope, ownRanks, queueSyncNow } from "@/lib/seoAnalyticsServer";
import { googleReady } from "@/lib/google";
import { compareRange, GA4_DIMS, GSC_DIMS, GSC_TYPES, readFilters, readRange, type CompareMode, type GscType } from "@/lib/googleReports";
import { ga4ByPath, ga4Now, ga4Report, gscByPath, gscDeclines, gscReport, gscTopPage } from "@/lib/googleReportsServer";
import { adminClient, requireRole } from "@/lib/serverAuth";
import { errorResponse, report } from "@/lib/errorsServer";

// The Analytics page: Search Console and Google Analytics 4 for one brand, live from Google (googleReportsServer.ts),
// and the daily sync (seoAnalyticsServer.ts) for Drafts, Zippie and reports.
//   { workspaceId, brandId, action }
//   "status"    the Google sign-in, the picked properties and the sync. Viewers and up.
//   "gsc"       { range: { from, to }, compare: "prev" | "year" | "none", type, filters, hourly } the Search Console report. Viewers and up.
//   "ga4"       { range, compare, filters, hourly } the Google Analytics report. Viewers and up.
//   "now"       active users in the last 30 minutes, by page and country, from GA4. Viewers and up.
//   "declines"  { range, compare } Search Console clicks by page in both periods and the search each lost most. Viewers and up.
//   "join"      { source: "gsc" | "ga4", range } the other side's numbers by page path, for the extra table columns. Viewers and up.
//   "toppage"   { query, range } the page with the most impressions for one search. Viewers and up.
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

    if (action === "gsc" || action === "ga4" || action === "now" || action === "join" || action === "toppage" || action === "declines") {
      if (!conn) return Response.json({ error: "Connect Google first." }, { status: 400 });
      const today = new Date().toISOString().slice(0, 10);
      // Google's day can be ahead of the server's, so allow tomorrow.
      const range = readRange(body.range, new Date(Date.now() + 864e5).toISOString().slice(0, 10)) ?? { from: today, to: today };
      const mode: CompareMode = body.compare === "year" || body.compare === "none" ? body.compare : "prev";
      const hourly = body.hourly === true;
      if (action === "gsc") {
        if (!brand.gsc_property) return Response.json({ error: "Pick a Search Console site first." }, { status: 400 });
        const type: GscType = GSC_TYPES.some((t) => t.id === body.type) ? (body.type as GscType) : "web";
        try {
          return Response.json(await gscReport(db, brand, conn, { range, prev: compareRange(range, mode), type, filters: readFilters(body.filters, GSC_DIMS), hourly }));
        } catch (e) {
          // No hourly data on this property: the page hides 24 hours.
          if (hourly) return Response.json({ noHourly: true, error: report(e, "api/seo-analytics").error });
          throw e;
        }
      }
      if (action === "declines") {
        const prev = compareRange(range, mode === "none" ? "prev" : mode);
        return Response.json({ rows: brand.gsc_property && prev ? await gscDeclines(brand, conn, range, prev) : [] });
      }
      if (action === "toppage") return Response.json({ page: brand.gsc_property && typeof body.query === "string" && body.query.trim() ? await gscTopPage(brand, conn, body.query.trim().slice(0, 300), range) : null });
      if (!brand.ga4_property && action !== "join") return Response.json({ error: "Pick a GA4 property first." }, { status: 400 });
      if (action === "ga4") return Response.json(await ga4Report(db, brand, conn, { range, prev: compareRange(range, mode), filters: readFilters(body.filters, GA4_DIMS), hourly }));
      if (action === "now") return Response.json(await ga4Now(brand, conn));
      if (body.source === "gsc") return Response.json({ rows: brand.gsc_property ? await gscByPath(brand, conn, range) : [] });
      return Response.json({ rows: brand.ga4_property ? await ga4ByPath(brand, conn, range) : [] });
    }

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
    return errorResponse(e, "api/seo-analytics");
  }
}
