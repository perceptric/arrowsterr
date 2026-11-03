import { meteredRoute } from "@/lib/meter";
import { setupFor } from "@/lib/perceptionServer";
import { adminClient, requireRole } from "@/lib/serverAuth";

// Perception (docs/perception.md): makes a brand's word and category lists the first time the page opens. Haiku picks it once;
// after that it's kept until an editor changes it. Reading the numbers needs no route: the page asks Supabase.
async function handle(request: Request) {
  const body = await request.json().catch(() => ({}));
  const brandId = typeof body.brandId === "string" ? body.brandId : "";
  if (!brandId) return Response.json({ error: "Missing brand." }, { status: 400 });
  const auth = await requireRole(request, body.workspaceId, "editor");
  if ("denied" in auth) return auth.denied;
  // The person can see this brand only if it's in their workspace.
  const { data: own } = await auth.sb.from("brands").select("id").eq("id", brandId).eq("workspace_id", body.workspaceId).maybeSingle();
  if (!own) return Response.json({ error: "Brand not found." }, { status: 404 });
  const db = adminClient();
  if (!db) return Response.json({ error: "Add SUPABASE_SECRET_KEY to the server's settings." }, { status: 500 });
  try {
    const setup = await setupFor(db, brandId);
    if (!setup) return Response.json({ error: "Couldn't pick words for this brand. Try again." }, { status: 502 });
    return Response.json({ setup });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

export const POST = meteredRoute("perception words", handle);
