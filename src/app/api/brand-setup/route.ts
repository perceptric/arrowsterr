import { ensureBrandSetup } from "@/lib/brandSetupServer";
import { take } from "@/lib/entitlements";
import { meteredRoute } from "@/lib/meter";
import { TASK_COST } from "@/lib/plans";
import { adminClient, requireRole, takeAnswer } from "@/lib/serverAuth";

// Onboarding: write the Brand Guidelines and Voice from the brand's website, so the Brand page is
// filled before anyone opens it. The Brand Kit is learned earlier in onboarding; ensureBrandSetup
// fills only what is missing and never changes what a person already saved.
async function handle(request: Request) {
  const body = await request.json().catch(() => ({}));
  const auth = await requireRole(request, body.workspaceId, "editor");
  if ("denied" in auth) return auth.denied;
  const brandId = typeof body.brandId === "string" ? body.brandId : "";
  if (!brandId) return Response.json({ error: "brandId is required." }, { status: 400 });
  // The brand must be in the caller's workspace, not just any brand id.
  const { data: brand } = await auth.sb.from("brands").select("id").eq("id", brandId).eq("workspace_id", body.workspaceId).maybeSingle();
  if (!brand) return Response.json({ error: "That brand is not in this workspace." }, { status: 404 });
  if (!process.env.ANTHROPIC_API_KEY) return Response.json({ error: "ANTHROPIC_API_KEY is not set on the server." }, { status: 500 });
  const limited = await takeAnswer(auth.sb, body.workspaceId);
  if (limited) return limited;
  const took = await take(body.workspaceId, "tasks", TASK_COST.guideline);
  if (!took.ok) return took.response;
  const db = adminClient();
  if (!db) return Response.json({ error: "SUPABASE_SECRET_KEY is not set on the server." }, { status: 500 });
  const made = await ensureBrandSetup(db, brandId);
  return Response.json({ ok: true, made });
}

export const POST = meteredRoute("brand setup", handle);
