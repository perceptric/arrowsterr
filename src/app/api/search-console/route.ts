import { composioReady, hasApp } from "@/lib/composio";
import { entitlement } from "@/lib/entitlements";
import { meteredRoute } from "@/lib/meter";
import type { SearchReport } from "@/lib/searchEngines";
import { bingReport, gscReport } from "@/lib/searchEnginesServer";
import { adminClient, requireRole } from "@/lib/serverAuth";
import { googleFor, hasGscScope, syncedGscReport } from "@/lib/seoAnalyticsServer";

// Google Search Console or Bing Webmaster Tools numbers for one brand's domain, for the Traffic page.
//   { workspaceId, brandId, engine: "google" | "bing", days }   viewers and up
// Google: from the daily Analytics sync when the brand signed in to Google with Search Console (seoAnalyticsServer.ts).
// Otherwise, and for Bing, through the workspace's Composio connection (Apps for Zippie), on Starter and up.
async function handle(request: Request) {
  const body = await request.json().catch(() => ({}));
  const auth = await requireRole(request, body.workspaceId, "viewer");
  if ("denied" in auth) return auth.denied;
  const ws = String(body.workspaceId);
  const engine = body.engine === "bing" ? "bing" : "google";
  const days = [7, 30, 60, 90].includes(Number(body.days)) ? Number(body.days) : 30;

  const { data: brand, error } = await auth.sb.from("brands").select("domain").eq("id", String(body.brandId ?? "")).eq("workspace_id", ws).maybeSingle();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  const domain = String((brand as { domain: string | null } | null)?.domain ?? "").trim();
  if (!brand) return Response.json({ error: "Brand not found." }, { status: 404 });

  if (engine === "google") {
    const db = adminClient();
    const g = db ? await googleFor(db, String(body.brandId)) : null;
    if (db && g?.conn && hasGscScope(g.conn.scopes)) {
      const synced = await syncedGscReport(db, g.brand, g.state, days).catch(() => null);
      if (synced) return Response.json(synced);
    }
  }
  if (!(await entitlement(ws)).limits.mcp) return Response.json({ allowed: false } satisfies SearchReport);
  if (!composioReady()) return Response.json({ allowed: true, connected: false, ready: false } satisfies SearchReport);
  const slug = engine === "bing" ? "bing_webmaster_tools" : "google_search_console";
  const name = engine === "bing" ? "Bing Webmaster Tools" : "Search Console";
  try {
    if (!(await hasApp(ws, slug))) return Response.json({ allowed: true, connected: false, ready: true } satisfies SearchReport);
    if (!domain) return Response.json({ allowed: true, connected: true, property: null, sites: [] } satisfies SearchReport);
    return Response.json(engine === "bing" ? await bingReport(ws, domain, days) : await gscReport(ws, domain, days));
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(`${name} failed:`, message);
    // Composio errors come as JSON text; show only the message inside.
    const said = message.match(/"message"\s*:\s*"([^"]+)"/)?.[1] ?? message;
    return Response.json({ error: `Couldn't load ${name}. ${said}`.slice(0, 400) }, { status: 502 });
  }
}

export const POST = meteredRoute("search console", handle);
