import { cached, DAY } from "@/lib/cache";
import { dfsReady } from "@/lib/dataforseo";
import { competitors, Spend } from "@/lib/keywords";
import { marketOf } from "@/lib/research";
import { requireRole } from "@/lib/serverAuth";
import { normalizeSite } from "@/lib/site";
import { meteredRoute } from "@/lib/meter";
import { requireTrack, take } from "@/lib/entitlements";
import { TASK_COST } from "@/lib/plans";
import type { Gap } from "@/lib/gap";
import { intersect, rows } from "@/lib/gapServer";

// Competitive analysis: the keyword gap between the site and one competitor, and suggested competitors.
//   gap: { siteId, competitor }
//   rivals: { siteId }
async function handle(request: Request) {
  const body = await request.json().catch(() => ({}));
  const auth = await requireRole(request, body.workspaceId, "editor");
  if ("denied" in auth) return auth.denied;
  const paid = await requireTrack(body.workspaceId, "seo");
  if (paid) return paid;
  if (!dfsReady()) return Response.json({ error: "DataForSEO is not set up. Add DFS_LOGIN and DFS_PASSWORD to the server's settings." }, { status: 500 });

  const { data: site, error } = await auth.sb.from("sites").select("domain, profile").eq("id", body.siteId).eq("workspace_id", body.workspaceId).maybeSingle();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!site) return Response.json({ error: "Website not found." }, { status: 404 });
  const you = normalizeSite(site.domain)?.domain ?? site.domain;
  const m = marketOf((site.profile as { country?: string })?.country);
  const spend = new Spend();

  try {
    if (body.action === "rivals") {
      const { data } = await cached(`rivals:${m.location}:${m.language}:${you}`, 30 * DAY, () => competitors(you, m, spend, 8));
      return Response.json({ rivals: data.map((c) => c.domain).filter((d) => d !== you), cost: spend.total });
    }

    const them = normalizeSite(String(body.competitor ?? ""))?.domain;
    if (!them) return Response.json({ error: "Enter a competitor's domain, like acme.com." }, { status: 400 });
    if (them === you) return Response.json({ error: "Pick a different domain from your own." }, { status: 400 });
    const took = await take(body.workspaceId, "tasks", TASK_COST.gap);
    if (!took.ok) return took.response;

    const key = `gap:${m.location}:${m.language}:${you}:${them}`;
    const { data } = await cached<Gap>(key, 30 * DAY, async () => {
      const [missing, shared, only] = await Promise.all([intersect(them, you, false, m, spend), intersect(them, you, true, m, spend), intersect(you, them, false, m, spend)]);
      return {
        missing: rows(missing.items, false),
        shared: rows(shared.items, false),
        only: rows(only.items, true),
        totals: { missing: missing.total, shared: shared.total, only: only.total },
      };
    });
    return Response.json({ gap: data, you, them, cost: spend.total });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("Keyword gap failed:", message);
    return Response.json({ error: message }, { status: 500 });
  }
}

export const POST = meteredRoute("keyword gap", handle);
