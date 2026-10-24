// Finding the business in a list of results. A wrong match shows a rank the business doesn't have,
// which costs more than showing none, so IDs win and a name or domain alone never matches.

export type Listing = {
  rank: number;
  title: string;
  domain: string;
  cid: string;
  place_id: string;
  rating: number | null;
  reviews: number | null;
  category: string;
  address: string;
  lat: number | null;
  lng: number | null;
};
export type OrganicItem = { rank: number; domain: string; url: string; title: string };
export type Target = { name: string; domain: string; cid: string; place_id: string };

/** A host without www or a trailing dot, lowercased. */
export const bareHost = (host: string) =>
  host
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/[/?#].*$/, "")
    .replace(/^www\./, "")
    .replace(/\.$/, "");

/** Does a result's host belong to the business's domain? Subdomains count; look-alike domains don't. */
export function sameSite(host: string, domain: string): boolean {
  const h = bareHost(host);
  const d = bareHost(domain);
  return Boolean(d) && Boolean(h) && (h === d || h.endsWith(`.${d}`));
}

/** A business name reduced for comparing: case, accents, "&", punctuation and legal endings ignored. */
export function normName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’`]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(llc|inc|ltd|co|corp|pllc|pc|llp)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Is this listing the target business? With an ID on both sides, only the ID decides. Without one,
 * the name must match exactly (after normName) and the websites must not disagree.
 */
export function isTarget(l: Pick<Listing, "title" | "domain" | "cid" | "place_id">, t: Target): boolean {
  if (t.cid && l.cid) return t.cid === l.cid;
  if (t.place_id && l.place_id) return t.place_id === l.place_id;
  const a = normName(l.title);
  if (!a || a !== normName(t.name)) return false;
  if (l.domain && t.domain) return sameSite(l.domain, t.domain);
  return true;
}

export const findRank = (list: Listing[] | null | undefined, t: Target): number | null => list?.find((l) => isTarget(l, t))?.rank ?? null;

export function organicRank(list: OrganicItem[] | null | undefined, domain: string): number | null {
  if (!domain) return null;
  return list?.find((o) => sameSite(o.domain, domain))?.rank ?? null;
}

type Raw = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" ? v : "");
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

function toListing(i: Raw, rank: number): Listing {
  const rating = (i.rating ?? {}) as Raw;
  return {
    rank,
    title: str(i.title),
    domain: bareHost(str(i.domain) || str(i.url)),
    cid: str(i.cid),
    place_id: str(i.place_id),
    rating: num(rating.value),
    reviews: num(rating.votes_count),
    category: str(i.category),
    address: str(i.address),
    lat: num(i.latitude),
    lng: num(i.longitude),
  };
}

/** DataForSEO Maps items to the first `depth` organic listings, in order. Ads are skipped. */
export function parseMaps(items: unknown, depth = 20): Listing[] {
  if (!Array.isArray(items)) return [];
  return (items as Raw[])
    .filter((i) => i?.type === "maps_search")
    .sort((a, b) => Number(a.rank_group) - Number(b.rank_group))
    .slice(0, depth)
    .map((i, n) => toListing(i, n + 1));
}

/** DataForSEO organic items to the Local Pack (unpaid, in order) and the regular results. */
export function parseOrganic(items: unknown, depth = 20): { pack: Listing[]; organic: OrganicItem[] } {
  if (!Array.isArray(items)) return { pack: [], organic: [] };
  const list = items as Raw[];
  const pack = list
    .filter((i) => i?.type === "local_pack" && i.is_paid !== true)
    .sort((a, b) => Number(a.rank_group) - Number(b.rank_group))
    .map((i, n) => toListing(i, n + 1));
  const organic = list
    .filter((i) => i?.type === "organic")
    .sort((a, b) => Number(a.rank_group) - Number(b.rank_group))
    .slice(0, depth)
    .map((i, n) => ({ rank: n + 1, domain: bareHost(str(i.domain) || str(i.url)), url: str(i.url), title: str(i.title) }));
  return { pack, organic };
}

/** A stable key for a business across pins and scans. */
export const listingKey = (l: Pick<Listing, "cid" | "place_id" | "title" | "domain">) =>
  l.cid ? `cid:${l.cid}` : l.place_id ? `pid:${l.place_id}` : `n:${normName(l.title)}|${bareHost(l.domain)}`;
