import { requireRole } from "@/lib/serverAuth";

type SiteRow = { domain: string; ga4_property: string | null; ga4_property_name: string | null; ga4_email: string | null };

// Website analytics for one brand: is Google Analytics connected, and is a property picked?
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const auth = await requireRole(request, body.workspaceId, "viewer");
  if ("denied" in auth) return auth.denied;
  const { data, error } = await auth.sb.from("brands").select("domain, ga4_property, ga4_property_name, ga4_email").eq("id", body.brandId).eq("workspace_id", body.workspaceId).maybeSingle();
  if (error) {
    console.error("Site status failed:", error.message);
    return Response.json({ error: "Could not load the website status." }, { status: 500 });
  }
  if (!data) return Response.json({ error: "Brand not found." }, { status: 404 });
  const g = data as SiteRow;
  const ga4 = g.ga4_email ? { email: g.ga4_email, property: g.ga4_property, name: g.ga4_property_name } : null;
  if (ga4?.property) return Response.json({ connected: true, live: true, source: "ga4", domain: g.domain, ga4 });
  return Response.json({ connected: false, domain: g.domain, ga4 });
}
