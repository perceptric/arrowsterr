// The numbers on a scan: average rank, top 3 share, Local Pack share, organic rank and the
// competitors that own the map. Pure, so tests and the report page compute the same thing.

import { findRank, listingKey, type Listing } from "./match.ts";

/** Not in the top 20 counts as 21 when averaging over every pin ("20+"). */
export const NOT_FOUND = 21;

export type PinResult = {
  idx: number;
  maps_rank: number | null;
  pack_rank: number | null;
  organic_rank: number | null;
  maps_top: Listing[] | null;
  maps_done: boolean;
  organic_done: boolean;
};

export type Competitor = {
  key: string;
  name: string;
  domain: string;
  rating: number | null;
  reviews: number | null;
  category: string;
  pins: number;
  avg: number;
  top3: number;
  solv: number;
  is_target: boolean;
};

export type Summary = {
  pins: number;
  maps: { done: number; found: number; top3: number; avg_found: number | null; avg_all: number | null; solv: number };
  pack: { done: number; in_pack: number; share: number };
  organic: { done: number; found: number; top10: number; avg_found: number | null };
  competitors: Competitor[];
};

const round1 = (n: number) => Math.round(n * 10) / 10;
const avg = (xs: number[]) => (xs.length ? round1(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
const pct = (n: number, d: number) => (d ? Math.round((n / d) * 1000) / 10 : 0);

export function summarize(pins: PinResult[], target: { name: string; domain: string; cid: string; place_id: string }): Summary {
  const maps = pins.filter((p) => p.maps_done);
  const organic = pins.filter((p) => p.organic_done);
  const mapsFound = maps.filter((p) => p.maps_rank != null).map((p) => p.maps_rank!);
  const top3 = mapsFound.filter((r) => r <= 3).length;
  const orgFound = organic.filter((p) => p.organic_rank != null).map((p) => p.organic_rank!);

  const by = new Map<string, Competitor & { sum: number }>();
  for (const p of maps) {
    for (const l of p.maps_top ?? []) {
      const key = listingKey(l);
      const c = by.get(key) ?? {
        key,
        name: l.title,
        domain: l.domain,
        rating: l.rating,
        reviews: l.reviews,
        category: l.category,
        pins: 0,
        avg: 0,
        top3: 0,
        solv: 0,
        sum: 0,
        is_target: findRank([l], target) != null,
      };
      c.pins++;
      c.sum += l.rank;
      if (l.rank <= 3) c.top3++;
      if (l.reviews != null && (c.reviews == null || l.reviews > c.reviews)) {
        c.reviews = l.reviews;
        c.rating = l.rating;
      }
      by.set(key, c);
    }
  }
  const competitors = [...by.values()]
    .map(({ sum, ...c }) => ({ ...c, avg: round1((sum + (maps.length - c.pins) * NOT_FOUND) / Math.max(maps.length, 1)), solv: pct(c.top3, maps.length) }))
    .sort((a, b) => b.solv - a.solv || a.avg - b.avg || b.pins - a.pins)
    .slice(0, 20);

  return {
    pins: pins.length,
    maps: {
      done: maps.length,
      found: mapsFound.length,
      top3,
      avg_found: avg(mapsFound),
      avg_all: avg(maps.map((p) => p.maps_rank ?? NOT_FOUND)),
      solv: pct(top3, maps.length),
    },
    pack: { done: organic.length, in_pack: organic.filter((p) => p.pack_rank != null).length, share: pct(organic.filter((p) => p.pack_rank != null).length, organic.length) },
    organic: { done: organic.length, found: orgFound.length, top10: orgFound.filter((r) => r <= 10).length, avg_found: avg(orgFound) },
    competitors,
  };
}

/** One competitor's Maps rank at every pin (null where they're not in the top 20). */
export function competitorRanks(pins: PinResult[], key: string): Map<number, number | null> {
  const out = new Map<number, number | null>();
  for (const p of pins) {
    if (!p.maps_done) continue;
    out.set(p.idx, p.maps_top?.find((l) => listingKey(l) === key)?.rank ?? null);
  }
  return out;
}

export type Band = "top" | "mid" | "low" | "out" | "none";
/** The heatmap color band for a rank. */
export function band(rank: number | null | undefined): Band {
  if (rank == null) return "none";
  if (rank <= 3) return "top";
  if (rank <= 10) return "mid";
  if (rank <= 20) return "low";
  return "out";
}
