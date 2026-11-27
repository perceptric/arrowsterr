import { apiAuth } from "@/lib/integrations";
import { brandById } from "@/lib/keyScope";
import { errorResponse } from "@/lib/errorsServer";

// A brand's Editorial Calendar.  ?brand_id=…
export async function GET(request: Request) {
  const a = await apiAuth(request, { brandKey: true });
  if ("denied" in a) return a.denied;
  const brandId = new URL(request.url).searchParams.get("brand_id") || a.brandId || "";
  const brand = await brandById<{ id: string }>(a, brandId, "id");
  if (!brand) return Response.json({ error: "Brand not found. Get its id from /api/v1/brands." }, { status: 404 });
  const { data: site } = await a.db.from("sites").select("id").eq("brand_id", brand.id).eq("workspace_id", a.ws).maybeSingle();
  if (!site) return Response.json({ error: "No Editorial Calendar for this brand yet." }, { status: 404 });
  const { data, error } = await a.db
    .from("calendar_items")
    .select("id, keyword, stage, volume, difficulty, status, due_date, owner, url, action, brief_status")
    .eq("site_id", site.id)
    .order("due_date", { nullsFirst: false });
  if (error) return errorResponse(error, "api/v1/calendar");
  return Response.json({ items: data });
}
