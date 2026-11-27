import { requireRole } from "@/lib/serverAuth";
import { errorResponse } from "@/lib/errorsServer";

type SiteRow = { ga4_property?: string | null; ga4_property_name?: string | null; ga4_email?: string | null };

// The brand's Google Analytics connection, for Brand settings. Connecting happens on Analytics.
//   { workspaceId, brandId }   viewers and up
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const auth = await requireRole(request, body.workspaceId, "viewer");
  if ("denied" in auth) return auth.denied;

  const { data, error } = await auth.sb.from("brands").select("ga4_property, ga4_property_name, ga4_email").eq("id", body.brandId).eq("workspace_id", body.workspaceId).maybeSingle();
  if (error) return errorResponse(error, "api/site");
  if (!data) return Response.json({ error: "Brand not found." }, { status: 404 });
  const g = data as SiteRow;
  const ga4 = g.ga4_email ? { email: g.ga4_email, property: g.ga4_property ?? null, name: g.ga4_property_name ?? null } : null;
  return Response.json({ connected: Boolean(ga4?.property), ga4 });
}
