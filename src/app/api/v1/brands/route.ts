import { apiAuth } from "@/lib/integrations";
import { brandRows } from "@/lib/keyScope";
import { errorResponse } from "@/lib/errorsServer";

// The workspace's brands. A brand key sees only its own.
export async function GET(request: Request) {
  const a = await apiAuth(request, { brandKey: true });
  if ("denied" in a) return a.denied;
  const { data, error } = await brandRows(a, "id, name, domain, created_at").order("created_at");
  if (error) return errorResponse(error, "api/v1/brands");
  return Response.json({ brands: data });
}
