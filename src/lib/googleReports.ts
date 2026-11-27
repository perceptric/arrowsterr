// The Analytics page's two reports, Search Console and Google Analytics 4, as the plain parts: date ranges, filters
// turned into API bodies, the AI assistants channel, joining the two by page path, weekly buckets and CSV.
// No server imports, so the browser, the server (googleReportsServer.ts) and the tests all use it.

import { AI_SOURCES, aiSourceOf } from "./aiSources.ts";
import { pagePath } from "./seoAnalytics.ts";

// ─────────────── Dates ───────────────

export type DateRange = { from: string; to: string };
/** 24h is Search Console's last 24 hours, by hour. today is GA4's day so far, by hour. */
export type RangeId = "24h" | "today" | "7d" | "28d" | "3m" | "6m" | "12m" | "16m" | "custom";
export type CompareMode = "prev" | "year" | "none";

export const RANGE_DAYS: Partial<Record<RangeId, number>> = { "7d": 7, "28d": 28, "3m": 90, "6m": 180, "12m": 365, "16m": 486 };
export const RANGE_LABEL: Record<RangeId, string> = { "24h": "24 hours", today: "Today", "7d": "7 days", "28d": "28 days", "3m": "3 months", "6m": "6 months", "12m": "12 months", "16m": "16 months", custom: "Custom" };

const DAY = 864e5;
const ISO = /^\d{4}-\d{2}-\d{2}$/;
export const addDay = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
export const daysIn = (r: DateRange) => Math.round((Date.parse(r.to) - Date.parse(r.from)) / DAY) + 1;

/** The dates a range covers. Day ranges end yesterday, as Google's own reports do. */
export function rangeOf(id: RangeId, today: string, custom?: DateRange | null): DateRange {
  if (id === "custom" && custom) return custom;
  if (id === "today") return { from: today, to: today };
  if (id === "24h") return { from: addDay(today, -1), to: today };
  const to = addDay(today, -1);
  return { from: addDay(to, -((RANGE_DAYS[id] ?? 28) - 1)), to };
}

/** The range to compare with: the same number of days just before, or the same dates a year earlier. */
export function compareRange(r: DateRange, mode: CompareMode): DateRange | null {
  if (mode === "none") return null;
  if (mode === "year") {
    const back = (d: string) => `${Number(d.slice(0, 4)) - 1}${d.slice(4)}`.replace(/-02-29$/, "-02-28");
    return { from: back(r.from), to: back(r.to) };
  }
  const to = addDay(r.from, -1);
  return { from: addDay(to, -(daysIn(r) - 1)), to };
}

// ─────────────── Filters ───────────────

export type FilterOp = "contains" | "equals" | "notContains" | "notEquals" | "includingRegex" | "excludingRegex";
export const OP_LABEL: Record<FilterOp, string> = { contains: "contains", equals: "is", notContains: "doesn't contain", notEquals: "isn't", includingRegex: "matches regex", excludingRegex: "doesn't match regex" };
const TEXT_OPS: FilterOp[] = ["contains", "equals", "notContains", "notEquals", "includingRegex", "excludingRegex"];
const PICK_OPS: FilterOp[] = ["equals", "notEquals"];

export type GscDim = "query" | "page" | "country" | "device" | "searchAppearance";
export type Ga4Dim = "channel" | "sourceMedium" | "landingPage" | "country" | "device" | "event";
export type Filter<D extends string = string> = { dim: D; op: FilterOp; value: string };

export const GSC_DIMS: { id: GscDim; label: string; ops: FilterOp[] }[] = [
  { id: "query", label: "Query", ops: TEXT_OPS },
  { id: "page", label: "Page", ops: TEXT_OPS },
  { id: "country", label: "Country", ops: PICK_OPS },
  { id: "device", label: "Device", ops: PICK_OPS },
  { id: "searchAppearance", label: "Search appearance", ops: PICK_OPS },
];
export const GA4_DIMS: { id: Ga4Dim; label: string; ops: FilterOp[] }[] = [
  { id: "channel", label: "Channel", ops: PICK_OPS },
  { id: "sourceMedium", label: "Source / medium", ops: TEXT_OPS.slice(0, 4) },
  { id: "landingPage", label: "Landing page", ops: TEXT_OPS },
  { id: "country", label: "Country", ops: PICK_OPS },
  { id: "device", label: "Device", ops: PICK_OPS },
  { id: "event", label: "Event", ops: TEXT_OPS.slice(0, 4) },
];

/** Filters from a request body, kept to the dimensions and operators each report allows. */
export function readFilters<D extends string>(raw: unknown, dims: { id: D; ops: FilterOp[] }[]): Filter<D>[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(0, 10)
    .map((f) => (f && typeof f === "object" ? (f as Record<string, unknown>) : {}))
    .flatMap((f) => {
      const d = dims.find((x) => x.id === f.dim);
      const op = String(f.op) as FilterOp;
      const value = String(f.value ?? "").trim().slice(0, 200);
      return d && d.ops.includes(op) && value ? [{ dim: d.id, op, value }] : [];
    });
}

/** A date range from a request body, or null when it is missing or odd. At most 16 months, never after today. */
export function readRange(raw: unknown, today: string): DateRange | null {
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const from = String(r.from ?? "");
  const to = String(r.to ?? "");
  if (!ISO.test(from) || !ISO.test(to) || from > to || to > today) return null;
  return daysIn({ from, to }) <= 500 ? { from, to } : null;
}

// ─────────────── Search Console ───────────────

export type GscType = "web" | "image" | "video" | "news" | "discover" | "googleNews";
export const GSC_TYPES: { id: GscType; label: string }[] = [
  { id: "web", label: "Web" },
  { id: "image", label: "Image" },
  { id: "video", label: "Video" },
  { id: "news", label: "News" },
  { id: "discover", label: "Discover" },
  { id: "googleNews", label: "Google News" },
];
/** Discover and Google News have no queries, positions or search appearance in the API. */
export const gscHasQueries = (t: GscType) => t !== "discover" && t !== "googleNews";

// Search Console names countries by ISO 3166 three-letter codes, in lower case. Two-letter codes give the names.
const A3 =
  "AFG:AF ALA:AX ALB:AL DZA:DZ ASM:AS AND:AD AGO:AO AIA:AI ATA:AQ ATG:AG ARG:AR ARM:AM ABW:AW AUS:AU AUT:AT AZE:AZ BHS:BS BHR:BH BGD:BD BRB:BB BLR:BY BEL:BE BLZ:BZ BEN:BJ BMU:BM BTN:BT BOL:BO BES:BQ BIH:BA BWA:BW BVT:BV BRA:BR IOT:IO BRN:BN BGR:BG BFA:BF BDI:BI CPV:CV KHM:KH CMR:CM CAN:CA CYM:KY CAF:CF TCD:TD CHL:CL CHN:CN CXR:CX CCK:CC COL:CO COM:KM COG:CG COD:CD COK:CK CRI:CR CIV:CI HRV:HR CUB:CU CUW:CW CYP:CY CZE:CZ DNK:DK DJI:DJ DMA:DM DOM:DO ECU:EC EGY:EG SLV:SV GNQ:GQ ERI:ER EST:EE SWZ:SZ ETH:ET FLK:FK FRO:FO FJI:FJ FIN:FI FRA:FR GUF:GF PYF:PF ATF:TF GAB:GA GMB:GM GEO:GE DEU:DE GHA:GH GIB:GI GRC:GR GRL:GL GRD:GD GLP:GP GUM:GU GTM:GT GGY:GG GIN:GN GNB:GW GUY:GY HTI:HT HMD:HM VAT:VA HND:HN HKG:HK HUN:HU ISL:IS IND:IN IDN:ID IRN:IR IRQ:IQ IRL:IE IMN:IM ISR:IL ITA:IT JAM:JM JPN:JP JEY:JE JOR:JO KAZ:KZ KEN:KE KIR:KI PRK:KP KOR:KR KWT:KW KGZ:KG LAO:LA LVA:LV LBN:LB LSO:LS LBR:LR LBY:LY LIE:LI LTU:LT LUX:LU MAC:MO MDG:MG MWI:MW MYS:MY MDV:MV MLI:ML MLT:MT MHL:MH MTQ:MQ MRT:MR MUS:MU MYT:YT MEX:MX FSM:FM MDA:MD MCO:MC MNG:MN MNE:ME MSR:MS MAR:MA MOZ:MZ MMR:MM NAM:NA NRU:NR NPL:NP NLD:NL NCL:NC NZL:NZ NIC:NI NER:NE NGA:NG NIU:NU NFK:NF MKD:MK MNP:MP NOR:NO OMN:OM PAK:PK PLW:PW PSE:PS PAN:PA PNG:PG PRY:PY PER:PE PHL:PH PCN:PN POL:PL PRT:PT PRI:PR QAT:QA REU:RE ROU:RO RUS:RU RWA:RW BLM:BL SHN:SH KNA:KN LCA:LC MAF:MF SPM:PM VCT:VC WSM:WS SMR:SM STP:ST SAU:SA SEN:SN SRB:RS SYC:SC SLE:SL SGP:SG SXM:SX SVK:SK SVN:SI SLB:SB SOM:SO ZAF:ZA SGS:GS SSD:SS ESP:ES LKA:LK SDN:SD SUR:SR SJM:SJ SWE:SE CHE:CH SYR:SY TWN:TW TJK:TJ TZA:TZ THA:TH TLS:TL TGO:TG TKL:TK TON:TO TTO:TT TUN:TN TUR:TR TKM:TM TCA:TC TUV:TV UGA:UG UKR:UA ARE:AE GBR:GB USA:US UMI:UM URY:UY UZB:UZ VUT:VU VEN:VE VNM:VN VGB:VG VIR:VI WLF:WF ESH:EH YEM:YE ZMB:ZM ZWE:ZW XKK:XK";
const TWO = new Map(A3.split(" ").map((p) => p.split(":") as [string, string]));
const regionNames = (() => {
  try {
    return new Intl.DisplayNames(["en"], { type: "region" });
  } catch {
    return null;
  }
})();

/** "usa" → "United States". Unknown codes ("zzz") come back in capitals. */
export function countryName(code: string): string {
  const two = TWO.get(code.toUpperCase());
  if (!two) return code === "zzz" ? "Unknown region" : code.toUpperCase();
  try {
    return regionNames?.of(two) ?? code.toUpperCase();
  } catch {
    return code.toUpperCase();
  }
}

/** What someone typed for a country ("United States", "us" or "usa") as Search Console's code, or null. */
export function countryCode(text: string): string | null {
  const t = text.trim().toLowerCase();
  if (!t) return null;
  for (const [three, two] of TWO) if (t === three.toLowerCase() || t === two.toLowerCase() || countryName(three.toLowerCase()).toLowerCase() === t) return three.toLowerCase();
  return null;
}

/** Search Console's own words in plain case: "DESKTOP" → "Desktop", "FAQ_RICH_RESULT" → "Faq rich result". */
export const plainWords = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase().replace(/_/g, " ") : s);

/** One filter's value the way Search Console reads it: country codes, device names in capitals. */
function gscExpression(f: Filter<GscDim>) {
  if (f.dim === "country") return countryCode(f.value) ?? f.value.toLowerCase();
  if (f.dim === "device" || f.dim === "searchAppearance") return f.value.toUpperCase().replace(/\s+/g, "_");
  return f.value;
}

/** The filters as Search Console's dimensionFilterGroups: all of them must match. */
export function gscFilterGroups(filters: Filter<GscDim>[]) {
  if (!filters.length) return undefined;
  return [{ groupType: "and", filters: filters.map((f) => ({ dimension: f.dim, operator: f.op, expression: gscExpression(f) })) }];
}

export type GscQueryBody = {
  startDate: string;
  endDate: string;
  dimensions: string[];
  type: GscType;
  dimensionFilterGroups?: { groupType: string; filters: { dimension: string; operator: string; expression: string }[] }[];
  rowLimit?: number;
  startRow?: number;
  dataState?: "all" | "final" | "hourly_all";
};

/** One searchAnalytics.query body. Fresh data is included (dataState "all"); by hour uses "hourly_all". */
export function gscBody(o: { range: DateRange; type: GscType; filters: Filter<GscDim>[]; dims: string[]; rowLimit?: number }): GscQueryBody {
  const hourly = o.dims.includes("hour");
  const groups = gscFilterGroups(o.filters);
  return {
    startDate: o.range.from,
    endDate: o.range.to,
    dimensions: o.dims,
    type: o.type,
    ...(groups ? { dimensionFilterGroups: groups } : {}),
    ...(o.rowLimit ? { rowLimit: o.rowLimit } : {}),
    dataState: hourly ? "hourly_all" : "all",
  };
}

// ─────────────── Google Analytics 4 ───────────────

/** Every host that sends visitors from an AI assistant, with and without "www.". */
export const AI_HOSTS = [...new Set(Object.values(AI_SOURCES).flat().flatMap((d) => [d, d.replace(/^www\./, "")]))];
export const AI_CHANNEL = "AI assistants";

const GA4_FIELD: Record<Ga4Dim, string> = { channel: "sessionDefaultChannelGroup", sourceMedium: "sessionSourceMedium", landingPage: "landingPage", country: "country", device: "deviceCategory", event: "eventName" };
const MATCH: Record<FilterOp, string> = { contains: "CONTAINS", notContains: "CONTAINS", equals: "EXACT", notEquals: "EXACT", includingRegex: "PARTIAL_REGEXP", excludingRegex: "PARTIAL_REGEXP" };
const negated = (op: FilterOp) => op === "notContains" || op === "notEquals" || op === "excludingRegex";
const aiExpression = { filter: { fieldName: "sessionSource", inListFilter: { values: AI_HOSTS, caseSensitive: false } } };

function ga4Expression(f: Filter<Ga4Dim>): unknown {
  const not = (e: unknown) => ({ notExpression: e });
  // "AI assistants" is Arrowsterr's channel: sessions from the AI hosts, wherever GA4 put them.
  if (f.dim === "channel" && f.value.toLowerCase() === AI_CHANNEL.toLowerCase()) return negated(f.op) ? not(aiExpression) : aiExpression;
  const base = { filter: { fieldName: GA4_FIELD[f.dim], stringFilter: { matchType: MATCH[f.op], value: f.value, caseSensitive: false } } };
  // Referral without the AI visits, as the Traffic sources table shows it.
  if (f.dim === "channel" && f.op === "equals" && f.value.toLowerCase() === "referral") return { andGroup: { expressions: [base, not(aiExpression)] } };
  return negated(f.op) ? not(base) : base;
}

/** The filters as one GA4 dimensionFilter: all of them must match. */
export function ga4Filter(filters: Filter<Ga4Dim>[]): unknown {
  if (!filters.length) return undefined;
  const list = filters.map(ga4Expression);
  return list.length === 1 ? list[0] : { andGroup: { expressions: list } };
}

export type Ga4Request = { dateRanges: { startDate: string; endDate: string; name?: string }[]; dimensions?: { name: string }[]; metrics: { name: string }[]; dimensionFilter?: unknown; orderBys?: unknown[]; limit?: number };

/** The numbers every GA4 table adds up. Rates come from these, so weeks and channels can be summed. */
export type Ga4Sums = { users: number; sessions: number; engaged: number; duration: number; active: number; keyEvents: number };
export const NO_SUMS: Ga4Sums = { users: 0, sessions: 0, engaged: 0, duration: 0, active: 0, keyEvents: 0 };
/** Metric names in Ga4Sums order. Properties made before 2024 call key events "conversions". */
export const ga4Metrics = (keyMetric = "keyEvents") => ["totalUsers", "sessions", "engagedSessions", "userEngagementDuration", "activeUsers", keyMetric].map((name) => ({ name }));
export const sumsOf = (m: number[]): Ga4Sums => ({ users: m[0] ?? 0, sessions: m[1] ?? 0, engaged: m[2] ?? 0, duration: m[3] ?? 0, active: m[4] ?? 0, keyEvents: m[5] ?? 0 });
export const addSums = (a: Ga4Sums, b: Ga4Sums): Ga4Sums => ({ users: a.users + b.users, sessions: a.sessions + b.sessions, engaged: a.engaged + b.engaged, duration: a.duration + b.duration, active: a.active + b.active, keyEvents: a.keyEvents + b.keyEvents });
const less = (a: Ga4Sums, b: Ga4Sums): Ga4Sums => ({ users: Math.max(0, a.users - b.users), sessions: Math.max(0, a.sessions - b.sessions), engaged: Math.max(0, a.engaged - b.engaged), duration: Math.max(0, a.duration - b.duration), active: Math.max(0, a.active - b.active), keyEvents: Math.max(0, a.keyEvents - b.keyEvents) });
/** Engagement rate, average engagement time (seconds per active user) and key events per session. Null with no sessions. */
export const engagementRate = (s: Ga4Sums) => (s.sessions ? s.engaged / s.sessions : null);
export const avgTime = (s: Ga4Sums) => (s.active ? s.duration / s.active : null);
export const convRate = (s: Ga4Sums) => (s.sessions ? s.keyEvents / s.sessions : null);

/** The GA4 report's requests, in this order. With two date ranges, GA4 adds the range name as the last dimension. */
export const GA4_PARTS = ["totals", "series", "channels", "ai", "sourceMedium", "campaigns", "landing", "pages", "events", "countries", "devices"] as const;
export type Ga4Part = (typeof GA4_PARTS)[number];

export function ga4Requests(o: { range: DateRange; prev: DateRange | null; filters: Filter<Ga4Dim>[]; hourly: boolean; keyMetric?: string }): Ga4Request[] {
  const cur = { startDate: o.range.from, endDate: o.range.to, name: "cur" };
  const both = o.prev ? [cur, { startDate: o.prev.from, endDate: o.prev.to, name: "prev" }] : [cur];
  const metrics = ga4Metrics(o.keyMetric);
  const dimensionFilter = ga4Filter(o.filters);
  const aiOnly = dimensionFilter ? { andGroup: { expressions: [dimensionFilter, aiExpression] } } : aiExpression;
  const by = (dims: string[], limit: number, extra: Partial<Ga4Request> = {}): Ga4Request => ({
    dateRanges: [cur],
    dimensions: dims.map((name) => ({ name })),
    metrics,
    ...(dimensionFilter ? { dimensionFilter } : {}),
    orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
    limit,
    ...extra,
  });
  const parts: Record<Ga4Part, Ga4Request> = {
    totals: { dateRanges: both, metrics, ...(dimensionFilter ? { dimensionFilter } : {}) },
    series: { ...by([o.hourly ? "dateHour" : "date"], 1000), orderBys: undefined },
    channels: by(["sessionDefaultChannelGroup"], 50),
    ai: by(["sessionSource", "sessionDefaultChannelGroup"], 200, { dimensionFilter: aiOnly }),
    sourceMedium: by(["sessionSourceMedium"], 1000),
    campaigns: by(["sessionCampaignName"], 1000),
    landing: by(["landingPage"], 1000),
    pages: { ...by(["pagePath"], 1000), metrics: ["screenPageViews", "totalUsers", "userEngagementDuration", "activeUsers", o.keyMetric ?? "keyEvents"].map((name) => ({ name })), orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }] },
    events: { dateRanges: both, dimensions: [{ name: "eventName" }], metrics: [{ name: o.keyMetric ?? "keyEvents" }], ...(dimensionFilter ? { dimensionFilter } : {}), limit: 200 },
    countries: by(["country"], 300),
    devices: by(["deviceCategory"], 20),
  };
  return GA4_PARTS.map((k) => {
    const r = parts[k];
    if (!r.orderBys) delete r.orderBys;
    return r;
  });
}

// ─────────────── The AI assistants channel ───────────────

export type ChannelRow = { key: string; sums: Ga4Sums; logo?: string; children?: { key: string; sums: Ga4Sums }[] };

/**
 * Sessions by channel with AI assistants as its own channel. GA4 files visits from chatgpt.com and the rest under
 * Referral (or wherever its rules put them), so each AI host's numbers move out of the channel GA4 gave them into
 * "AI assistants", which opens to one row per assistant. Biggest first.
 */
export function trafficChannels(channels: { channel: string; sums: Ga4Sums }[], ai: { source: string; channel: string; sums: Ga4Sums }[]): ChannelRow[] {
  const by = new Map<string, Ga4Sums>();
  for (const c of channels) by.set(c.channel || "Unassigned", addSums(by.get(c.channel || "Unassigned") ?? NO_SUMS, c.sums));
  const assistants = new Map<string, Ga4Sums>();
  for (const r of ai) {
    const name = aiSourceOf(r.source);
    if (!name) continue;
    assistants.set(name, addSums(assistants.get(name) ?? NO_SUMS, r.sums));
    const from = r.channel || "Unassigned";
    if (by.has(from)) by.set(from, less(by.get(from)!, r.sums));
  }
  const rows: ChannelRow[] = [...by.entries()].filter(([, s]) => s.sessions > 0).map(([key, sums]) => ({ key, sums }));
  if (assistants.size) {
    const children = [...assistants.entries()].map(([key, sums]) => ({ key, sums })).sort((a, b) => b.sums.sessions - a.sums.sessions);
    rows.push({ key: AI_CHANNEL, sums: children.reduce((a, c) => addSums(a, c.sums), NO_SUMS), children });
  }
  return rows.sort((a, b) => b.sums.sessions - a.sums.sessions);
}

// ─────────────── Joining the two by page ───────────────

/** A page's key for joining Search Console URLs with GA4 paths: "https://www.a.com/Blog/?x=1" and "/blog" match. */
export const pathKey = pagePath;

/** Rows added up by page path, so http, https, www and trailing-slash versions of one page count once. */
export function byPath<T>(rows: T[], path: (r: T) => string, add: (a: T, b: T) => T): Map<string, T> {
  const out = new Map<string, T>();
  for (const r of rows) {
    const k = pathKey(path(r));
    const had = out.get(k);
    out.set(k, had ? add(had, r) : r);
  }
  return out;
}

/** Search Console numbers for one page path: clicks and impressions add, position is weighted by impressions. */
export type PageSearch = { path: string; clicks: number; impressions: number; position: number | null };
export function addSearch(a: PageSearch, b: PageSearch): PageSearch {
  const impressions = a.impressions + b.impressions;
  const w = (x: PageSearch) => (x.position ?? 0) * x.impressions;
  const placed = (a.position === null ? 0 : a.impressions) + (b.position === null ? 0 : b.impressions);
  return { path: a.path, clicks: a.clicks + b.clicks, impressions, position: placed ? (w(a) + w(b)) / placed : null };
}

/** GA4 numbers for one page path. */
export type PageVisits = { path: string; sessions: number; keyEvents: number };
export const addVisits = (a: PageVisits, b: PageVisits): PageVisits => ({ path: a.path, sessions: a.sessions + b.sessions, keyEvents: a.keyEvents + b.keyEvents });

// ─────────────── Weeks ───────────────

/** Days folded into weeks of 7 from the first day, oldest first. `add` sums two points; the key is the week's first day. */
export function weekly<T extends { key: string }>(points: T[], add: (a: T, b: T) => T): T[] {
  const out: T[] = [];
  points.forEach((p, i) => {
    if (i % 7 === 0) out.push({ ...p });
    else out[out.length - 1] = { ...add(out[out.length - 1], p), key: out[out.length - 1].key };
  });
  return out;
}

// ─────────────── CSV ───────────────

/** Rows as CSV text. Cells with commas, quotes or line breaks are quoted; empty cells stay empty. */
export function toCsv(rows: (string | number | null | undefined)[][]): string {
  const cell = (v: string | number | null | undefined) => {
    if (v === null || v === undefined) return "";
    const s = String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return rows.map((r) => r.map(cell).join(",")).join("\n");
}
