import { brandUsage, partnerRoute } from "@/lib/partnerApi";

// What the brand used in a month, for the partner's billing.  ?month=YYYY-MM (default this month, UTC)
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return partnerRoute(request, (p) => brandUsage(p, id, new URL(request.url).searchParams.get("month")));
}
