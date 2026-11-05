import type { SupabaseClient } from "@supabase/supabase-js";
import { planAccountDelete, planText, type WorkspaceRow } from "@/lib/accountDelete";
import { adminClient, requireUser } from "@/lib/serverAuth";

// The signed-in person's own account (Settings → Password and security).
//   preview: what deleting the account would do to each workspace (lib/accountDelete.ts)
//   delete:  { confirm: their email } does it, after checking the plan again
const err = (error: string, status = 400) => Response.json({ error }, { status });
const BUCKETS = ["doc-images", "brand-files", "report-pdfs"];

/** Every workspace the person is in, with its members and billing state. */
async function load(db: SupabaseClient, userId: string): Promise<{ rows: WorkspaceRow[]; emails: Record<string, string> }> {
  const { data: mine, error } = await db.from("workspace_members").select("workspace_id").eq("user_id", userId);
  if (error) throw new Error(error.message);
  const ids = (mine ?? []).map((r) => r.workspace_id as string);
  if (!ids.length) return { rows: [], emails: {} };
  const [ws, members] = await Promise.all([
    db.from("workspaces").select("id, name, plan, plan_status, stripe_subscription_id").in("id", ids),
    db.from("workspace_members").select("workspace_id, user_id, role, created_at, email").in("workspace_id", ids),
  ]);
  if (ws.error || members.error) throw new Error((ws.error ?? members.error)!.message);
  const emails: Record<string, string> = {};
  for (const m of members.data ?? []) emails[m.user_id as string] = (m.email as string) ?? "";
  const rows = (ws.data ?? []).map((w) => ({ ...(w as Omit<WorkspaceRow, "members">), members: (members.data ?? []).filter((m) => m.workspace_id === w.id) as WorkspaceRow["members"] }));
  return { rows, emails };
}

/** Remove a deleted workspace's files. Best effort: a file left behind is only storage. */
async function clearFiles(db: SupabaseClient, wsId: string) {
  for (const bucket of BUCKETS) {
    const walk = async (prefix: string, depth: number): Promise<string[]> => {
      const { data } = await db.storage.from(bucket).list(prefix, { limit: 1000 });
      const out: string[] = [];
      for (const f of data ?? []) {
        const path = `${prefix}/${f.name}`;
        if (f.id) out.push(path);
        else if (depth < 3) out.push(...(await walk(path, depth + 1)));
      }
      return out;
    };
    const paths = await walk(wsId, 0).catch(() => []);
    for (let i = 0; i < paths.length; i += 100) await db.storage.from(bucket).remove(paths.slice(i, i + 100)).catch(() => {});
  }
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const auth = await requireUser(request);
  if ("denied" in auth) return auth.denied;
  const db = adminClient();
  if (!db) return err("Add SUPABASE_SECRET_KEY to the server's settings.", 500);

  try {
    const { rows, emails } = await load(db, auth.userId);
    const plan = planAccountDelete(auth.userId, rows);
    if (body.action === "preview") return Response.json({ plan, lines: planText(plan, emails) });
    if (body.action !== "delete") return err("Unknown action.");

    if (String(body.confirm ?? "").trim().toLowerCase() !== auth.email.toLowerCase()) return err("Type your email address to confirm.");
    if (plan.blocked.length) return Response.json({ error: "Some workspaces need a step first.", plan }, { status: 409 });

    // New owners first, so a shared workspace is never left without one.
    for (const t of plan.transfer) {
      const { error } = await db.from("workspace_members").update({ role: "owner" }).eq("workspace_id", t.id).eq("user_id", t.to);
      if (error) throw new Error(error.message);
    }
    for (const w of plan.remove) {
      await clearFiles(db, w.id);
      const { error } = await db.from("workspaces").delete().eq("id", w.id);
      if (error) throw new Error(error.message);
    }
    // Memberships, profile and sign-in go with the user. Rows they created elsewhere keep, with no author.
    const { error } = await db.auth.admin.deleteUser(auth.userId);
    if (error) throw new Error(error.message);
    console.log(`Account ${auth.userId} deleted: ${plan.remove.length} workspaces removed, ${plan.transfer.length} passed on.`);
    return Response.json({ ok: true });
  } catch (e) {
    console.error("Account delete failed:", e instanceof Error ? e.message : e);
    return err("Couldn't finish deleting the account. Try again in a moment, or email support@arrowsterr.com.", 500);
  }
}
