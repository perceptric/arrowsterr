import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { call } from "./dataforseo";
import type { Profile as BrandProfile } from "./db";
import { entitlement, take } from "./entitlements";
import { enqueue } from "./jobs";
import { scheduleOf, type Location, type ScanResult } from "./local";
import { leaders, needsConfirm, parseInfo, parsePosts, parseQuestions, type Profile } from "./localProfile";
import { TASK_COST } from "./plans";
import { marketOf } from "./research";

// Local Research, phase 2 (docs/local-research-plan.md, 4.4). A job reads the Google profile of a location's business
// and of the 3 competitors with the most top 3 spots: profile details and questions now (live), posts a minute later
// (DataForSEO's queue). Each business is one row in local_profiles per read. When the business's own listing reads
// differently from last time, it's read again a day later, so a change is only shown once two reads agree.

const MIGRATION = "Run supabase/072_local_profiles.sql on the VPS database.";
export type Target = { cid: string | null; placeId: string | null; title: string; you: boolean };
type PostTask = { rowId: string; id: string };

export const keywordFor = (t: Target) => (t.cid ? `cid:${t.cid}` : t.placeId ? `place_id:${t.placeId}` : t.title);

async function info(t: Target, m: { location: number; language: string }): Promise<Profile | null> {
  const [task] = await call("business_data/google/my_business_info/live", [{ keyword: keywordFor(t), location_code: m.location, language_code: m.language }]);
  if (task?.status_code !== 20000) return null;
  return parseInfo(task.result?.[0]?.items?.[0]);
}

async function questions(t: Target, m: { location: number; language: string }) {
  try {
    const [task] = await call("business_data/google/questions_and_answers/live", [{ keyword: keywordFor(t), location_code: m.location, language_code: m.language }]);
    return task?.status_code === 20000 ? parseQuestions(task.result?.[0]) : null;
  } catch {
    return null; // Questions are optional: the read goes on without them.
  }
}

async function postTask(t: Target, m: { location: number; language: string }): Promise<string | null> {
  try {
    const [task] = await call("business_data/google/my_business_updates/task_post", [{ keyword: keywordFor(t), location_code: m.location, language_code: m.language, depth: 20 }]);
    return task?.status_code === 20100 || task?.status_code === 20000 ? (task.id ?? null) : null;
  } catch {
    return null;
  }
}

/** The location and the businesses to read: itself, and (unless only confirming) the 3 leaders from its latest scans. */
export async function targets(db: SupabaseClient, locationId: string, youOnly: boolean) {
  const { data: row, error } = await db.from("local_locations").select("id, workspace_id, brand_id, data").eq("id", locationId).maybeSingle();
  if (error) throw new Error(/local_/.test(error.message) ? MIGRATION : error.message);
  if (!row) return null;
  const loc = row.data as Location;
  const list: Target[] = [{ cid: loc.cid, placeId: loc.placeId, title: loc.title, you: true }];
  if (!youOnly) {
    const { data: scans } = await db.from("local_scans").select("keyword, rivals:result->rivals").eq("location_id", locationId).eq("status", "done").order("created_at", { ascending: false }).limit(20);
    const latest = new Map<string, { rivals: ScanResult["rivals"] }>();
    for (const s of (scans ?? []) as { keyword: string; rivals: ScanResult["rivals"] | null }[]) if (!latest.has(s.keyword) && s.rivals) latest.set(s.keyword, { rivals: s.rivals });
    for (const l of leaders([...latest.values()])) if (l.cid !== loc.cid) list.push({ cid: l.cid, placeId: null, title: l.title, you: false });
  }
  const { data: b } = await db.from("brands").select("profile").eq("id", row.brand_id).maybeSingle();
  return { row: row as { id: string; workspace_id: string; brand_id: string }, loc, list, market: marketOf((b?.profile as BrandProfile | null)?.country) };
}

/** The job: read now (round 0), then collect posts (round 1 and on). */
export async function runProfileRead(db: SupabaseClient, p: { locationId: string; youOnly?: boolean; round?: number; posts?: PostTask[]; at?: string }) {
  if (p.round && p.posts) return collectPosts(db, p.locationId, p.posts, p.round, p.at!);
  const t = await targets(db, p.locationId, Boolean(p.youOnly));
  if (!t) return;
  const at = new Date().toISOString();
  const read = await Promise.all(
    t.list.map(async (b) => {
      const [prof, qa, postId] = await Promise.all([info(b, t.market).catch(() => null), questions(b, t.market), postTask(b, t.market)]);
      return { b, prof: prof ? { ...prof, questions: qa } : null, postId };
    }),
  );
  const you = read.find((r) => r.b.you);
  if (!you?.prof) throw new Error("Google didn't return the business's profile.");
  const posts: PostTask[] = [];
  for (const r of read) {
    if (!r.prof) continue;
    const { data: row, error } = await db
      .from("local_profiles")
      .insert({ workspace_id: t.row.workspace_id, brand_id: t.row.brand_id, location_id: t.row.id, cid: r.prof.cid ?? r.b.cid, you: r.b.you, read_at: at, confirm: Boolean(p.youOnly), data: r.prof })
      .select("id")
      .single();
    if (error) throw new Error(/local_profiles/.test(error.message) ? MIGRATION : error.message);
    if (r.postId) posts.push({ rowId: row.id as string, id: r.postId });
  }
  if (posts.length) await enqueue("local_profile", { locationId: p.locationId, round: 1, posts, at }, { workspaceId: t.row.workspace_id, key: `local_profile:${p.locationId}:${at}:1`, runAt: new Date(Date.now() + 90_000), maxAttempts: 3 });
  // The listing reads differently from last time: read it again tomorrow, so a change shows only once two reads agree.
  if (!p.youOnly) {
    const { data: prev } = await db.from("local_profiles").select("read_at, data").eq("location_id", p.locationId).eq("you", true).order("read_at", { ascending: false }).limit(2);
    const reads = ((prev ?? []) as { read_at: string; data: Profile }[]).map((r) => ({ profile: r.data }));
    if (needsConfirm(reads)) await enqueue("local_profile", { locationId: p.locationId, youOnly: true }, { workspaceId: t.row.workspace_id, key: `local_profile:${p.locationId}:confirm:${at.slice(0, 10)}`, runAt: new Date(Date.now() + 24 * 3600_000), maxAttempts: 3 });
  }
}

async function collectPosts(db: SupabaseClient, locationId: string, tasks: PostTask[], round: number, at: string) {
  const left: PostTask[] = [];
  for (const t of tasks) {
    try {
      const [r] = await call(`business_data/google/my_business_updates/task_get/${t.id}`);
      if (r?.status_code === 20000) {
        const { data: row } = await db.from("local_profiles").select("data").eq("id", t.rowId).maybeSingle();
        if (row) await db.from("local_profiles").update({ data: { ...(row.data as Profile), posts: parsePosts(r.result?.[0]?.items) } }).eq("id", t.rowId);
      } else if (!r?.status_code || r.status_code < 40000 || (r.status_code >= 40601 && r.status_code <= 40602)) left.push(t); // still in the queue
    } catch {
      left.push(t);
    }
  }
  // Up to about 45 minutes; after that, posts stay unknown for this read (never counted as zero).
  if (left.length && round < 7) {
    const { data: loc } = await db.from("local_locations").select("workspace_id").eq("id", locationId).maybeSingle();
    await enqueue("local_profile", { locationId, round: round + 1, posts: left, at }, { workspaceId: (loc?.workspace_id as string) ?? null, key: `local_profile:${locationId}:${at}:${round + 1}`, runAt: new Date(Date.now() + Math.min(15 * 60_000, 60_000 * 2 ** round)), maxAttempts: 3 });
  }
}

/** Start a read now: the editor pressed Read now. Charged as one profile read. */
export async function queueProfileRead(locationId: string, workspaceId: string) {
  await enqueue("local_profile", { locationId }, { workspaceId, key: `local_profile:${locationId}:now:${Math.floor(Date.now() / 600_000)}`, maxAttempts: 2 });
}

/** The daily tick: every location with scheduled scans gets its profiles read once a week. */
export async function queueProfileReads(db: SupabaseClient) {
  const { data: rows, error } = await db.from("local_locations").select("id, workspace_id, data");
  if (error) return; // before 071
  const due = (rows ?? []).filter((r) => scheduleOf(r.data as Location) !== "off");
  if (!due.length) return;
  const { data: recent, error: e2 } = await db.from("local_profiles").select("location_id").in("location_id", due.map((r) => r.id)).eq("you", true).eq("confirm", false).gte("read_at", new Date(Date.now() - 7 * 864e5 + 3 * 3600_000).toISOString());
  if (e2) return; // before 072
  const fresh = new Set((recent ?? []).map((r) => r.location_id as string));
  for (const r of due) {
    if (fresh.has(r.id)) continue;
    const e = await entitlement(r.workspace_id);
    if (e.readOnly || !e.open.seo) continue;
    const took = await take(r.workspace_id, "tasks", TASK_COST.localprofile, { refundIfFree: false });
    if (!took.ok) continue;
    await enqueue("local_profile", { locationId: r.id }, { workspaceId: r.workspace_id, key: `local_profile:${r.id}:week:${new Date().toISOString().slice(0, 10)}`, maxAttempts: 2 }).catch(async () => took.giveBack());
  }
}
