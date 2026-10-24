// Where rank data comes from. Each pin is two searches: Google Maps, and Google web results
// (which hold the Local Pack and the organic ranks).

import type { Listing, OrganicItem } from "./match.ts";

export type Kind = "maps" | "organic";

export type TaskSpec = {
  tag: string;
  keyword: string;
  lat: number;
  lng: number;
  zoom: number;
  priority: 1 | 2;
  /** Only the demo provider reads this, to place the business in its made-up results. */
  target?: { name: string; domain: string; cid: string; lat: number; lng: number };
};

export type Posted = { id: string } | { error: string };
export type Fetched =
  | { state: "waiting" }
  | { state: "failed"; error: string }
  | { state: "done"; maps?: Listing[]; pack?: Listing[]; organic?: OrganicItem[] };

export interface Provider {
  name: "dataforseo" | "demo";
  /** Queue searches. Returns one entry per spec, in order. */
  post(kind: Kind, specs: TaskSpec[]): Promise<Posted[]>;
  /** Collect one queued search. */
  get(kind: Kind, id: string): Promise<Fetched>;
  /** Find a business on Google Maps by name and city. */
  search(query: string): Promise<Listing[]>;
}

/** How long a posted search may wait before it is posted again. */
export const STALE_MS = 50 * 60_000;
/** Attempts per search before the pin is marked failed. */
export const MAX_ATTEMPTS = 3;
