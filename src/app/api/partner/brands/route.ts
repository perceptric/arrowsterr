import { createBrand, partnerRoute } from "@/lib/partnerApi";

// Make a brand for one of the partner's customers. { name, domain, external_id } → 201, or 200 with the brand made before.
export async function POST(request: Request) {
  return partnerRoute(request, async (p) => createBrand(p, await request.json().catch(() => null)));
}
