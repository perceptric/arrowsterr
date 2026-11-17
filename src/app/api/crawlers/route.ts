import { crawlerData } from "@/lib/aiCrawlersServer";
import { adminClient, requireRole } from "@/lib/serverAuth";

// The AI crawler report for one brand's site (Visitors page): which AI bots read which pages, from Cloudflare
// or the Arrowsterr Connector plugin on WordPress. Viewers can read it; fresh: true skips the 15-minute cache.
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const auth = await requireRole(request, body.workspaceId, "viewer");
  if ("denied" in auth) return auth.denied;
  const db = adminClient();
  if (!db) return Response.json({ error: "Add SUPABASE_SECRET_KEY to the server's settings." }, { status: 500 });
  const { data: brand } = await auth.sb.from("brands").select("id, workspace_id, domain").eq("id", body.brandId).eq("workspace_id", body.workspaceId).maybeSingle();
  if (!brand) return Response.json({ error: "Brand not found." }, { status: 404 });
  const days = [7, 30, 60, 90].includes(Number(body.days)) ? Number(body.days) : 30;
  try {
    return Response.json(await crawlerData(db, brand.workspace_id as string, { id: brand.id as string, domain: brand.domain as string }, days, body.fresh === true));
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("AI crawlers failed:", message);
    return Response.json({ error: message.slice(0, 300) }, { status: 500 });
  }
}
