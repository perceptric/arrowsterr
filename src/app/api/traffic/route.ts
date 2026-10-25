import { ga4Traffic } from "@/lib/ga4";
import { accessToken } from "@/lib/google";
import { adminClient, requireRole } from "@/lib/serverAuth";

// A brand's website traffic from Google Analytics, plus visits from AI assistants. Cached for 10 minutes per brand.
const cache = new Map<string, { at: number; data: unknown }>();

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const auth = await requireRole(request, body.workspaceId, "viewer");
  if ("denied" in auth) return auth.denied;
  const days = [7, 30, 60, 90].includes(Number(body.days)) ? Number(body.days) : 30;

  const { data: g } = await auth.sb.from("brands").select("id, ga4_property").eq("id", body.brandId).eq("workspace_id", body.workspaceId).maybeSingle();
  const brand = g as { id: string; ga4_property: string | null } | null;
  if (!brand?.ga4_property) return Response.json({ error: "Connect Google Analytics to see traffic." }, { status: 400 });
  // The brand's own Google connection comes first, so a cached answer is never shared with a brand that lacks access.
  const { data: conn } = (await adminClient()?.from("ga4_connections").select("refresh_token").eq("brand_id", brand.id).maybeSingle()) ?? { data: null };
  if (!conn) return Response.json({ error: "Reconnect Google Analytics." }, { status: 400 });

  const key = `ga4:${brand.id}:${brand.ga4_property}:${days}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 10 * 60_000) return Response.json(hit.data);
  try {
    const data = await ga4Traffic(await accessToken(conn.refresh_token), brand.ga4_property, days);
    cache.set(key, { at: Date.now(), data });
    if (cache.size > 500) cache.delete(cache.keys().next().value!);
    return Response.json(data);
  } catch (e) {
    console.error("GA4 traffic failed:", e instanceof Error ? e.message : e);
    return Response.json({ error: "Could not load Google Analytics. Try again, or reconnect it." }, { status: 500 });
  }
}
