import { clientIp } from "@/lib/clientIp";
import { limitKey, underLimit } from "@/lib/limit";
import { adminClient } from "@/lib/serverAuth";

// What an invite link is for, before the person signs in: the workspace's name and the email it was sent to,
// so the sign-in screen can say "Join Acme" and fill in the right address. Only someone with the link has the token.
//   { token } → { workspace, email } or { error }
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const token = typeof body.token === "string" ? body.token.trim() : "";
  if (!/^[a-zA-Z0-9_-]{16,128}$/.test(token)) return Response.json({ error: "This invite link is not valid." }, { status: 400 });
  const db = adminClient();
  if (!db) return Response.json({ error: "Invites aren't available right now." }, { status: 500 });
  if (!(await underLimit(db, limitKey("invite-peek", clientIp(request)), 30, 3600))) return Response.json({ error: "Too many tries. Wait a little and open the link again." }, { status: 429 });

  const { data: inv } = await db.from("workspace_invites").select("*").eq("token", token).is("accepted_at", null).maybeSingle();
  const invite = inv as { email: string; workspace_id: string; expires_at?: string | null } | null;
  if (!invite) return Response.json({ error: "This invite link is not valid or was already used." }, { status: 404 });
  if (invite.expires_at && Date.parse(invite.expires_at) < Date.now()) return Response.json({ error: "This invite link has expired. Ask for a new one." }, { status: 410 });
  const { data: ws } = await db.from("workspaces").select("name").eq("id", invite.workspace_id).maybeSingle();
  return Response.json({ workspace: (ws as { name: string } | null)?.name ?? "a workspace", email: invite.email });
}
