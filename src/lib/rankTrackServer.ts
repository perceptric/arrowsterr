import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { call } from "./dataforseo";
import { entitlement } from "./entitlements";
import { enqueueMany, finish, type Job } from "./jobs";
import { overview, Spend } from "./keywords";
import { depthFor, featuresOf, findPosition, type Device, type Scope } from "./rankTrack";
import { fixSerp } from "./serpResolve";

// Visibility › Traffic on the server: each project's keywords are checked once a day on Google through DataForSEO's
// queue (cheaper than live calls), 30 results most days and 100 once a week. rank_check posts the day's searches,
// rank_collect reads the answers when they are ready.

const POST_PATH = "serp/google/organic/task_post";
const GET_PATH = "serp/google/organic/task_get/advanced";
const GIVE_UP_MS = 4 * 3600_000; // a search with no answer after 4 hours is marked failed and tried again tomorrow
const MAX_TRIES = 3;
const COLLECT_BATCH = 300;

export type Project = { id: string; workspace_id: string; name: string; target: string; scope: Scope; location: number; language: string; device: Device; paused: boolean };

const today = () => new Date().toISOString().slice(0, 10);
/** When in the day a project's check starts, spread from 01:00 to 21:00 UTC so they don't all post at once. */
export function startMinute(projectId: string): number {
  let h = 7;
  for (const ch of projectId) h = (h * 33 + ch.charCodeAt(0)) >>> 0;
  return 60 + (h % 1200);
}

/** Called by the scheduler every 10 minutes: today's check for every project whose time has come, and a collect. */
export async function queueRankChecks(db: SupabaseClient) {
  const { data: projects, error } = await db.from("rank_projects").select("id, workspace_id").eq("paused", false);
  if (error) return; // before the migration
  const now = new Date();
  const minute = now.getUTCHours() * 60 + now.getUTCMinutes();
  const day = today();
  const rows: Parameters<typeof enqueueMany>[0] = [];
  for (const p of projects ?? []) if (minute >= startMinute(p.id as string)) rows.push({ kind: "rank_check", workspace_id: p.workspace_id as string, key: `rank_check:${p.id}:${day}`, payload: { projectId: p.id, day } });
  const { count } = await db.from("rank_checks").select("id", { count: "exact", head: true }).is("checked_at", null).not("task_id", "is", null);
  if (count) rows.push({ kind: "rank_collect", key: `rank_collect:${now.toISOString().slice(0, 15)}`, payload: {} });
  if (rows.length) await enqueueMany(rows);
}

/** The keywords a workspace may track, oldest first, up to its plan's limit across every project. */
async function allowedKeywords(db: SupabaseClient, workspaceId: string, limit: number): Promise<Set<string>> {
  const { data } = await db.from("rank_keywords").select("id").eq("workspace_id", workspaceId).order("created_at").order("id").limit(limit);
  return new Set((data ?? []).map((k) => k.id as string));
}

/** rank_check: post today's search for every keyword of the project that has none yet. */
export async function rankCheckJob(db: SupabaseClient, job: Job) {
  const p = job.payload as { projectId: string; day?: string };
  const day = p.day ?? today();
  const { data: project } = await db.from("rank_projects").select("*").eq("id", p.projectId).maybeSingle();
  if (!project || project.paused) return finish(job.id);
  const e = await entitlement(project.workspace_id as string);
  if (e.readOnly) return finish(job.id);
  const allowed = await allowedKeywords(db, project.workspace_id as string, e.limits.trackedKeywords);
  const { data: keywords } = await db.from("rank_keywords").select("id, keyword").eq("project_id", project.id);
  const todo = (keywords ?? []).filter((k) => allowed.has(k.id as string));
  if (!todo.length) return finish(job.id);
  const depth = depthFor(project.id as string, day);
  const { error: e1 } = await db
    .from("rank_checks")
    .upsert(todo.map((k) => ({ workspace_id: project.workspace_id, project_id: project.id, keyword_id: k.id, day, depth })), { onConflict: "keyword_id,day", ignoreDuplicates: true });
  if (e1) throw new Error(e1.message);
  await postWaiting(db, project as Project, day);
  await finish(job.id);
}

/** Post the project's checks for a day that have no search yet (new rows, and failed ones with tries left). */
export async function postWaiting(db: SupabaseClient, project: Project, day: string) {
  const { data: rows, error } = await db.from("rank_checks").select("id, keyword_id, depth, attempts").eq("project_id", project.id).eq("day", day).is("task_id", null).is("checked_at", null).lt("attempts", MAX_TRIES);
  if (error) throw new Error(error.message);
  if (!rows?.length) return 0;
  const { data: kws } = await db.from("rank_keywords").select("id, keyword").in("id", rows.map((r) => r.keyword_id as string));
  const word = new Map((kws ?? []).map((k) => [k.id as string, k.keyword as string]));
  let posted = 0;
  for (let i = 0; i < rows.length; i += 100) {
    const chunk = rows.slice(i, i + 100).filter((r) => word.has(r.keyword_id as string));
    if (!chunk.length) continue;
    const tasks = await call(
      POST_PATH,
      chunk.map((r) => ({ keyword: word.get(r.keyword_id as string), location_code: project.location, language_code: project.language, device: project.device, depth: r.depth, priority: 1, tag: String(r.id) })),
    );
    const now = new Date().toISOString();
    await Promise.all(
      chunk.map((r, j) => {
        const t = tasks[j];
        const ok = t?.status_code === 20100 && t.id;
        if (ok) posted++;
        return db
          .from("rank_checks")
          .update(ok ? { task_id: t.id, posted_at: now, error: null } : { attempts: (r.attempts as number) + 1, error: `DataForSEO: ${t?.status_message ?? "not accepted"}` })
          .eq("id", r.id);
      }),
    );
  }
  return posted;
}

type Item = { type?: string; rank_group?: number; rank_absolute?: number; url?: string | null; domain?: string | null; breadcrumb?: string | null; title?: string | null };

/** rank_collect: read every posted search that has an answer, and save where the target ranks. */
export async function rankCollectJob(db: SupabaseClient, job: Job) {
  const { data: rows, error } = await db
    .from("rank_checks")
    .select("id, project_id, task_id, posted_at, attempts, depth")
    .is("checked_at", null)
    .not("task_id", "is", null)
    .order("posted_at")
    .limit(COLLECT_BATCH);
  if (error) throw new Error(error.message);
  const projects = new Map<string, Project>();
  for (const id of new Set((rows ?? []).map((r) => r.project_id as string))) {
    const { data } = await db.from("rank_projects").select("*").eq("id", id).maybeSingle();
    if (data) projects.set(id, data as Project);
  }
  let i = 0;
  await Promise.all(
    Array.from({ length: 6 }, async () => {
      while (i < (rows ?? []).length) {
        const r = rows![i++];
        const project = projects.get(r.project_id as string);
        if (!project) continue;
        await collectOne(db, project, r as { id: number; task_id: string; posted_at: string; attempts: number; depth: number }).catch((e) => console.error("Rank check read failed:", e instanceof Error ? e.message : e));
      }
    }),
  );
  await finish(job.id);
}

async function collectOne(db: SupabaseClient, project: Project, r: { id: number; task_id: string; posted_at: string; attempts: number; depth: number }) {
  const [task] = await call(`${GET_PATH}/${r.task_id}`);
  const code = Number(task?.status_code);
  if (code >= 40600 && code < 40700) {
    // Still in the queue. After 4 hours, give up on this search and try again.
    if (Date.now() - new Date(r.posted_at).getTime() > GIVE_UP_MS) await db.from("rank_checks").update({ task_id: null, attempts: r.attempts + 1, error: "No answer from Google in 4 hours" }).eq("id", r.id);
    return;
  }
  if (code !== 20000) {
    await db.from("rank_checks").update({ task_id: null, attempts: r.attempts + 1, error: `DataForSEO: ${task?.status_message ?? `status ${code}`}` }).eq("id", r.id);
    return;
  }
  const items: Item[] = await fixSerp((task.result?.[0]?.items ?? []) as Item[]);
  const organic = items.filter((x) => x.type === "organic" && x.url).map((x) => ({ rank: Number(x.rank_group ?? 0), url: x.url!, domain: x.domain ?? "" }));
  const hit = findPosition(organic, project.target, project.scope);
  await db
    .from("rank_checks")
    .update({
      checked_at: new Date().toISOString(),
      position: hit?.position ?? null,
      url: hit?.url ?? null,
      features: featuresOf(items.map((x) => x.type ?? "")),
      top: organic.slice(0, 10).map((o) => ({ rank: o.rank, domain: o.domain, url: o.url })),
      error: null,
    })
    .eq("id", r.id);
}

/** Search volume for newly added keywords, in the project's market. Best effort: a failure leaves volume empty. */
export async function fillVolumes(db: SupabaseClient, project: Project, keywords: { id: string; keyword: string }[]) {
  if (!keywords.length) return;
  const data = await overview(keywords.map((k) => k.keyword), { location: project.location, language: project.language }, new Spend()).catch(() => null);
  if (!data) return;
  await Promise.all(keywords.map((k) => (data.get(k.keyword.toLowerCase())?.volume != null ? db.from("rank_keywords").update({ volume: data.get(k.keyword.toLowerCase())!.volume }).eq("id", k.id) : null)));
}

export type KeywordRow = {
  id: string;
  keyword: string;
  tags: string[];
  volume: number | null;
  created_at: string;
  history: { day: string; position: number | null; depth: number; checked: boolean }[]; // oldest first
  url: string | null;
  features: string[];
  top: { rank: number; domain: string; url: string }[] | null;
  error: string | null;
};

/** A project's keywords with their checks over the last `days` days, for the project page. */
export async function projectDetail(db: SupabaseClient, project: Project, days: number): Promise<KeywordRow[]> {
  const since = new Date(Date.now() - days * 864e5).toISOString().slice(0, 10);
  const [{ data: kws }, { data: checks }] = await Promise.all([
    db.from("rank_keywords").select("id, keyword, tags, volume, created_at").eq("project_id", project.id).order("created_at"),
    db.from("rank_checks").select("keyword_id, day, position, depth, checked_at, url, features, top, error").eq("project_id", project.id).gte("day", since).order("day").limit(50_000),
  ]);
  const by = new Map<string, NonNullable<typeof checks>>();
  for (const c of checks ?? []) by.set(c.keyword_id as string, [...(by.get(c.keyword_id as string) ?? []), c]);
  return (kws ?? []).map((k) => {
    const list = by.get(k.id as string) ?? [];
    const last = [...list].reverse().find((c) => c.checked_at);
    return {
      id: k.id as string,
      keyword: k.keyword as string,
      tags: (k.tags as string[]) ?? [],
      volume: (k.volume as number | null) ?? null,
      created_at: k.created_at as string,
      history: list.map((c) => ({ day: c.day as string, position: (c.position as number | null) ?? null, depth: c.depth as number, checked: Boolean(c.checked_at) })),
      url: (last?.url as string | null) ?? null,
      features: (last?.features as string[]) ?? [],
      top: (last?.top as KeywordRow["top"]) ?? null,
      error: (list.at(-1)?.checked_at ? null : (list.at(-1)?.error as string | null)) ?? null,
    };
  });
}
