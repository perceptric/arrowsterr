import { composioReady } from "@/lib/composio";
import { partnerRoute } from "@/lib/partnerApi";
import { usableIntegrations } from "@/lib/partnerConnect";

// The apps a partner's customers can connect: { integrations: [{ id, name }] }. Empty when none work on this server.
export async function GET(request: Request) {
  return partnerRoute(request, async () => Response.json({ integrations: usableIntegrations(composioReady()) }));
}
