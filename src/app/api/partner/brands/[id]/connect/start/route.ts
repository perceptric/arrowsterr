import { partnerRoute } from "@/lib/partnerApi";
import { liveConnectDeps, startConnect } from "@/lib/partnerConnect";

type Params = { params: Promise<{ id: string }> };

// A sign-in link for the brand's customer: { integration, return_url } → { url }. It works once, for 30 minutes.
export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  const body = await request.json().catch(() => null);
  return partnerRoute(request, async (p) => startConnect(p, id, body, await liveConnectDeps(p.db)));
}
