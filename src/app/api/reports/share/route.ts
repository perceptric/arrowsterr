import { randomUUID } from "node:crypto";
import { appOrigin, shareToken, tokenHash } from "@/lib/reportLinks";
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
  // Only the token's hash is saved. Before supabase/058_security.sql the token itself is saved instead.
  const id = randomUUID();
  const token = shareToken(id);
  const row = { id, workspace_id: body.workspaceId, brand_id: brand.id, mode: "frozen", snapshot: body.data, created_by: await userIdOf(auth.sb, request) };
  let { error } = await db.from("report_links").insert({ ...row, token: null, token_hash: tokenHash(token) });
  if (error && /token_hash/.test(error.message)) ({ error } = await db.from("report_links").insert({ ...row, token }));
  if (error) return Response.json({ error: migrationHint(error.message) }, { status: 500 });
  return Response.json({ url: `${appOrigin(request.headers)}/r/${token}`, id });
}
