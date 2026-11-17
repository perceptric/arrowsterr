import { dfsReady } from "@/lib/dataforseo";
import { requireTrack, take } from "@/lib/entitlements";
import { meteredRoute } from "@/lib/meter";
import { TASK_COST } from "@/lib/plans";
import { presenceList } from "@/lib/presence";
import { brandPresence, marketFor, postChecks, toCheck, wikiPresence } from "@/lib/presenceServer";
import { isEditor, requireRole } from "@/lib/serverAuth";

// Where AI gets its facts: Wikipedia, Wikidata, Trustpilot and Google Business Profile for a brand and its top competitors.
//   { brandId, competitors: [{ name, domain }] }                  read: free, Wikipedia live and the rest as saved
//   { brandId, competitors, action: "check" }                     editors: queue the paid checks that are missing
// Paid checks use TASK_COST.presence tasks per brand, and the results are kept a week for every workspace.
async function handle(request: Request) {
  const body = await request.json().catch(() => ({}));
  const auth = await requireRole(request, body.workspaceId, "viewer");
  if ("denied" in auth) return auth.denied;
  const { data: brand, error } = await auth.sb.from("brands").select("id, name, domain, profile").eq("id", body.brandId).eq("workspace_id", body.workspaceId).maybeSingle();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!brand) return Response.json({ error: "Brand not found." }, { status: 404 });

  const market = await marketFor(auth.sb, body.workspaceId, brand);
  const list = presenceList({ name: brand.name, domain: brand.domain }, body.competitors);

  try {
    if (body.action === "check") {
      if (!(await isEditor(auth.sb, body.workspaceId))) return Response.json({ error: "You need editor access to check review sites." }, { status: 403 });
      const paid = await requireTrack(body.workspaceId, "visibility");
      if (paid) return paid;
      const need = await toCheck(list, market);
      if (need.length) {
        if (!dfsReady()) return Response.json({ error: "DataForSEO is not set up. Add DFS_LOGIN and DFS_PASSWORD to the server's settings." }, { status: 500 });
        const took = await take(body.workspaceId, "tasks", TASK_COST.presence * need.length);
        if (!took.ok) return took.response;
        // The head office city helps Google find the right profile.
        const wiki = await Promise.all(need.map((b) => wikiPresence(b, market.language)));
        await postChecks(need.map((b, i) => ({ ...b, hq: wiki[i].facts?.hq ?? null })), market);
      }
    }
    const brands = await brandPresence(list, market);
    const unchecked = (await toCheck(list, market)).length;
    return Response.json({ brands, unchecked, taskCost: TASK_COST.presence, paidReady: dfsReady() });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("Brand presence failed:", message);
    return Response.json({ error: message }, { status: 500 });
  }
}

export const POST = meteredRoute("brand presence", handle);
