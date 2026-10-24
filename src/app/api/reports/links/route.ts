import { entitlement } from "@/lib/entitlements";
import { reportLimits } from "@/lib/plans";
import { linkSettingsProblem } from "@/lib/reportLinks";
import { hashPassword, migrationHint } from "@/lib/reportServer";
import { adminClient, requireRole } from "@/lib/serverAuth";

// Shared links (docs/reports.md, section 32.7): a password, an expiry date, or revoke. Editors only.
//   update: { id, password?: string | null, expires?: "YYYY-MM-DD" | null }  null or "" removes it; leaving a field out keeps it.
//   revoke: { id }  the link stops opening for everyone, at once.
// Adding a password or an expiry date is on Pro and up. Removing one works on every plan.
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const auth = await requireRole(request, body.workspaceId, "editor");
  if ("denied" in auth) return auth.denied;
  const db = adminClient();
  if (!db) return Response.json({ error: "Add SUPABASE_SECRET_KEY to the server's settings." }, { status: 500 });
  const { data: link } = await db.from("report_links").select("id, revoked_at").eq("id", typeof body.id === "string" ? body.id : "").eq("workspace_id", body.workspaceId).maybeSingle();
  if (!link) return Response.json({ error: "That link is gone." }, { status: 404 });

  if (body.action === "revoke") {
    const { error } = await db.from("report_links").update({ revoked_at: new Date().toISOString() }).eq("id", link.id);
    return error ? Response.json({ error: migrationHint(error.message) }, { status: 500 }) : Response.json({ ok: true });
  }

  if (link.revoked_at) return Response.json({ error: "This link was revoked. Share the page again for a new one." }, { status: 400 });
  const ask = { password: body.password === undefined ? undefined : String(body.password ?? ""), expires: body.expires === undefined ? undefined : String(body.expires ?? "") };
  const problem = linkSettingsProblem(ask, reportLimits((await entitlement(body.workspaceId)).plan).secure);
  if (problem) return Response.json(problem, { status: problem.limit ? 429 : 400 });
  const patch: Record<string, unknown> = {};
  if (ask.password !== undefined) patch.password_hash = ask.password ? await hashPassword(ask.password) : null;
  if (ask.expires !== undefined) patch.expires_at = ask.expires ? `${ask.expires}T23:59:59Z` : null;
  const { data, error } = await db.from("report_links").update(patch).eq("id", link.id).select("id, locked, expires_at").single();
  return error ? Response.json({ error: migrationHint(error.message) }, { status: 500 }) : Response.json({ link: data });
}
