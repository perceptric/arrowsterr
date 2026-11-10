import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { call } from "./dataforseo";
import type { Profile as BrandProfile } from "./db";
import { enqueue } from "./jobs";
import { grid, parsePlaces, rankAt, zoomFor, type Location, type PointResult, type ScanResult, type Shape } from "./local";
import { alertSettings, changeAlert, dropAlert, dropConfirmed, ratingAlert, ratingCrossed, reviewAlert, scanAlerts, type LocalAlert, type rankDrop } from "./localAlerts";
import { profileChanges, type Profile } from "./localProfile";
import { emailLocalAlerts } from "./notify";
import { marketOf } from "./research";

// Local Research alerts (docs/local-research-plan.md, 4.8). Each tool calls in here when it finishes: a Maps scan,
// a profile read, a review pull. Alerts are saved once per key; a rank drop is checked by reading the points that
// dropped again on the standard queue (about $0.0006 a point, never charged to the plan). The tick emails each
// location's new alerts, one email a day at most.

type Ctx = { id: string; workspace_id: string; brand_id: string; data: Location };
type Check = { scanId: string; keyword: string; drop: NonNullable<ReturnType<typeof rankDrop>>; before: Pick<PointResult, "i" | "rank" | "error">[]; tasks: { i: number; id: string }[]; again: Record<string, number | null> };

async function locationRow(db: SupabaseClient, id: string): Promise<Ctx | null> {
  const { data } = await db.from("local_locations").select("id, workspace_id, brand_id, data").eq("id", id).maybeSingle();
  return (data as Ctx | null) ?? null;
}

/** Save alerts, skipping any already saved (same location and key). */
async function save(db: SupabaseClient, loc: Ctx, alerts: (LocalAlert & { status?: "checking" | "open"; data?: unknown })[]) {
  if (!alerts.length) return [];
  const rows = alerts.map((a) => ({ workspace_id: loc.workspace_id, brand_id: loc.brand_id, location_id: loc.id, kind: a.kind, key: a.key, title: a.title, detail: a.detail, status: a.status ?? "open", data: a.data ?? null }));
  const { data, error } = await db.from("local_alerts").upsert(rows, { onConflict: "location_id,key", ignoreDuplicates: true }).select("id, key");
  if (error && !/local_alerts/.test(error.message)) throw new Error(error.message);
  return (data ?? []) as { id: string; key: string }[];
}

/** After a Maps scan finishes: new competitors in the top 3, and a rank drop to check again. */
export async function afterScan(db: SupabaseClient, scanId: string) {
  const { data: s } = await db.from("local_scans").select("id, location_id, keyword, created_at, result").eq("id", scanId).maybeSingle();
  if (!s?.location_id || !s.result) return;
  const loc = await locationRow(db, s.location_id as string);
  if (!loc || !alertSettings(loc.data).on) return;
  const { data: prev } = await db.from("local_scans").select("result").eq("location_id", loc.id).eq("keyword", s.keyword).eq("status", "done").lt("created_at", s.created_at).order("created_at", { ascending: false }).limit(1).maybeSingle();
  const now = s.result as ScanResult;
  const before = (prev?.result as ScanResult | null) ?? null;
  const { drop, alerts } = scanAlerts(scanId, now, before);
  await save(db, loc, alerts);
  if (!drop || !before) return;
  const { data: had } = await db.from("local_alerts").select("id").eq("location_id", loc.id).eq("key", dropAlert(scanId, now.keyword, drop).key).maybeSingle();
  if (had) return; // already checking or checked
  // Read the points that dropped again before saying anything.
  const size = now.size ?? 7;
  const center = now.center ?? { lat: loc.data.lat, lng: loc.data.lng };
  const pts = grid(center.lat, center.lng, Number(now.spacing), size, (now.shape ?? "square") as Shape).filter((p) => drop.points.includes(p.i));
  const { data: b } = await db.from("brands").select("profile").eq("id", loc.brand_id).maybeSingle();
  const language = marketOf((b?.profile as BrandProfile | null)?.country).language;
  const zoom = zoomFor(Number(now.spacing));
  const posted = (await call("serp/google/maps/task_post", pts.map((p) => ({ keyword: now.keyword, location_coordinate: `${p.lat},${p.lng},${zoom}z`, language_code: language, depth: 20, priority: 1, tag: `recheck:${p.i}` })))) as { id?: string; status_code?: number; data?: { tag?: string } }[];
  const tasks = posted.map((t, k) => ({ i: Number(String(t.data?.tag ?? "").split(":")[1] ?? pts[k]?.i), id: t.status_code === 20100 || t.status_code === 20000 ? (t.id ?? "") : "" })).filter((t) => t.id);
  if (!tasks.length) return;
  const check: Check = { scanId, keyword: now.keyword, drop, before: before.points.filter((p) => drop.points.includes(p.i)).map((p) => ({ i: p.i, rank: p.rank, error: p.error })), tasks, again: {} };
  const [row] = await save(db, loc, [{ ...dropAlert(scanId, now.keyword, drop), status: "checking", data: check }]);
  if (row) await enqueue("local_alert", { alertId: row.id }, { workspaceId: loc.workspace_id, key: `local_alert:${row.id}:0`, runAt: new Date(Date.now() + 4 * 60_000), maxAttempts: 3 });
}

/** Collect the second read of a rank drop; open the alert if it agrees, drop it if not. */
export async function collectRecheck(db: SupabaseClient, alertId: string, round: number) {
  const { data: a } = await db.from("local_alerts").select("id, workspace_id, brand_id, location_id, status, data").eq("id", alertId).maybeSingle();
  if (!a || a.status !== "checking") return;
  const check = a.data as Check;
  const loc = await locationRow(db, a.location_id as string);
  if (!loc) return;
  const { data: b } = await db.from("brands").select("domain").eq("id", loc.brand_id).maybeSingle();
  const me = { ...loc.data, domain: (b?.domain as string | null) ?? null };
  const again: Record<string, number | null> = { ...check.again };
  for (const t of check.tasks.filter((x) => !(String(x.i) in again))) {
    try {
      const [r] = await call(`serp/google/maps/task_get/advanced/${t.id}`);
      if (r?.status_code === 20000) again[String(t.i)] = rankAt(parsePlaces(r.result?.[0]?.items), me);
    } catch {
      /* try again next round */
    }
  }
  const left = check.tasks.filter((t) => !(String(t.i) in again)).length;
  if (left && round < 6) {
    await db.from("local_alerts").update({ data: { ...check, again } }).eq("id", alertId);
    await enqueue("local_alert", { alertId, round: round + 1 }, { workspaceId: a.workspace_id as string, key: `local_alert:${alertId}:${round + 1}`, runAt: new Date(Date.now() + Math.min(15 * 60_000, 60_000 * 2 ** round)), maxAttempts: 3 });
    return;
  }
  // Points that never answered count as unread: too few reads means no alert.
  const ok = dropConfirmed(check.drop.points, check.before, again);
  await db.from("local_alerts").update({ status: ok ? "open" : "dropped", data: { ...check, again } }).eq("id", alertId);
}

/** After a profile read: confirmed changes Google made, and the rating crossing the level set. */
export async function afterProfileRead(db: SupabaseClient, locationId: string) {
  const loc = await locationRow(db, locationId);
  if (!loc) return;
  const set = alertSettings(loc.data);
  if (!set.on) return;
  const { data } = await db.from("local_profiles").select("read_at, data").eq("location_id", locationId).eq("you", true).order("read_at", { ascending: false }).limit(3);
  const reads = ((data ?? []) as { read_at: string; data: Profile }[]).map((r) => ({ at: r.read_at, profile: r.data }));
  const alerts = profileChanges(reads).map(changeAlert);
  const [now, before] = reads;
  if (now && before && set.ratingBelow !== null && ratingCrossed(now.profile.rating, before.profile.rating, set.ratingBelow)) alerts.push(ratingAlert(now.profile.rating!, set.ratingBelow, now.at));
  await save(db, loc, alerts);
}

/** After a review pull: 1 and 2 star reviews of the business that are new this pull and from the last 14 days. */
export async function afterReviewPull(db: SupabaseClient, locationId: string) {
  const loc = await locationRow(db, locationId);
  if (!loc || !alertSettings(loc.data).on) return;
  const { data } = await db
    .from("local_reviews")
    .select("cid, review_id, rating, author, text")
    .eq("location_id", locationId)
    .eq("you", true)
    .lte("rating", 2)
    .is("removed_at", null)
    .gte("first_seen", new Date(Date.now() - 2 * 864e5).toISOString())
    .gte("posted_at", new Date(Date.now() - 14 * 864e5).toISOString())
    .limit(20);
  await save(db, loc, ((data ?? []) as { cid: string; review_id: string; rating: number; author: string | null; text: string | null }[]).map(reviewAlert));
}

/** The tick: each location's open alerts not emailed yet, in one email, at most one a day per location. */
export async function sendLocalAlerts(db: SupabaseClient) {
  const { data, error } = await db.from("local_alerts").select("id, workspace_id, brand_id, location_id, kind, title, detail, created_at").eq("status", "open").is("emailed_at", null).gte("created_at", new Date(Date.now() - 7 * 864e5).toISOString()).order("created_at").limit(500);
  if (error || !data?.length) return { sent: 0 };
  const byLoc = new Map<string, typeof data>();
  for (const a of data) byLoc.set(a.location_id as string, [...(byLoc.get(a.location_id as string) ?? []), a]);
  let sent = 0;
  for (const [locationId, alerts] of byLoc) {
    const { data: last } = await db.from("local_alerts").select("emailed_at").eq("location_id", locationId).not("emailed_at", "is", null).order("emailed_at", { ascending: false }).limit(1).maybeSingle();
    if (last?.emailed_at && Date.now() - Date.parse(last.emailed_at as string) < 20 * 3600_000) continue; // one a day
    const loc = await locationRow(db, locationId);
    if (!loc) continue;
    const { data: brand } = await db.from("brands").select("id, name").eq("id", loc.brand_id).maybeSingle();
    if (!brand) continue;
    const ids = alerts.map((a) => a.id as string);
    // Marked first, so a crash mid-send never sends twice.
    await db.from("local_alerts").update({ emailed_at: new Date().toISOString() }).in("id", ids);
    sent += await emailLocalAlerts(db, loc.workspace_id, { id: brand.id as string, name: brand.name as string }, { id: loc.id, title: loc.data.title, name: loc.data.name ?? null }, alerts.map((a) => ({ kind: a.kind as LocalAlert["kind"], title: a.title as string, detail: a.detail as string }))).catch((e) => {
      console.error("Local alert email failed:", e instanceof Error ? e.message : e);
      return 0;
    });
  }
  return { sent };
}
