import "server-only";
import * as cheerio from "cheerio";
import type { SupabaseClient } from "@supabase/supabase-js";
import { call } from "./dataforseo";
import type { Profile } from "./db";
import { entitlement, take } from "./entitlements";
import { enqueue } from "./jobs";
import { grid, gridOf, listingCheck, parsePlaces, scanDue, scanTasks, scheduleOf, summarize, zoomFor, type Location, type Place, type ScanResult, type Shape } from "./local";
import { schemaTypes } from "./pageFacts";
import { marketOf } from "./research";
import { safeFetch } from "./safeFetch";

// Local Research scans (docs/local-research.md). One DataForSEO Google Maps task per grid point, all posted in one
// request: priority queue for "Scan now" (about a minute), standard queue for the weekly scan (minutes, up to 45).
// A job collects the results; points still missing after 3 hours count as failed and are left out of every number.

const BROWSER = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const GIVE_UP_MS = 3 * 3600_000;
type Charge = { period: string; plan: number; pack: number };

/** Find the business on Google Maps by name and city. One live request. */
export async function findPlaces(query: string, country: string | undefined): Promise<Place[]> {
  const m = marketOf(country);
  const [t] = await call("serp/google/maps/live/advanced", [{ keyword: query.slice(0, 200), location_code: m.location, language_code: m.language, depth: 20 }]);
  if (t?.status_code !== 20000) throw new Error(`DataForSEO: ${t?.status_message ?? "no result"}`);
  return parsePlaces(t.result?.[0]?.items).slice(0, 8);
}

export type SavedLocation = Location & { id: string };
const MIGRATION = "Run supabase/071_local_locations.sql on the VPS database.";

/** A brand's locations, in order. */
export async function locationsOf(db: SupabaseClient, brandId: string): Promise<SavedLocation[]> {
  const { data, error } = await db.from("local_locations").select("id, data").eq("brand_id", brandId).order("position").order("created_at");
  if (error) throw new Error(/local_locations/.test(error.message) ? MIGRATION : error.message);
  return (data ?? []).map((r) => ({ ...(r.data as Location), id: r.id as string }));
}

/** One location of a brand, or null. */
export async function locationOf(db: SupabaseClient, brandId: string, id: string): Promise<SavedLocation | null> {
  const { data } = await db.from("local_locations").select("id, data").eq("brand_id", brandId).eq("id", id).maybeSingle();
  return data ? { ...(data.data as Location), id: data.id as string } : null;
}

/** Start a scan: post one task per grid point, then collect on the queue. The scan keeps the grid it used. */
export async function startScan(db: SupabaseClient, ws: string, userId: string | null, brandId: string, loc: SavedLocation, keyword: string, opts: { fast: boolean; charge: Charge | null; language: string }) {
  const g = gridOf(loc);
  const points = g.points;
  const { data: row, error } = await db
    .from("local_scans")
    .insert({ workspace_id: ws, brand_id: brandId, location_id: loc.id, keyword, spacing: loc.spacing, size: g.size, shape: g.shape, center_lat: g.center.lat, center_lng: g.center.lng, created_by: userId, charge: opts.charge, step: "Asking Google Maps" })
    .select("id")
    .single();
  if (error || !row) throw new Error(/local_scans|location_id|center_lat/.test(error?.message ?? "") ? MIGRATION : (error?.message ?? "Could not start the scan."));
  try {
    const zoom = zoomFor(loc.spacing);
    const tasks = await call(
      "serp/google/maps/task_post",
      points.map((p) => ({ keyword, location_coordinate: `${p.lat},${p.lng},${zoom}z`, language_code: opts.language, depth: 20, priority: opts.fast ? 2 : 1, tag: `${row.id}:${p.i}` })),
    );
    const ids = (tasks as { id?: string; status_code?: number; data?: { tag?: string } }[]).map((t, k) => ({ i: Number(String(t.data?.tag ?? "").split(":")[1] ?? k), id: t.status_code === 20100 || t.status_code === 20000 ? (t.id ?? null) : null }));
    const failed = Object.fromEntries(ids.filter((t) => !t.id).map((t) => [String(t.i), null]));
    await db.from("local_scans").update({ tasks: ids.filter((t) => t.id), points: failed, step: "Waiting for Google Maps" }).eq("id", row.id);
    await enqueue("local_fetch", { scanId: row.id }, { workspaceId: ws, key: `local_fetch:${row.id}:0`, runAt: new Date(Date.now() + (opts.fast ? 45_000 : 4 * 60_000)), maxAttempts: 3 });
  } catch (e) {
    // Nothing was collected; whoever took the tasks hands them back (the metered route, or the weekly queue).
    await fail(db, row.id, e instanceof Error ? e.message : String(e), false);
    throw e;
  }
  return row.id as string;
}

async function fail(db: SupabaseClient, scanId: string, error: string, refund = true) {
  const { data: s } = await db.from("local_scans").select("workspace_id, charge").eq("id", scanId).maybeSingle();
  await db.from("local_scans").update({ status: "failed", error, charge: null, finished_at: new Date().toISOString() }).eq("id", scanId);
  const c = refund ? (s?.charge as Charge | null) : null;
  if (c) await db.rpc("give_back_tasks", { p_ws: s!.workspace_id, p_period: c.period, p_plan_n: c.plan, p_pack_n: c.pack }).then(({ error: e }) => e && console.error("Local scan refund failed:", e.message));
}

/** Collect what's ready. Called by the job until every point is in, or 3 hours have passed. */
export async function collectScan(db: SupabaseClient, scanId: string, round: number) {
  const { data: s } = await db.from("local_scans").select("id, workspace_id, brand_id, location_id, keyword, spacing, size, shape, center_lat, center_lng, status, tasks, points, created_at").eq("id", scanId).maybeSingle();
  if (!s || s.status !== "running") return;
  const tasks = (s.tasks ?? []) as { i: number; id: string }[];
  const points = { ...((s.points ?? {}) as Record<string, Place[] | null>) };
  const pending = tasks.filter((t) => !(String(t.i) in points));
  await Promise.all(
    pending.map(async (t) => {
      try {
        const [r] = await call(`serp/google/maps/task_get/advanced/${t.id}`);
        if (r?.status_code === 20000) points[String(t.i)] = parsePlaces(r.result?.[0]?.items);
        else if (r?.status_code && r.status_code >= 40000 && !(r.status_code >= 40601 && r.status_code <= 40602)) points[String(t.i)] = null; // a real error, not "still in the queue"
      } catch {
        // Network trouble: try this point again next round.
      }
    }),
  );
  const left = tasks.filter((t) => !(String(t.i) in points)).length;
  const old = Date.now() - Date.parse(s.created_at) > GIVE_UP_MS;
  if (left && !old) {
    await db.from("local_scans").update({ points, step: `Google Maps answered ${tasks.length - left} of ${tasks.length} points` }).eq("id", scanId);
    await enqueue("local_fetch", { scanId, round: round + 1 }, { workspaceId: s.workspace_id, key: `local_fetch:${scanId}:${round + 1}`, runAt: new Date(Date.now() + Math.min(10 * 60_000, 30_000 * 2 ** Math.min(round, 4))), maxAttempts: 3 });
    return;
  }
  for (const t of tasks) if (!(String(t.i) in points)) points[String(t.i)] = null;
  const { data: b } = await db.from("brands").select("domain, profile").eq("id", s.brand_id).maybeSingle();
  // The location the scan was for; scans from before 071 have none and use the brand's first.
  const loc = s.location_id ? await locationOf(db, s.brand_id, s.location_id) : ((await locationsOf(db, s.brand_id).catch(() => []))[0] ?? (b?.profile as Profile | null)?.location ?? null);
  if (!b || !loc) return fail(db, scanId, "The business location was removed.");
  // The grid the scan was posted with, whatever the settings are now.
  const size = Number(s.size) || 7;
  const shape: Shape = s.shape === "circle" ? "circle" : "square";
  const center = s.center_lat !== null && s.center_lat !== undefined ? { lat: Number(s.center_lat), lng: Number(s.center_lng) } : { lat: loc.lat, lng: loc.lng };
  const per = grid(center.lat, center.lng, Number(s.spacing), size, shape).map((p) => ({ i: p.i, results: points[String(p.i)] ?? null }));
  const result: ScanResult & { listing?: ReturnType<typeof listingCheck> } = summarize(s.keyword, Number(s.spacing), per, { ...loc, domain: String(b.domain) }, { size, shape, center });
  if (!result.read) return fail(db, scanId, "Google Maps didn't answer for any point. Try again in a few minutes.");
  result.listing = await siteListing(String(b.domain), loc, result).catch(() => undefined);
  await db.from("local_scans").update({ status: "done", step: "Done", points, result, error: null, finished_at: new Date().toISOString() }).eq("id", scanId);
}

/** Read the brand's homepage for the listing check. Free. */
async function siteListing(domain: string, loc: Location, scan: ScanResult) {
  const r = await safeFetch(`https://${domain}`, { ua: BROWSER, timeout: 12_000, maxBytes: 3_000_000, accept: "text/html" });
  if (!r.ok) return undefined;
  const $ = cheerio.load(r.body);
  const phones = $('a[href^="tel:"]').map((_, a) => $(a).attr("href") ?? "").get();
  for (const m of $("body").text().matchAll(/(\+?\d[\d\s().-]{8,}\d)/g)) phones.push(m[1]);
  let schemaPhone: string | null = null;
  $('script[type="application/ld+json"]').each((_, el) => {
    const m = $(el).text().match(/"telephone"\s*:\s*"([^"]+)"/);
    if (m && !schemaPhone) schemaPhone = m[1];
  });
  $("script, style, noscript").remove();
  return listingCheck(loc, { text: $("body").text(), phones: phones.slice(0, 20), schemaTypes: schemaTypes(r.body), schemaPhone }, scan.rivals);
}

/**
 * The daily tick: each keyword of each location whose schedule (weekly, every 2 weeks or monthly) says it's due.
 * Standard queue, charged by the grid's points. A workspace that runs out of tasks waits for next month.
 */
export async function queueWeeklyScans(db: SupabaseClient) {
  const { data: rows, error } = await db.from("local_locations").select("id, workspace_id, brand_id, data");
  if (error) return; // before 071_local_locations.sql
  const due = (rows ?? []).map((r) => ({ ...r, loc: { ...(r.data as Location), id: r.id as string } as SavedLocation })).filter((r) => scheduleOf(r.loc) !== "off" && r.loc.keywords?.length);
  if (!due.length) return;
  const { data: recent } = await db.from("local_scans").select("location_id, keyword, created_at").in("location_id", due.map((r) => r.id)).gte("created_at", new Date(Date.now() - 31 * 864e5).toISOString()).order("created_at", { ascending: false });
  const last = new Map<string, string>();
  for (const r of recent ?? []) if (!last.has(`${r.location_id}|${r.keyword}`)) last.set(`${r.location_id}|${r.keyword}`, r.created_at as string);
  const { data: brands } = await db.from("brands").select("id, profile").in("id", [...new Set(due.map((r) => r.brand_id))]);
  const country = new Map((brands ?? []).map((b) => [b.id as string, (b.profile as Profile | null)?.country]));
  const open = new Map<string, boolean>();
  for (const r of due) {
    if (!open.has(r.workspace_id)) {
      const e = await entitlement(r.workspace_id);
      open.set(r.workspace_id, !e.readOnly && e.open.seo);
    }
    if (!open.get(r.workspace_id)) continue;
    const cost = scanTasks(gridOf(r.loc).points.length, false);
    for (const k of r.loc.keywords) {
      if (!scanDue(scheduleOf(r.loc), last.get(`${r.id}|${k}`) ?? null)) continue;
      const took = await take(r.workspace_id, "tasks", cost, { refundIfFree: false });
      if (!took.ok) {
        open.set(r.workspace_id, false); // out of tasks: the rest wait for next month
        break;
      }
      const pack = took.fromPack ?? 0;
      const lang = marketOf(country.get(r.brand_id)).language;
      await startScan(db, r.workspace_id, null, r.brand_id, r.loc, k, { fast: false, language: lang, charge: took.period ? { period: took.period, plan: cost - pack, pack } : null }).catch(async (err) => {
        await took.giveBack();
        console.error(`Scheduled local scan for ${k} failed:`, err instanceof Error ? err.message : err);
      });
    }
  }
}
