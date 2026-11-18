import { getBrand, partnerRoute, removeBrand } from "@/lib/partnerApi";

type Params = { params: Promise<{ id: string }> };

// One of the partner's brands.
export async function GET(request: Request, { params }: Params) {
  const { id } = await params;
  return partnerRoute(request, (p) => getBrand(p, id));
}

// Delete the brand and its data. Its brand keys are revoked.
export async function DELETE(request: Request, { params }: Params) {
  const { id } = await params;
  return partnerRoute(request, (p) => removeBrand(p, id));
}
