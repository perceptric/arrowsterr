// Deleting your own account (Settings → Password and security). Pure: the server reads the workspaces, this decides
// what happens to each one, and the person sees the plan before anything is deleted.
//   - A workspace where you are the only member is deleted with everything in it.
//   - A workspace you own with other members passes to its longest-standing admin.
//   - A workspace you only belong to keeps going without you.
// Two things stop the delete: a workspace that would be deleted still has a paid plan running (cancel it first, so
// nobody keeps paying for an empty workspace), or a workspace you own has other members but no admin to take it over.

export type MemberRow = { user_id: string; role: "owner" | "admin" | "editor" | "viewer"; created_at: string };
export type WorkspaceRow = { id: string; name: string; plan: string; plan_status: string | null; stripe_subscription_id: string | null; members: MemberRow[] };

export type DeletePlan = {
  remove: { id: string; name: string }[]; // deleted, with all their data
  transfer: { id: string; name: string; to: string }[]; // to = the new owner's user id
  leave: { id: string; name: string }[]; // you are removed; the workspace stays
  blocked: { id: string; name: string; why: string }[];
};

/** A plan that still bills: a Stripe subscription that is active, in a trial or waiting on a failed payment. */
const paying = (w: WorkspaceRow) => Boolean(w.stripe_subscription_id) && ["active", "trialing", "past_due", "unpaid"].includes(w.plan_status ?? "");

export function planAccountDelete(userId: string, workspaces: WorkspaceRow[]): DeletePlan {
  const plan: DeletePlan = { remove: [], transfer: [], leave: [], blocked: [] };
  for (const w of workspaces) {
    const me = w.members.find((m) => m.user_id === userId);
    if (!me) continue;
    const others = w.members.filter((m) => m.user_id !== userId);
    if (!others.length) {
      if (paying(w)) plan.blocked.push({ id: w.id, name: w.name, why: "Cancel its plan in Plans and billing first." });
      else plan.remove.push({ id: w.id, name: w.name });
      continue;
    }
    if (me.role !== "owner") {
      plan.leave.push({ id: w.id, name: w.name });
      continue;
    }
    const heir = others.filter((m) => m.role === "admin").sort((a, b) => a.created_at.localeCompare(b.created_at))[0];
    if (heir) plan.transfer.push({ id: w.id, name: w.name, to: heir.user_id });
    else plan.blocked.push({ id: w.id, name: w.name, why: "Make one of its members an admin first, so they can take it over." });
  }
  return plan;
}

/** The plan in plain words for the confirm step. */
export function planText(p: DeletePlan, names: Record<string, string> = {}): string[] {
  return [
    ...p.remove.map((w) => `${w.name} will be deleted with everything in it.`),
    ...p.transfer.map((w) => `${w.name} will pass to ${names[w.to] || "its longest-standing admin"}.`),
    ...p.leave.map((w) => `You will leave ${w.name}. It keeps going without you.`),
  ];
}
