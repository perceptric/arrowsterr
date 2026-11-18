import { makeBrandKey, partnerRoute, revokeBrandKeys } from "@/lib/partnerApi";

type Params = { params: Promise<{ id: string }> };

// A new brand key (aw_brand_…), shown once. It sees only this brand.
export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  return partnerRoute(request, (p) => makeBrandKey(p, id));
}

// Revoke every brand key of this brand at once.
export async function DELETE(request: Request, { params }: Params) {
  const { id } = await params;
  return partnerRoute(request, (p) => revokeBrandKeys(p, id));
}
