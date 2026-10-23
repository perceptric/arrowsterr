import { migrationHint, userIdOf } from "@/lib/reportServer";
import { shareProblem, SHARE_MAX_BYTES } from "@/lib/shareSnapshot";
import { adminClient, requireRole } from "@/lib/serverAuth";

// Share on Prompts and Competitors (docs/reports.md, section 32.7): freeze the page the browser sends into a
// report_links row and return a private link anyone can open at /r/<token>. Editors only, on every plan.
export async function POST(request: Request) {
  const raw = await request.text().catch(() => "");
  if (raw.length > SHARE_MAX_BYTES + 10_000) return Response.json({ error: "This page is too large to share. Pick a topic or a model and try again." }, { status: 413 });
  let body: { workspaceId?: unknown; brandId?: unknown; data?: unknown } = {};
  try {
    body = JSON.parse(raw);
  } catch {
    body = {};
  }
  const auth = await requireRole(request, body.workspaceId, "editor");
  if ("denied" in auth) return auth.denied;
  const problem = shareProblem(body.data);
  if (problem) return Response.json({ error: problem }, { status: 400 });
  const db = adminClient();
  if (!db) return Response.json({ error: "Add SUPABASE_SECRET_KEY to the server's settings." }, { status: 500 });

  const { data: brand } = await auth.sb.from("brands").select("id").eq("id", typeof body.brandId === "string" ? body.brandId : "").eq("workspace_id", body.workspaceId).maybeSingle();
  if (!brand) return Response.json({ error: "That brand is not in this workspace." }, { status: 404 });
  const { data: link, error } = await db
    .from("report_links")
    .insert({ workspace_id: body.workspaceId, brand_id: brand.id, mode: "frozen", snapshot: body.data, created_by: await userIdOf(auth.sb, request) })
    .select("id, token")
    .single();
  if (error) return Response.json({ error: migrationHint(error.message) }, { status: 500 });
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const origin = process.env.APP_URL?.trim().replace(/\/+$/, "") || (host ? `https://${host}` : "https://app.arrowsterr.com");
  const made = link as { id: string; token: string };
  return Response.json({ url: `${origin}/r/${made.token}`, id: made.id });
}
