import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ga4Traffic } from "./ga4";
import { accessToken } from "./google";
import { adminClient } from "./serverAuth";

// A brand's website traffic for a report's time span, from Google Analytics.

/** Exact spans for a report: days as YYYY-MM-DD, and the same spans as moments. */
export type Span = { start: string; end: string; startAt: number; endAt: number };

const cache = new Map<string, { at: number; data: unknown }>();
const remember = async <T>(key: string, ms: number, make: () => Promise<T>): Promise<T> => {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ms) return hit.data as T;
  const data = await make();
  cache.set(key, { at: Date.now(), data });
  if (cache.size > 500) cache.delete(cache.keys().next().value!);
  return data;
};

/**
 * A brand's traffic for a report span, from Google Analytics. Null when no property is picked. Cached for 10 minutes.
 */
export async function brandTraffic(db: SupabaseClient, brandId: string, cur: Span, prev: Span | null) {
  const { data: b } = await db.from("brands").select("ga4_property").eq("id", brandId).maybeSingle();
  const brand = b as { ga4_property?: string | null } | null;
  const before = prev ?? { start: cur.start, end: cur.start, startAt: cur.startAt, endAt: cur.startAt };
  if (brand?.ga4_property) {
    const property = brand.ga4_property;
    return remember(`ga4:${brandId}:${property}:${cur.start}:${cur.end}:${before.start}:${before.end}`, 10 * 60_000, async () => {
      const { data: conn } = (await adminClient()?.from("ga4_connections").select("refresh_token").eq("brand_id", brandId).maybeSingle()) ?? { data: null };
      if (!conn) throw new Error("Reconnect Google Analytics.");
      return ga4Traffic(await accessToken(conn.refresh_token), property, { cur: [cur.start, cur.end], prev: [before.start, before.end] });
    });
  }
  return null;
}
