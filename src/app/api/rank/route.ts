import { entitlement } from "@/lib/entitlements";
import { enqueue } from "@/lib/jobs";
import { COUNTRIES } from "@/lib/research";
import { MAX_KEYWORDS_PER_PROJECT, readKeywords, readTarget, summarize } from "@/lib/rankTrack";
import { fillVolumes, projectDetail, type Project } from "@/lib/rankTrackServer";
import { adminClient, requireRole } from "@/lib/serverAuth";

// Visibility › Traffic: rank tracking projects.
//   Viewers: "list" (every project with its numbers) and "detail" (one project's keywords and their positions).
//   Editors: "create", "update" (name, paused), "delete", "keywords_add", "keywords_remove" and "keywords_tag".

const READ = ["list", "detail"];
const today = () => new Date().toISOString().slice(0, 10);

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const auth = await requireRole(request, body.workspaceId, READ.includes(body.action) ? "viewer" : "editor");
  if ("denied" in auth) return auth.denied;
  const db = adminClient();
  if (!db) return Response.json({ error: "Add SUPABASE_SECRET_KEY to the server's settings." }, { status: 500 });
  const ws = String(body.workspaceId);
  const fail = (error: string, status = 400) => Response.json({ error }, { status });
  const projectOf = async (id: unknown) => {
    const { data } = await db.from("rank_projects").select("*").eq("id", String(id ?? "")).eq("workspace_id", ws).maybeSingle();
    return data as (Project & { brand_id: string | null; created_at: string }) | null;
  };
  const checkSoon = (projectId: string) => enqueue("rank_check", { projectId, day: today() }, { workspaceId: ws, key: `rank_check:${projectId}:${today()}:${Date.now()}` });

  /** Add keywords within the project cap and the plan's limit across the workspace. Returns how many went in. */
  async function addKeywords(project: Project, text: string, tags: string[]): Promise<{ added: number; skipped: number }> {
    const list = readKeywords(text);
    if (!list.length) return { added: 0, skipped: 0 };
    const e = await entitlement(ws);
    const [{ count: inWs }, { data: have }] = await Promise.all([
      db!.from("rank_keywords").select("id", { count: "exact", head: true }).eq("workspace_id", ws),
      db!.from("rank_keywords").select("keyword").eq("project_id", project.id),
    ]);
    const known = new Set((have ?? []).map((k) => k.keyword as string));
    const fresh = list.filter((k) => !known.has(k));
    const room = Math.max(0, Math.min(e.limits.trackedKeywords - (inWs ?? 0), MAX_KEYWORDS_PER_PROJECT - known.size));
    const take = fresh.slice(0, room);
    if (take.length) {
      const { data, error } = await db!
        .from("rank_keywords")
        .upsert(take.map((keyword) => ({ workspace_id: ws, project_id: project.id, keyword, tags })), { onConflict: "project_id,keyword", ignoreDuplicates: true })
        .select("id, keyword");
      if (error) throw new Error(error.message);
      await fillVolumes(db!, project, (data ?? []) as { id: string; keyword: string }[]);
      await checkSoon(project.id);
    }
    return { added: take.length, skipped: fresh.length - take.length };
  }

  try {
    switch (body.action) {
      case "list": {
        const { data: projects, error } = await db.from("rank_projects").select("*").eq("workspace_id", ws).order("created_at");
        if (error) return fail(/rank_projects/.test(error.message) ? "Traffic needs supabase/083_rank_tracker.sql." : error.message, 500);
        const e = await entitlement(ws);
        const since = new Date(Date.now() - 40 * 864e5).toISOString().slice(0, 10);
        const out = await Promise.all(
          (projects ?? []).map(async (p) => {
            const [{ count }, { data: checks }] = await Promise.all([
              db.from("rank_keywords").select("id", { count: "exact", head: true }).eq("project_id", p.id),
              db.from("rank_checks").select("keyword_id, day, position, checked_at").eq("project_id", p.id).gte("day", since).not("checked_at", "is", null).limit(50_000),
            ]);
            const days = [...new Set((checks ?? []).map((c) => c.day as string))].sort();
            const at = (d: string | undefined) => (d ? (checks ?? []).filter((c) => c.day === d).map((c) => (c.position as number | null) ?? null) : []);
            const last = days.at(-1);
            const weekAgo = last ? [...days].reverse().find((d) => d <= new Date(new Date(`${last}T12:00:00Z`).getTime() - 7 * 864e5).toISOString().slice(0, 10)) : undefined;
            const trend = days.slice(-30).map((d) => summarize(at(d)).visibility);
            return { ...p, keywords: count ?? 0, lastDay: last ?? null, now: last ? summarize(at(last)) : null, before: weekAgo ? summarize(at(weekAgo)) : null, trend };
          }),
        );
        const { count: used } = await db.from("rank_keywords").select("id", { count: "exact", head: true }).eq("workspace_id", ws);
        return Response.json({ projects: out, used: used ?? 0, limit: e.limits.trackedKeywords });
      }
      case "detail": {
        const project = await projectOf(body.projectId);
        if (!project) return fail("Project not found.", 404);
        const days = [7, 30, 90].includes(Number(body.days)) ? Number(body.days) : 30;
        return Response.json({ project, keywords: await projectDetail(db, project, days) });
      }
      case "create": {
        const t = readTarget(String(body.target ?? ""));
        if (!t) return fail("Type a domain like stride.com, or a page's address.");
        const country = COUNTRIES.find((c) => c.location === Number(body.location)) ?? COUNTRIES[0];
        const name = String(body.name ?? "").trim().slice(0, 80) || t.target;
        const { data: project, error } = await db
          .from("rank_projects")
          .insert({ workspace_id: ws, brand_id: body.brandId ? String(body.brandId) : null, name, target: t.target, scope: t.scope, location: country.location, language: country.language, device: body.device === "mobile" ? "mobile" : "desktop" })
          .select("*")
          .single();
        if (error || !project) throw new Error(error?.message ?? "Could not create the project.");
        const got = body.keywords ? await addKeywords(project as Project, String(body.keywords), []) : { added: 0, skipped: 0 };
        return Response.json({ project, ...got });
      }
      case "update": {
        const project = await projectOf(body.projectId);
        if (!project) return fail("Project not found.", 404);
        const patch: Record<string, unknown> = {};
        if (typeof body.name === "string" && body.name.trim()) patch.name = body.name.trim().slice(0, 80);
        if (typeof body.paused === "boolean") patch.paused = body.paused;
        const { error } = await db.from("rank_projects").update(patch).eq("id", project.id);
        if (error) throw new Error(error.message);
        return Response.json({ ok: true });
      }
      case "delete": {
        const project = await projectOf(body.projectId);
        if (!project) return fail("Project not found.", 404);
        const { error } = await db.from("rank_projects").delete().eq("id", project.id);
        if (error) throw new Error(error.message);
        return Response.json({ ok: true });
      }
      case "keywords_add": {
        const project = await projectOf(body.projectId);
        if (!project) return fail("Project not found.", 404);
        const tags = Array.isArray(body.tags) ? body.tags.map((x: unknown) => String(x).trim().slice(0, 30)).filter(Boolean).slice(0, 5) : [];
        return Response.json(await addKeywords(project, String(body.text ?? ""), tags));
      }
      case "keywords_remove": {
        const project = await projectOf(body.projectId);
        if (!project) return fail("Project not found.", 404);
        const ids = Array.isArray(body.ids) ? body.ids.map(String) : [];
        if (ids.length) {
          const { error } = await db.from("rank_keywords").delete().eq("project_id", project.id).in("id", ids);
          if (error) throw new Error(error.message);
        }
        return Response.json({ ok: true });
      }
      case "keywords_tag": {
        const project = await projectOf(body.projectId);
        if (!project) return fail("Project not found.", 404);
        const ids = Array.isArray(body.ids) ? body.ids.map(String) : [];
        const tags = Array.isArray(body.tags) ? body.tags.map((x: unknown) => String(x).trim().slice(0, 30)).filter(Boolean).slice(0, 5) : [];
        if (ids.length) {
          const { error } = await db.from("rank_keywords").update({ tags }).eq("project_id", project.id).in("id", ids);
          if (error) throw new Error(error.message);
        }
        return Response.json({ ok: true });
      }
      default:
        return fail("Unknown action.");
    }
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e), 500);
  }
}
