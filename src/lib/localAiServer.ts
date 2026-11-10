import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { call, getTask, postTasks, type DfsEngine } from "./dataforseo";
import type { Profile } from "./db";
import { entitlement, take } from "./entitlements";
import { enqueue } from "./jobs";
import { scheduleOf, zoomFor, type Location, type Place, type Shape } from "./local";
import { aiGridOf, aiPrompt, aiTasks, candidatesOf, readOf, summarizeAi, type AiReads, type Candidate } from "./localAi";
import type { Profile as GoogleProfile } from "./localProfile";
import type { SavedLocation } from "./localServer";
import { marketOf } from "./research";

// Local Research, phase 4 (docs/local-research-plan.md, 4.6). A scan asks Google's AI Mode "best {keyword}" from each
// point of the AI grid (standard queue, the point's coordinates), and ChatGPT and Gemini once for the city. The job
// collects the answers, matches the businesses they name against the latest Maps scan, and sums them up.

const MIGRATION = "Run supabase/074_local_ai_scans.sql on the VPS database.";
const GIVE_UP_MS = 2 * 3600_000;
type Charge = { period: string; plan: number; pack: number };
type Task = { k: string; id: string; engine: DfsEngine };

/** The businesses to look for: the location's business and every business its latest Maps scan for this keyword saw. */
async function candidates(db: SupabaseClient, brandId: string, loc: SavedLocation, keyword: string): Promise<Candidate[]> {
  const [{ data: scan }, { data: prof }, { data: brand }] = await Promise.all([
    db.from("local_scans").select("points").eq("location_id", loc.id).eq("keyword", keyword).eq("status", "done").order("created_at", { ascending: false }).limit(1).maybeSingle(),
    db.from("local_profiles").select("data").eq("location_id", loc.id).eq("you", true).order("read_at", { ascending: false }).limit(1).maybeSingle(),
    db.from("brands").select("domain").eq("id", brandId).maybeSingle(),
  ]);
  const website = (prof?.data as GoogleProfile | null)?.website ?? (brand?.domain ? `https://${brand.domain}` : null);
  return candidatesOf({ title: loc.title, cid: loc.cid, domain: website }, (scan?.points ?? null) as Record<string, Place[] | null> | null);
}

/** Start an AI grid scan for one keyword. The scan keeps the grid it used. */
export async function startAiScan(db: SupabaseClient, ws: string, userId: string | null, brandId: string, loc: SavedLocation, keyword: string, opts: { charge: Charge | null; country?: string }) {
  const g = aiGridOf(loc);
  const cands = await candidates(db, brandId, loc, keyword);
  const { data: row, error } = await db
    .from("local_ai_scans")
    .insert({ workspace_id: ws, brand_id: brandId, location_id: loc.id, keyword, size: g.size, spacing: g.spacing, shape: g.shape, center_lat: g.center.lat, center_lng: g.center.lng, candidates: cands, created_by: userId, charge: opts.charge, step: "Asking AI Mode" })
    .select("id")
    .single();
  if (error || !row) throw new Error(/local_ai_scans/.test(error?.message ?? "") ? MIGRATION : (error?.message ?? "Could not start the scan."));
  try {
    const zoom = zoomFor(g.spacing);
    const language = marketOf(opts.country).language;
    const posted = await call(
      "serp/google/ai_mode/task_post",
      g.points.map((p) => ({ keyword: aiPrompt(keyword), location_coordinate: `${p.lat.toFixed(7)},${p.lng.toFixed(7)},${zoom}z`, language_code: language, device: "desktop", priority: 1, tag: `${row.id}:${p.i}` })),
    );
    const tasks: Task[] = (posted as { id?: string; status_code?: number; data?: { tag?: string } }[])
      .map((t, n) => ({ k: String(t.data?.tag ?? "").split(":")[1] ?? String(g.points[n]?.i ?? n), id: t.status_code === 20100 || t.status_code === 20000 ? (t.id ?? "") : "", engine: "AI Mode" as DfsEngine }))
      .filter((t) => t.id);
    for (const engine of ["ChatGPT", "Gemini"] as const) {
      const [id] = await postTasks(engine, [aiPrompt(keyword, loc.city)]).catch(() => [null]);
      if (id) tasks.push({ k: engine, id, engine });
    }
    if (!tasks.length) throw new Error("DataForSEO didn't take the questions. Try again in a few minutes.");
    await db.from("local_ai_scans").update({ tasks, step: "Waiting for the answers" }).eq("id", row.id);
    await enqueue("local_ai", { scanId: row.id }, { workspaceId: ws, key: `local_ai:${row.id}:0`, runAt: new Date(Date.now() + 90_000), maxAttempts: 3 });
  } catch (e) {
    // Nothing was collected; whoever took the tasks hands them back (the metered route, or the monthly queue).
    await db.from("local_ai_scans").update({ status: "failed", error: e instanceof Error ? e.message : String(e), charge: null, finished_at: new Date().toISOString() }).eq("id", row.id);
    throw e;
  }
  return row.id as string;
}

async function fail(db: SupabaseClient, scanId: string, error: string) {
  const { data: s } = await db.from("local_ai_scans").select("workspace_id, charge").eq("id", scanId).maybeSingle();
  await db.from("local_ai_scans").update({ status: "failed", error, charge: null, finished_at: new Date().toISOString() }).eq("id", scanId);
  const c = s?.charge as Charge | null;
  if (c) await db.rpc("give_back_tasks", { p_ws: s!.workspace_id, p_period: c.period, p_plan_n: c.plan, p_pack_n: c.pack }).then(({ error: e }) => e && console.error("Local AI scan refund failed:", e.message));
}

/** Collect what's ready. Called by the job until every answer is in, or 2 hours have passed. */
export async function collectAiScan(db: SupabaseClient, scanId: string, round: number) {
  const { data: s } = await db.from("local_ai_scans").select("id, workspace_id, keyword, size, spacing, shape, center_lat, center_lng, status, tasks, candidates, reads, created_at").eq("id", scanId).maybeSingle();
  if (!s || s.status !== "running") return;
  const tasks = (s.tasks ?? []) as Task[];
  const cands = (s.candidates ?? []) as Candidate[];
  const reads: AiReads = { ...((s.reads ?? {}) as AiReads) };
  const pending = tasks.filter((t) => !(t.k in reads));
  await Promise.all(
    pending.map(async (t) => {
      try {
        const r = await getTask(t.engine, t.id);
        if (r.state === "done") reads[t.k] = readOf(r.answer, cands);
        else if (r.state === "failed") reads[t.k] = null;
      } catch {
        // Network trouble: try this one again next round.
      }
    }),
  );
  const left = tasks.filter((t) => !(t.k in reads)).length;
  const old = Date.now() - Date.parse(s.created_at) > GIVE_UP_MS;
  if (left && !old) {
    await db.from("local_ai_scans").update({ reads, step: `${tasks.length - left} of ${tasks.length} answers in` }).eq("id", scanId);
    await enqueue("local_ai", { scanId, round: round + 1 }, { workspaceId: s.workspace_id, key: `local_ai:${scanId}:${round + 1}`, runAt: new Date(Date.now() + Math.min(10 * 60_000, 30_000 * 2 ** Math.min(round, 4))), maxAttempts: 3 });
    return;
  }
  for (const t of tasks) if (!(t.k in reads)) reads[t.k] = null;
  const size = Number(s.size) || 5;
  const shape: Shape = s.shape === "circle" ? "circle" : "square";
  const center = { lat: Number(s.center_lat), lng: Number(s.center_lng) };
  const g = aiGridOf({ lat: center.lat, lng: center.lng, spacing: Number(s.spacing), size, shape, center });
  const result = summarizeAi(String(s.keyword), g, reads, cands);
  if (!result.read && !reads.ChatGPT && !reads.Gemini) return fail(db, scanId, "No AI answered. Try again in a few minutes.");
  await db.from("local_ai_scans").update({ status: "done", step: "Done", reads, result, error: null, finished_at: new Date().toISOString() }).eq("id", scanId);
}

/** The daily tick: each keyword of each location with a schedule gets its AI grid once a month, on the standard queue. */
export async function queueAiScans(db: SupabaseClient) {
  const { data: rows, error } = await db.from("local_locations").select("id, workspace_id, brand_id, data");
  if (error) return;
  const due = (rows ?? []).map((r) => ({ ...r, loc: { ...(r.data as Location), id: r.id as string } as SavedLocation })).filter((r) => scheduleOf(r.loc) !== "off" && r.loc.keywords?.length);
  if (!due.length) return;
  const { data: recent, error: e2 } = await db.from("local_ai_scans").select("location_id, keyword, created_at").in("location_id", due.map((r) => r.id)).gte("created_at", new Date(Date.now() - 30 * 864e5 + 3 * 3600_000).toISOString());
  if (e2) return; // before 074
  const fresh = new Set((recent ?? []).map((r) => `${r.location_id}|${r.keyword}`));
  const { data: brands } = await db.from("brands").select("id, profile").in("id", [...new Set(due.map((r) => r.brand_id))]);
  const country = new Map((brands ?? []).map((b) => [b.id as string, (b.profile as Profile | null)?.country]));
  const open = new Map<string, boolean>();
  for (const r of due) {
    if (!open.has(r.workspace_id)) {
      const e = await entitlement(r.workspace_id);
      open.set(r.workspace_id, !e.readOnly && e.open.seo);
    }
    if (!open.get(r.workspace_id)) continue;
    const cost = aiTasks(aiGridOf(r.loc).points.length);
    for (const k of r.loc.keywords) {
      if (fresh.has(`${r.id}|${k}`)) continue;
      const took = await take(r.workspace_id, "tasks", cost, { refundIfFree: false });
      if (!took.ok) {
        open.set(r.workspace_id, false);
        break;
      }
      const pack = took.fromPack ?? 0;
      await startAiScan(db, r.workspace_id, null, r.brand_id, r.loc, k, { country: country.get(r.brand_id), charge: took.period ? { period: took.period, plan: cost - pack, pack } : null }).catch(async (err) => {
        await took.giveBack();
        console.error(`Monthly AI grid for ${k} failed:`, err instanceof Error ? err.message : err);
      });
    }
  }
}
