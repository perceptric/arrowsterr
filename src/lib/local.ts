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
/** The key a business has in `businesses`. */
export const placeKey = keyOf;

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

/** A 10-digit number as (512) 555-0142; anything else as it is. */
export function showPhone(d: string): string {
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : d;
}

export type ListingCheck = { id: "name" | "phone" | "address" | "schema" | "category"; label: string; status: "pass" | "warn" | "fail"; detail: string };

/**
 * Does the website agree with the Google listing? Name, phone and street address on the page, LocalBusiness schema,
 * and the category against the categories the rivals holding the top 3 use.
 */
export function listingCheck(loc: Pick<Location, "title" | "phone" | "address" | "category" | "categories">, site: { text: string; phones: string[]; schemaTypes: string[]; schemaPhone: string | null }, rivals: Pick<Rival, "category" | "top3">[]): ListingCheck[] {
  const text = clean(site.text);
  const out: ListingCheck[] = [];
  const named = text.includes(clean(loc.title));
  out.push({ id: "name", label: named ? "Name matches" : "Name not on the website", status: named ? "pass" : "warn", detail: `Google: ${loc.title}` });
  const want = phoneDigits(loc.phone);
  const onSite = [...site.phones, site.schemaPhone ?? ""].map(phoneDigits).filter((d) => d.length >= 7);
  // Only a number as long as Google's counts as a different phone: dates, zip codes and order numbers in the page text don't.
  const other = onSite.find((d) => d.length === want.length && d !== want);
  out.push(
    !want
      ? { id: "phone", label: "Phone on Google", status: "warn", detail: "The Google listing has no phone number." }
      : onSite.includes(want)
        ? { id: "phone", label: "Phone matches", status: "pass", detail: loc.phone ?? "" }
        : other
          ? { id: "phone", label: "Phone differs", status: "fail", detail: `Google ${loc.phone}, website ${showPhone(other)}` }
          : { id: "phone", label: "Phone not on the website", status: "warn", detail: `Google ${loc.phone}` },
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
      : { id: "category", label: `Competitors use ${top}`, status: "warn", detail: `Your main category is ${loc.category ?? "not set"}. The competitors holding the top 3 most use ${top}.` },
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

const DIRS = ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"];

/** Where a grid point sits from the business: compass direction and straight-line miles. The centre is "". */
export function whereIs(i: number, spacing: number, size = GRID): { dir: string; miles: number } {
  const half = Math.floor(size / 2);
  const dx = (i % size) - half;
  const dy = half - Math.floor(i / size);
  if (!dx && !dy) return { dir: "", miles: 0 };
  const deg = ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360;
  return { dir: DIRS[Math.round(deg / 45) % 8], miles: Math.round(Math.hypot(dx, dy) * spacing * 10) / 10 };
}

/** "2 mi south-west", or "at the business" for the centre. */
export function placeText(i: number, spacing: number, size = GRID): string {
  const w = whereIs(i, spacing, size);
  return w.dir ? `${w.miles} mi ${w.dir}` : "at the business";
}

export type MapOwner = { title: string; you: boolean; top3: number; first: number; rating: number | null; reviews: number | null; category: string | null };

/** Who holds the map: the business and its competitors, with top 3 points and #1 spots, most top 3 points first. */
export function mapOwners(scan: ScanResult, you: Pick<Location, "title" | "cid">): MapOwner[] {
  const same = (t: { title: string; cid: string | null }, o: { title: string; cid: string | null }) => (t.cid && o.cid ? t.cid === o.cid : clean(t.title) === clean(o.title));
  const ok = scan.points.filter((p) => !p.error);
  const firsts = (o: { title: string; cid: string | null }) => ok.filter((p) => p.top[0] && same(p.top[0], o)).length;
  const me: MapOwner = { title: you.title, you: true, top3: scan.top3, first: ok.filter((p) => p.rank === 1).length, rating: scan.you?.rating ?? null, reviews: scan.you?.reviews ?? null, category: null };
  const others = scan.rivals.map((r) => ({ title: r.title, you: false, top3: r.top3, first: firsts(r), rating: r.rating, reviews: r.reviews, category: r.category }));
  return [me, ...others].sort((a, b) => b.top3 - a.top3 || b.first - a.first || Number(b.you) - Number(a.you));
}

/** "Raising Cane's" stays as it is, "Smiles" gets "'", anything else "'s". */
const poss = (name: string) => (/'s$/i.test(name) ? name : /s$/i.test(name) ? `${name}'` : `${name}'s`);

export type Insight = { tone: "good" | "warn" | "bad" | "info"; text: string };

/** What a scan says in plain words: one headline, then findings on reach, direction, change and reviews. */
export function localInsights(scan: ScanResult, prev: ScanResult | null, you: Pick<Location, "title" | "cid">): { headline: string; insights: Insight[] } {
  const ok = scan.points.filter((p) => !p.error);
  const n = (x: number) => x.toLocaleString("en-US");
  const owners = mapOwners(scan, you);
  const leader = owners.find((o) => !o.you && o.top3 > 0) ?? null;
  const share = scan.read ? scan.top3 / scan.read : 0;
  const kw = `“${scan.keyword}”`;
  const headline =
    !scan.read
      ? `No point answered for ${kw}.`
      : share >= 0.6
        ? `You hold the map pack for ${kw} at ${scan.top3} of ${scan.read} points.`
        : !scan.found
          ? `You're not in the top 20 for ${kw} anywhere on the grid${leader ? `. ${leader.title} holds the top 3 at ${leader.top3} of ${scan.read} points.` : "."}`
          : leader && leader.top3 > scan.top3
            ? `${leader.title} holds the top 3 for ${kw} at ${leader.top3} of ${scan.read} points. You hold it at ${scan.top3}.`
            : `You're in the top 3 for ${kw} at ${scan.top3} of ${scan.read} points.`;

  const out: Insight[] = [];
  const centre = ok.find((p) => p.i === Math.floor((GRID * GRID) / 2));
  if (centre) out.push(centre.rank === null ? { tone: "bad", text: "At your own address you're not in the top 20." } : { tone: centre.rank <= 3 ? "good" : "warn", text: `At your own address you rank #${centre.rank}.` });

  const found = ok.filter((p) => p.rank !== null).sort((a, b) => a.rank! - b.rank! || whereIs(a.i, scan.spacing).miles - whereIs(b.i, scan.spacing).miles);
  if (found.length) {
    const best = found[0];
    if (best.i !== centre?.i) out.push({ tone: best.rank! <= 3 ? "good" : "info", text: `Your best spot is #${best.rank}, ${placeText(best.i, scan.spacing)}.` });
    const top10 = ok.filter((p) => p.rank !== null && p.rank <= 10).map((p) => whereIs(p.i, scan.spacing).miles);
    const edge = Math.max(...ok.map((p) => whereIs(p.i, scan.spacing).miles));
    if (top10.length) {
      const reach = Math.max(...top10);
      out.push(reach >= edge ? { tone: "good", text: `You stay in the top 10 out to the edge of the grid, ${reach} mi away.` } : { tone: "info", text: `You reach the top 10 as far as ${reach} mi out. Past that, competitors take over.` });
    }
  }

  // Strongest and weakest side: the average rank of the points on each half of the grid.
  if (found.length >= 3) {
    const score = (p: PointResult) => Math.min(p.rank ?? MAX_DEPTH + 1, MAX_DEPTH + 1);
    const sides = (["north", "south", "east", "west"] as const).map((side) => {
      const pts = ok.filter((p) => {
        const r = Math.floor(p.i / GRID), c = p.i % GRID, h = Math.floor(GRID / 2);
        return side === "north" ? r < h : side === "south" ? r > h : side === "east" ? c > h : c < h;
      });
      return { side, avg: pts.length ? pts.reduce((s, p) => s + score(p), 0) / pts.length : MAX_DEPTH + 1 };
    }).sort((a, b) => a.avg - b.avg);
    if (sides[3].avg - sides[0].avg >= 2) out.push({ tone: "info", text: `You're strongest to the ${sides[0].side} and weakest to the ${sides[3].side}.` });
  }

  if (prev && prev.read) {
    const d3 = scan.top3 - prev.top3;
    const d20 = scan.found - prev.found;
    if (d3 || d20) {
      const part = (d: number, what: string) => (d ? `${d > 0 ? "+" : ""}${d} ${Math.abs(d) === 1 ? "point" : "points"} ${what}` : null);
      out.push({ tone: d3 > 0 || (!d3 && d20 > 0) ? "good" : "bad", text: `Since the last scan: ${[part(d3, "in the top 3"), part(d20, "in the top 20")].filter(Boolean).join(", ")}.` });
    } else out.push({ tone: "info", text: "No change in the top 3 or top 20 since the last scan." });
  }

  const mine = scan.you?.reviews ?? null;
  if (leader && leader.reviews !== null && mine !== null && leader.reviews > mine * 1.5) {
    out.push({ tone: "warn", text: `${leader.title} has ${n(leader.reviews)} reviews to your ${n(mine)}. Reviews are one of the strongest map pack signals.` });
  } else if (leader && leader.reviews !== null && mine !== null && mine >= leader.reviews) {
    out.push({ tone: "good", text: `You have more reviews than ${leader.title} (${n(mine)} to ${n(leader.reviews)}).` });
  }
  if (leader && leader.rating !== null && scan.you?.rating != null && leader.rating - scan.you.rating >= 0.3) {
    out.push({ tone: "warn", text: `Your rating is ${scan.you.rating}, ${poss(leader.title)} is ${leader.rating}.` });
  }
  return { headline, insights: out };
}

export type Business = {
  key: string;
  title: string;
  you: boolean;
  address: string | null;
  category: string | null;
  rating: number | null;
  reviews: number | null;
  /** Rank at each grid point, by point number: a number, null when not in the top 20, undefined when the point failed. */
  ranks: (number | null | undefined)[];
  avg: number | null;
  top3: number;
  found: number;
  /** Share of the map pack: the 3 slots at each answered point that this business holds. All businesses add up to 100%. */
  voice: number;
};

/**
 * Every business in a scan with its rank at each point, from the saved Google Maps results, so any of them can be shown
 * on the map. The business itself is always in the list. Averages count "not in the top 20" as 21, like `summarize`.
 */
export function businesses(perPoint: { i: number; results: Place[] | null }[], loc: Parameters<typeof isBusiness>[1] & { address?: string | null; category?: string | null }, size = GRID): Business[] {
  const all = new Map<string, Business>();
  const answered = perPoint.filter((p) => p.results).length;
  const blank = (b: Omit<Business, "ranks" | "avg" | "top3" | "found" | "voice">): Business => ({ ...b, ranks: Array.from({ length: size * size }, (_, i) => (perPoint.find((p) => p.i === i)?.results ? null : undefined)), avg: null, top3: 0, found: 0, voice: 0 });
  const youKey = "__you";
  all.set(youKey, blank({ key: youKey, title: loc.title, you: true, address: loc.address ?? null, category: loc.category ?? null, rating: null, reviews: null }));
  for (const { i, results } of perPoint) {
    if (!results) continue;
    const seenHere = new Set<string>();
    for (const p of [...results].sort((a, b) => a.rank - b.rank)) {
      const me = isBusiness(p, loc);
      const k = me ? youKey : keyOf(p);
      if (seenHere.has(k)) continue;
      seenHere.add(k);
      const b = all.get(k) ?? blank({ key: k, title: p.title, you: false, address: p.address, category: p.category, rating: p.rating, reviews: p.reviews });
      if (p.rank <= MAX_DEPTH) b.ranks[i] = p.rank;
      if (p.reviews !== null && (b.reviews === null || p.reviews > b.reviews)) Object.assign(b, { reviews: p.reviews, rating: p.rating });
      if (!b.address && p.address) b.address = p.address;
      all.set(k, b);
    }
  }
  for (const b of all.values()) {
    const ok = b.ranks.filter((r) => r !== undefined) as (number | null)[];
    b.found = ok.filter((r) => r !== null).length;
    b.top3 = ok.filter((r) => r !== null && r <= 3).length;
    b.avg = ok.length ? Math.round((ok.reduce<number>((s, r) => s + Math.min(r ?? MAX_DEPTH + 1, MAX_DEPTH + 1), 0) / ok.length) * 10) / 10 : null;
    b.voice = answered ? b.top3 / (answered * 3) : 0;
  }
  return [...all.values()].sort((a, b) => (a.avg ?? 99) - (b.avg ?? 99) || b.top3 - a.top3 || Number(b.you) - Number(a.you));
}

/** How many answered points fall in each rank band. */
export function rankBands(ranks: (number | null | undefined)[]): { good: number; average: number; poor: number; out: number; read: number } {
  const ok = ranks.filter((r) => r !== undefined) as (number | null)[];
  return {
    good: ok.filter((r) => r !== null && r <= 3).length,
    average: ok.filter((r) => r !== null && r > 3 && r <= 10).length,
    poor: ok.filter((r) => r !== null && r > 10).length,
    out: ok.filter((r) => r === null).length,
    read: ok.length,
  };
}
