import "server-only";
import * as cheerio from "cheerio";
import type { SupabaseClient } from "@supabase/supabase-js";
import { call } from "./dataforseo";
import type { Profile } from "./db";
import { entitlement, take } from "./entitlements";
import { enqueue } from "./jobs";
import { grid, listingCheck, parsePlaces, summarize, zoomFor, type Location, type Place, type ScanResult } from "./local";
import { schemaTypes } from "./pageFacts";
import { TASK_COST } from "./plans";
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

/** Start a scan: post one task per grid point, then collect on the queue. */
export async function startScan(db: SupabaseClient, ws: string, userId: string | null, brandId: string, loc: Location, keyword: string, opts: { fast: boolean; charge: Charge | null; language: string }) {
  const points = grid(loc.lat, loc.lng, loc.spacing);
  const { data: row, error } = await db.from("local_scans").insert({ workspace_id: ws, brand_id: brandId, keyword, spacing: loc.spacing, created_by: userId, charge: opts.charge, step: "Asking Google Maps" }).select("id").single();
  if (error || !row) throw new Error(/local_scans/.test(error?.message ?? "") ? "Run supabase/066_local.sql with psql on the VPS database." : (error?.message ?? "Could not start the scan."));
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
  const { data: s } = await db.from("local_scans").select("id, workspace_id, brand_id, keyword, spacing, status, tasks, points, created_at").eq("id", scanId).maybeSingle();
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
  const loc = (b?.profile as Profile | null)?.location;
  if (!b || !loc) return fail(db, scanId, "The business location was removed.");
  const per = grid(loc.lat, loc.lng, Number(s.spacing)).map((p) => ({ i: p.i, results: points[String(p.i)] ?? null }));
  const result: ScanResult & { listing?: ReturnType<typeof listingCheck> } = summarize(s.keyword, Number(s.spacing), per, { ...loc, domain: String(b.domain) });
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

/** The daily tick: each keyword of each brand with weekly scans on, a week after its last scan. Standard queue. */
export async function queueWeeklyScans(db: SupabaseClient) {
  const { data: brands } = await db.from("brands").select("id, workspace_id, profile");
  const due = (brands ?? []).filter((b) => (b.profile as Profile | null)?.location?.weekly && (b.profile as Profile).location!.keywords.length);
  if (!due.length) return;
  const { data: recent, error } = await db.from("local_scans").select("brand_id, keyword, created_at").in("brand_id", due.map((b) => b.id)).gte("created_at", new Date(Date.now() - 7 * 864e5 + 3 * 3600_000).toISOString());
  if (error) return; // before 066_local.sql
  const fresh = new Set((recent ?? []).map((r) => `${r.brand_id}|${r.keyword}`));
  for (const b of due) {
    const loc = (b.profile as Profile).location!;
    const e = await entitlement(b.workspace_id);
    if (e.readOnly || !e.open.seo) continue;
    for (const k of loc.keywords) {
      if (fresh.has(`${b.id}|${k}`)) continue;
      const took = await take(b.workspace_id, "tasks", TASK_COST.localscan, { refundIfFree: false });
      if (!took.ok) break; // out of tasks: the rest wait for next month
      const pack = took.fromPack ?? 0;
      const lang = marketOf((b.profile as Profile).country).language;
      await startScan(db, b.workspace_id, null, b.id, loc, k, { fast: false, language: lang, charge: took.period ? { period: took.period, plan: TASK_COST.localscan - pack, pack } : null }).catch(async (err) => {
        await took.giveBack();
        console.error(`Weekly local scan for ${k} failed:`, err instanceof Error ? err.message : err);
      });
    }
  }
}
