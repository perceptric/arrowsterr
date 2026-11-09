// Local Research (docs/local-research.md): a grid of points around the business, where it ranks in Google Maps from
// each one, the local rivals, review counts over time and the listing check. Pure, so the worker, the screen and the
// tests share one copy.

export type Place = {
  title: string;
  cid: string | null;
  placeId: string | null;
  domain: string | null;
  address: string | null;
  phone: string | null;
  category: string | null;
  categories: string[];
  rating: number | null;
  reviews: number | null;
  lat: number | null;
  lng: number | null;
  rank: number;
};
/** The business, as picked from Google Maps when the location was added. */
export type Location = {
  title: string;
  cid: string | null;
  placeId: string | null;
  address: string | null;
  phone: string | null;
  category: string | null;
  categories: string[];
  lat: number;
  lng: number;
  city: string | null;
  keywords: string[];
  spacing: number; // miles between grid points
  weekly: boolean;
};
export type Point = { i: number; lat: number; lng: number };
export type PointResult = { i: number; rank: number | null; top: { title: string; cid: string | null }[]; error?: boolean };
export type Rival = { title: string; cid: string | null; domain: string | null; category: string | null; rating: number | null; reviews: number | null; top3: number; seen: number };
export type ScanResult = { keyword: string; size: number; spacing: number; points: PointResult[]; rivals: Rival[]; you: { rating: number | null; reviews: number | null } | null; avg: number | null; top3: number; found: number; read: number };

export const GRID = 7;
export const MAX_DEPTH = 20;
export const SPACINGS = [0.5, 1, 2];

/** A 7 by 7 grid centred on the business, `spacing` miles apart, row by row from the north-west corner. */
export function grid(lat: number, lng: number, spacing: number, size = GRID): Point[] {
  const half = Math.floor(size / 2);
  const dLat = spacing / 69.0;
  const dLng = spacing / (69.172 * Math.cos((lat * Math.PI) / 180));
  const out: Point[] = [];
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) out.push({ i: r * size + c, lat: round(lat + (half - r) * dLat), lng: round(lng + (c - half) * dLng) });
  return out;
}
const round = (x: number) => Math.round(x * 1e6) / 1e6;

/** Google Maps zoom that fits the grid: closer points, closer zoom. */
export const zoomFor = (spacing: number) => (spacing <= 0.5 ? 15 : spacing <= 1 ? 14 : 13);

const clean = (s: string | null | undefined) => (s ?? "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();
const bareHost = (d: string | null | undefined) => (d ?? "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/[/?#].*$/, "");

/** Is this result the business? By Google's ids first, then by the website and the name together. */
export function isBusiness(p: Pick<Place, "cid" | "placeId" | "domain" | "title">, loc: Pick<Location, "cid" | "placeId" | "title"> & { domain?: string | null }): boolean {
  if (loc.cid && p.cid) return loc.cid === p.cid;
  if (loc.placeId && p.placeId) return loc.placeId === p.placeId;
  const d = bareHost(loc.domain);
  return Boolean(d) && bareHost(p.domain) === d && clean(p.title) === clean(loc.title);
}

/** The business's rank at one point: its best spot in the results (a business listed twice counts once, at the top). */
export function rankAt(results: Place[], loc: Parameters<typeof isBusiness>[1]): number | null {
  const mine = results.filter((p) => isBusiness(p, loc)).map((p) => p.rank);
  return mine.length ? Math.min(...mine) : null;
}

const keyOf = (p: Pick<Place, "cid" | "placeId" | "title">) => p.cid || p.placeId || clean(p.title);

/**
 * Sum up a scan: average rank (not found counts as 21, so a gap pulls the average down instead of hiding),
 * top 3 share, and the rivals that held the top 3 most often. Points that failed to load are left out of every number.
 */
export function summarize(keyword: string, spacing: number, perPoint: { i: number; results: Place[] | null }[], loc: Parameters<typeof isBusiness>[1]): ScanResult {
  const points: PointResult[] = [];
  const rivals = new Map<string, Rival>();
  let you: ScanResult["you"] = null;
  for (const { i, results } of perPoint) {
    if (!results) {
      points.push({ i, rank: null, top: [], error: true });
      continue;
    }
    // One entry per business at this point, at its best rank: a business listed twice counts once.
    const unique: Place[] = [];
    const seenHere = new Set<string>();
    for (const p of [...results].sort((a, b) => a.rank - b.rank)) {
      const k = keyOf(p);
      if (!seenHere.has(k)) {
        seenHere.add(k);
        unique.push(p);
      }
    }
    const rank = rankAt(results, loc);
    const top = unique.slice(0, 3).map((p) => ({ title: p.title, cid: p.cid }));
    const topKeys = new Set(unique.slice(0, 3).map(keyOf));
    for (const p of unique) {
      if (isBusiness(p, loc)) {
        if (!you) you = { rating: p.rating, reviews: p.reviews };
        continue;
      }
      const k = keyOf(p);
      const r = rivals.get(k) ?? { title: p.title, cid: p.cid, domain: p.domain, category: p.category, rating: p.rating, reviews: p.reviews, top3: 0, seen: 0 };
      r.seen++;
      if (topKeys.has(k)) r.top3++;
      if (p.reviews !== null && (r.reviews === null || p.reviews > r.reviews)) Object.assign(r, { reviews: p.reviews, rating: p.rating });
      rivals.set(k, r);
    }
    points.push({ i, rank, top });
  }
  const ok = points.filter((p) => !p.error);
  const avg = ok.length ? Math.round((ok.reduce((s, p) => s + Math.min(p.rank ?? MAX_DEPTH + 1, MAX_DEPTH + 1), 0) / ok.length) * 10) / 10 : null;
  return {
    keyword,
    size: GRID,
    spacing,
    points: points.sort((a, b) => a.i - b.i),
    rivals: [...rivals.values()].sort((a, b) => b.top3 - a.top3 || b.seen - a.seen || (b.reviews ?? 0) - (a.reviews ?? 0)).slice(0, 8),
    you,
    avg,
    top3: ok.filter((p) => p.rank !== null && p.rank <= 3).length,
    found: ok.filter((p) => p.rank !== null).length,
    read: ok.length,
  };
}

/** The digits of a phone number, without a leading country code 1, so formats match. */
export function phoneDigits(raw: string | null | undefined): string {
  const d = (raw ?? "").replace(/\D/g, "");
  return d.length === 11 && d.startsWith("1") ? d.slice(1) : d;
}

export type ListingCheck = { id: "name" | "phone" | "address" | "schema" | "category"; label: string; status: "pass" | "warn" | "fail"; detail: string };

/**
 * Does the website agree with the Google listing? Name, phone and street address on the page, LocalBusiness schema,
 * and the category against the categories the rivals holding the top 3 use.
 */
export function listingCheck(loc: Pick<Location, "title" | "phone" | "address" | "category" | "categories">, site: { text: string; phones: string[]; schemaTypes: string[]; schemaPhone: string | null }, rivals: Pick<Rival, "category" | "top3">[]): ListingCheck[] {
  const text = clean(site.text);
  const out: ListingCheck[] = [];
  out.push({ id: "name", label: "Name matches", status: text.includes(clean(loc.title)) ? "pass" : "warn", detail: `Google: ${loc.title}` });
  const want = phoneDigits(loc.phone);
  const onSite = [...site.phones, site.schemaPhone ?? ""].map(phoneDigits).filter((d) => d.length >= 7);
  out.push(
    !want
      ? { id: "phone", label: "Phone on Google", status: "warn", detail: "The Google listing has no phone number." }
      : onSite.includes(want)
        ? { id: "phone", label: "Phone matches", status: "pass", detail: loc.phone ?? "" }
        : { id: "phone", label: "Phone differs", status: "fail", detail: onSite.length ? `Google ${loc.phone}, website ${onSite[0]}` : `Google ${loc.phone}, not found on the website` },
  );
  const street = clean((loc.address ?? "").split(",")[0]);
  out.push({ id: "address", label: street ? (street && text.includes(street) ? "Address matches" : "Address not on the website") : "Address on Google", status: street ? (text.includes(street) ? "pass" : "warn") : "warn", detail: loc.address ?? "The Google listing has no address." });
  const local = site.schemaTypes.some((t) => /LocalBusiness|Dentist|Restaurant|Store|MedicalBusiness|LegalService|HomeAndConstructionBusiness|AutomotiveBusiness|HealthAndBeautyBusiness|ProfessionalService|FinancialService|FoodEstablishment|LodgingBusiness/i.test(t));
  out.push({ id: "schema", label: "LocalBusiness schema", status: local ? "pass" : "fail", detail: local ? "Found." : "No LocalBusiness schema on the homepage." });
  const count = new Map<string, number>();
  for (const r of rivals.filter((x) => x.top3 > 0)) if (r.category) count.set(r.category, (count.get(r.category) ?? 0) + r.top3);
  const top = [...count.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const mine = [loc.category, ...loc.categories].filter(Boolean).map((c) => clean(c));
  out.push(
    !top || mine.includes(clean(top))
      ? { id: "category", label: "Category", status: "pass", detail: loc.category ?? "No category" }
      : { id: "category", label: `Rivals use ${top}`, status: "warn", detail: `Your main category is ${loc.category ?? "not set"}. The rivals holding the top 3 most use ${top}.` },
  );
  return out;
}

/** New reviews between scans for the business and its top rivals, oldest first. */
export function reviewHistory(scans: { at: string; you: ScanResult["you"]; rivals: Pick<Rival, "title" | "reviews">[] }[], names: string[]): { at: string; you: number | null; rivals: Record<string, number | null> }[] {
  return [...scans].sort((a, b) => a.at.localeCompare(b.at)).map((s) => ({ at: s.at, you: s.you?.reviews ?? null, rivals: Object.fromEntries(names.map((n) => [n, s.rivals.find((r) => r.title === n)?.reviews ?? null])) }));
}

/** Local prompts to track in AI Visibility, from the category and city. */
export function localPrompts(loc: Pick<Location, "category" | "city">, keywords: string[]): string[] {
  const city = loc.city?.trim();
  if (!city) return [];
  const things = [...new Set([loc.category, ...keywords].filter((x): x is string => Boolean(x)).map((x) => x.toLowerCase().replace(/\s+near me$/, "").trim()))].slice(0, 3);
  return things.flatMap((t) => [`best ${t} in ${city}`, `which ${t} in ${city} do people recommend`]).slice(0, 6);
}

/** Google Maps results (DataForSEO maps_search items) as places. */
export function parsePlaces(items: unknown[] | null | undefined): Place[] {
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  return ((items ?? []) as Record<string, unknown>[])
    .filter((i) => (i.type === "maps_search" || i.type === undefined) && str(i.title))
    .map((i) => {
      const r = (i.rating ?? {}) as Record<string, unknown>;
      return {
        title: str(i.title)!,
        cid: str(i.cid),
        placeId: str(i.place_id),
        domain: str(i.domain),
        address: str(i.address),
        phone: str(i.phone),
        category: str(i.category),
        categories: Array.isArray(i.additional_categories) ? (i.additional_categories as unknown[]).map(String).filter(Boolean) : [],
        rating: num(r.value),
        reviews: num(r.votes_count),
        lat: num(i.latitude),
        lng: num(i.longitude),
        rank: num(i.rank_group) ?? num(i.rank_absolute) ?? 99,
      };
    });
}

/** The city from a Google address: the part before the state and postcode, like "Austin" in "1200 Lamar Blvd, Austin, TX 78703". */
export function cityOf(address: string | null | undefined): string | null {
  const parts = (address ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  const last = parts[parts.length - 1];
  const city = /\d/.test(last) || /^[A-Z]{2}$/.test(last) || parts.length > 2 ? parts[parts.length - 2] : last;
  return city.replace(/\s+[A-Z]{2}\s*\d.*$/, "").trim() || null;
}
