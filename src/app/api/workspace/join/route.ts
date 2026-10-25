import { adminClient, requireRole } from "@/lib/serverAuth";

// Who may join the workspace on their own with a company email (Settings → Access). Admins only.
//   { allowedDomain?: string | null, joinRole?: "viewer" | "editor" }  leaving a field out keeps it; null turns joining off.
// The domain must be the admin's own email domain. join_by_domain also checks an owner or admin has it.
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const auth = await requireRole(request, body.workspaceId, "admin");
  if ("denied" in auth) return auth.denied;
  const db = adminClient();
  if (!db) return Response.json({ error: "Add SUPABASE_SECRET_KEY to the server's settings." }, { status: 500 });

  const patch: { allowed_domain?: string | null; join_role?: "viewer" | "editor" } = {};
  if (body.allowedDomain !== undefined) {
    const domain = typeof body.allowedDomain === "string" ? body.allowedDomain.trim().toLowerCase() : "";
    if (domain) {
      const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
      const { data } = await auth.sb.auth.getUser(token);
      const own = data.user?.email_confirmed_at ? (data.user.email?.split("@")[1]?.toLowerCase() ?? "") : "";
      if (domain !== own) return Response.json({ error: "Use the domain of your own confirmed email." }, { status: 400 });
    }
    patch.allowed_domain = domain || null;
  }
  if (body.joinRole !== undefined) {
    if (body.joinRole !== "viewer" && body.joinRole !== "editor") return Response.json({ error: "Pick Viewer or Editor." }, { status: 400 });
    patch.join_role = body.joinRole;
  }
  if (!Object.keys(patch).length) return Response.json({ ok: true });

  const { error } = await db.from("workspaces").update(patch).eq("id", body.workspaceId);
  if (error) return Response.json({ error: /allowed_domain/.test(error.message) ? "That domain can't be used." : error.message }, { status: 400 });
  return Response.json({ ok: true });
}
