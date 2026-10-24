import { entitlement } from "@/lib/entitlements";
import { reportLimits } from "@/lib/plans";
import { userIdOf } from "@/lib/reportServer";
import { cleanSchedule, nextRun, scheduleProblem, type When } from "@/lib/schedules";
import { adminClient, requireRole } from "@/lib/serverAuth";

// Scheduled reports (docs/reports.md, section 32.4). Editors only; members read schedules and their sends directly.
// The plan decides how many schedules may be on (Free 0, Starter 2, Pro 10, Agency unlimited).
//   save: { id?, schedule }  add a schedule, or change one. Its next send is worked out here.
//   pause: { id, active }    pause, or turn back on (from the next due time after now).
//   delete: { id }
const COLS = "id, brand_id, name, pages, design, params, cadence, weekday, monthday, hour, timezone, recipients, subject, active, next_run_at, last_run_at, created_at";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const auth = await requireRole(request, body.workspaceId, "editor");
  if ("denied" in auth) return auth.denied;
  const db = adminClient();
  if (!db) return Response.json({ error: "Add SUPABASE_SECRET_KEY to the server's settings." }, { status: 500 });
  const workspaceId = body.workspaceId as string;
  const missing = (m: string) => (/report_schedules/.test(m) ? `${m} Run supabase/046_report_files.sql in Supabase.` : m);
  const ent = await entitlement(workspaceId);
  const limit = reportLimits(ent.plan).schedules;
  const id = typeof body.id === "string" && body.id ? body.id : null;
  /** Schedules that are on, other than this one. */
  const activeOthers = async () => {
    let q = db.from("report_schedules").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId).eq("active", true);
    if (id) q = q.neq("id", id);
    const { count, error } = await q;
    if (error) throw new Error(missing(error.message));
    return count ?? 0;
  };

  try {
    if (body.action === "delete") {
      const { error } = await db.from("report_schedules").delete().eq("id", id ?? "").eq("workspace_id", workspaceId);
      return error ? Response.json({ error: missing(error.message) }, { status: 500 }) : Response.json({ ok: true });
    }

    if (body.action === "pause") {
      const { data } = await db.from("report_schedules").select(COLS).eq("id", id ?? "").eq("workspace_id", workspaceId).maybeSingle();
      if (!data) return Response.json({ error: "That schedule is gone." }, { status: 404 });
      const active = Boolean(body.active);
      if (active) {
        const problem = scheduleProblem(await activeOthers(), limit);
        if (problem) return Response.json(problem, { status: 429 });
      }
      const patch = { active, updated_at: new Date().toISOString(), ...(active ? { next_run_at: nextRun(data as When, Date.now()).toISOString() } : {}) };
      const { data: row, error } = await db.from("report_schedules").update(patch).eq("id", id!).select(COLS).single();
      return error ? Response.json({ error: missing(error.message) }, { status: 500 }) : Response.json({ schedule: row });
    }

    const clean = cleanSchedule(body.schedule, ent.limits.historyDays);
    if ("error" in clean) return Response.json({ error: clean.error }, { status: 400 });
    const s = clean.value;
    const { data: brand } = await db.from("brands").select("id").eq("id", s.brandId).eq("workspace_id", workspaceId).maybeSingle();
    if (!brand) return Response.json({ error: "That brand is not in this workspace." }, { status: 404 });
    const fields = {
      brand_id: s.brandId,
      name: s.name,
      pages: s.pages,
      design: s.design,
      params: s.params,
      cadence: s.cadence,
      weekday: s.weekday,
      monthday: s.monthday,
      hour: s.hour,
      timezone: s.timezone,
      recipients: s.recipients,
      subject: s.subject,
      next_run_at: nextRun(s, Date.now()).toISOString(),
      updated_at: new Date().toISOString(),
    };
    if (id) {
      const { data: row, error } = await db.from("report_schedules").update(fields).eq("id", id).eq("workspace_id", workspaceId).select(COLS).maybeSingle();
      if (error) return Response.json({ error: missing(error.message) }, { status: 500 });
      return row ? Response.json({ schedule: row }) : Response.json({ error: "That schedule is gone." }, { status: 404 });
    }
    const problem = scheduleProblem(await activeOthers(), limit);
    if (problem) return Response.json(problem, { status: 429 });
    const { data: row, error } = await db
      .from("report_schedules")
      .insert({ ...fields, workspace_id: workspaceId, active: true, created_by: await userIdOf(auth.sb, request) })
      .select(COLS)
      .single();
    return error ? Response.json({ error: missing(error.message) }, { status: 500 }) : Response.json({ schedule: row });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
