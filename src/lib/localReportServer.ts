import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Location } from "./local";
import { localReport, type LocalRaw, type LocalReportLoc } from "./localReport";

// Loads the saved Local Research results for a report's dates (src/lib/localReport.ts). Tables that don't exist yet
// just add nothing, so older databases still make reports.

const rows = async <T>(q: PromiseLike<{ data: unknown; error: unknown }>): Promise<T[]> => {
  const r = await q;
  return r.error ? [] : (((r.data as T[] | null) ?? []) as T[]);
};

export async function loadLocal(db: SupabaseClient, brandId: string, start: string, end: string, locationId?: string): Promise<LocalReportLoc[]> {
  let lq = db.from("local_locations").select("id, data").eq("brand_id", brandId).order("position");
  if (locationId) lq = lq.eq("id", locationId);
  const locations = await rows<LocalRaw["locations"][number]>(lq);
  if (!locations.length) return [];
  const ids = locations.map((l) => l.id);
  const since = new Date(Date.parse(`${start}T00:00:00Z`) - 120 * 864e5).toISOString();
  const [scans, profiles, reviews, ai, alerts] = await Promise.all([
    rows<LocalRaw["scans"][number]>(db.from("local_scans").select("location_id, keyword, created_at, result").in("location_id", ids).eq("status", "done").gte("created_at", since).order("created_at", { ascending: false }).limit(400)),
    rows<LocalRaw["profiles"][number]>(db.from("local_profiles").select("location_id, read_at, data").in("location_id", ids).eq("you", true).order("read_at", { ascending: false }).limit(60)),
    rows<LocalRaw["reviews"][number]>(db.from("local_reviews").select("location_id, posted_at").in("location_id", ids).eq("you", true).is("removed_at", null).gte("posted_at", `${start}T00:00:00Z`).limit(5000)),
    rows<LocalRaw["ai"][number]>(db.from("local_ai_scans").select("location_id, keyword, created_at, result").in("location_id", ids).eq("status", "done").order("created_at", { ascending: false }).limit(100)),
    rows<LocalRaw["alerts"][number]>(db.from("local_alerts").select("location_id, title, detail, created_at").in("location_id", ids).eq("status", "open").gte("created_at", `${start}T00:00:00Z`).order("created_at", { ascending: false }).limit(100)),
  ]);
  // Only the rating and review count of each profile read are needed.
  const slim = profiles.map((p) => ({ ...p, data: { rating: (p.data as { rating?: number | null })?.rating ?? null, reviews: (p.data as { reviews?: number | null })?.reviews ?? null } }));
  // A location's new reviews are known only once its reviews were pulled: a pulled location gets a blank row, so it
  // shows 0 instead of "unknown" when none came in.
  const pulled = await rows<{ id: string }>(db.from("local_locations").select("id").in("id", ids).not("reviews_at", "is", null));
  const known = [...reviews, ...pulled.map((p) => ({ location_id: p.id, posted_at: null }))];
  return localReport({ start, end, locations: locations.map((l) => ({ id: l.id, data: l.data as Location })), scans, profiles: slim, reviews: known, ai, alerts });
}
