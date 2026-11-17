import { apiAuth } from "@/lib/integrations";
import { brandById } from "@/lib/keyScope";

// A brand's Topic Bank: keywords with volume, difficulty, intent and stage.  ?brand_id=…
export async function GET(request: Request) {
  const a = await apiAuth(request, { brandKey: true });
  if ("denied" in a) return a.denied;
  const brandId = new URL(request.url).searchParams.get("brand_id") || a.brandId || "";
  const brand = await brandById<{ id: string }>(a, brandId, "id");
  if (!brand) return Response.json({ error: "Brand not found. Get its id from /api/v1/brands." }, { status: 404 });
  const { data: site } = await a.db.from("sites").select("id, domain, profile").eq("brand_id", brand.id).eq("workspace_id", a.ws).maybeSingle();
  if (!site) return Response.json({ error: "No Topic Bank for this brand yet." }, { status: 404 });
  const bank = ((site.profile as { bank?: Record<string, unknown>[] })?.bank ?? []).map((b) => ({
    keyword: b.keyword,
    volume: b.volume,
    difficulty: b.kd,
    intent: b.intent,
    stage: b.stage,
    cpc: b.cpc ?? null,
    theme: b.theme ?? null,
    job: b.action ?? "new",
    page: b.url ?? null,
    added: b.added,
  }));
  return Response.json({ site: site.domain, keywords: bank });
}
