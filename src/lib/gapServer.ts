import "server-only";
import { call } from "./dataforseo";
import type { GapRow } from "./gap";
import type { Spend } from "./keywords";

// The keyword gap between two domains, from DataForSEO Labs. Used by Competitors in the app and the free Keyword Gap Tool.

type Serp = { rank_group?: number | null; url?: string | null };
type Item = {
  keyword_data?: {
    keyword?: string;
    keyword_info?: { search_volume?: number | null };
    keyword_properties?: { keyword_difficulty?: number | null };
    search_intent_info?: { main_intent?: string | null };
  };
  first_domain_serp_element?: Serp | null;
  second_domain_serp_element?: Serp | null;
};

/** Keywords target1 ranks for, with (intersections) or without target2 ranking too. */
export async function intersect(target1: string, target2: string, both: boolean, m: { location: number; language: string }, spend: Spend, opts: { limit?: number; filters?: unknown[] } = {}) {
  const tasks = await call("dataforseo_labs/google/domain_intersection/live", [
    {
      target1,
      target2,
      intersections: both,
      location_code: m.location,
      language_code: m.language,
      limit: opts.limit ?? 300,
      order_by: ["keyword_data.keyword_info.search_volume,desc"],
      ...(opts.filters ? { filters: opts.filters } : {}),
    },
  ]);
  spend.add(tasks);
  const t = tasks[0];
  if (t?.status_code !== 20000) throw new Error(`DataForSEO: ${t?.status_message ?? "no result"}`);
  const r = t.result?.[0] ?? {};
  return { total: Number(r.total_count ?? 0), items: (r.items ?? []) as Item[] };
}

export const row = (i: Item, flip: boolean): GapRow | null => {
  const k = i.keyword_data;
  if (!k?.keyword) return null;
  const a = i.first_domain_serp_element;
  const b = i.second_domain_serp_element;
  const them = flip ? b : a;
  const you = flip ? a : b;
  return {
    keyword: k.keyword,
    volume: k.keyword_info?.search_volume ?? null,
    kd: k.keyword_properties?.keyword_difficulty ?? null,
    intent: k.search_intent_info?.main_intent ?? null,
    them: them?.rank_group ?? null,
    you: you?.rank_group ?? null,
    url: them?.url ?? null,
  };
};
export const rows = (items: Item[], flip: boolean) => items.map((i) => row(i, flip)).filter((r): r is GapRow => Boolean(r));
