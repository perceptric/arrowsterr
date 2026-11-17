// Brand presence: where AI tools get facts about a brand. Wikipedia and Wikidata (free),
// Trustpilot and Google Business Profile (DataForSEO). This file only matches and reads results.
// Pure, so the browser, the server and tests can all use it.

export type Status = "found" | "missing" | "checking" | "unchecked" | "error";

export type WikiFacts = { website: string | null; founded: string | null; hq: string | null; industry: string[] };
export type WikiPresence = {
  status: Status;
  /** How the item was matched: its official website matches the brand's site, or only its name does. */
  match?: "website" | "name";
  wikidata?: { id: string; url: string; label: string; description: string | null } | null;
  article?: { title: string; url: string; lang: string; lastEdit: string | null; views30: number | null } | null;
  /** Wikipedia language codes with an article, like "en" and "de". */
  languages?: string[];
  facts?: WikiFacts | null;
  note?: string;
};
export type Review = { rating: number | null; title: string | null; text: string; date: string | null; url: string | null };
export type TrustpilotPresence = { status: Status; rating?: number | null; reviews?: number | null; url?: string | null; recent?: Review[]; note?: string; checkedAt?: string };
export type GbpPresence = {
  status: Status;
  title?: string | null;
  rating?: number | null;
  reviews?: number | null;
  category?: string | null;
  address?: string | null;
  claimed?: boolean | null;
  url?: string | null;
  note?: string;
  checkedAt?: string;
};
/** A brand to look up. domain is a bare host, or null when no site is known. */
export type Who = { name: string; domain: string | null; you?: boolean };
export type BrandPresence = { name: string; domain: string | null; you?: boolean; wiki: WikiPresence; trustpilot: TrustpilotPresence; gbp: GbpPresence };

/** What each source is, and the tip shown when the brand is missing there. */
export const SOURCES = {
  wiki: { label: "Wikipedia", tip: "No Wikipedia article. AI tools often cite Wikipedia for company facts." },
  wikidata: { label: "Wikidata", tip: "No Wikidata item. Many AI tools read Wikidata for basic facts like founding year and website." },
  trustpilot: { label: "Trustpilot", tip: "No Trustpilot page. AI answers about trust and service often quote review sites." },
  gbp: { label: "Google Business Profile", tip: "No Google Business Profile found for this site. Google's AI reads it for your rating and address." },
} as const;

/** A host without protocol, www, port or path, in lower case. "" when there is none. */
export function bareHost(input: string | null | undefined): string {
  const s = String(input ?? "").trim().toLowerCase();
  if (!s) return "";
  return s
    .replace(/^[a-z][a-z0-9+.-]*:\/\//, "")
    .replace(/[/?#].*$/, "")
    .replace(/:\d+$/, "")
    .replace(/^www\d?\./, "")
    .replace(/\.$/, "");
}

/** A bare host that looks like a real domain, or "". */
export function cleanHost(input: string | null | undefined): string {
  const h = bareHost(input);
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(h) && h.length <= 200 ? h : "";
}

/** The ways Wikidata writes an official website, for an exact-match search. */
export const siteVariants = (host: string) => ["https://", "http://"].flatMap((p) => ["", "www."].flatMap((w) => [`${p}${w}${host}`, `${p}${w}${host}/`]));

/** The same site: equal hosts, or one is a subdomain of the other (blog.acme.com and acme.com). */
export function sameSite(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = bareHost(a);
  const y = bareHost(b);
  if (!x || !y) return false;
  return x === y || x.endsWith(`.${y}`) || y.endsWith(`.${x}`);
}

const SUFFIX = /\b(inc|incorporated|llc|ltd|limited|corp|corporation|co|company|gmbh|ag|sa|plc|bv|oy|ab|pty|srl|spa|the)\b/g;

/** A name for comparing: lower case, no accents, no company suffixes, only letters and digits. */
export function normName(name: string | null | undefined): string {
  return String(name ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(SUFFIX, " ")
    .replace(/\s+/g, "");
}

/** True when a label names the brand. "HubSpot, Inc." and "Hubspot" match "HubSpot". The domain's first part counts too. */
export function nameMatches(label: string | null | undefined, brand: { name: string; domain?: string | null }): boolean {
  const l = normName(label);
  if (!l) return false;
  if (l === normName(brand.name)) return true;
  const stem = bareHost(brand.domain).split(".")[0];
  return Boolean(stem && stem.length >= 4 && l === normName(stem));
}

// The parts of a Wikidata item this feature reads.
type Snak = { datavalue?: { value?: unknown } };
type Claim = { mainsnak?: Snak; rank?: string };
type Text = { value?: string };
export type WdEntity = {
  id: string;
  labels?: Record<string, Text>;
  descriptions?: Record<string, Text>;
  aliases?: Record<string, Text[]>;
  claims?: Record<string, Claim[]>;
  sitelinks?: Record<string, { site?: string; title?: string }>;
  missing?: string;
};

/** A property's values, best rank first, without deprecated ones. */
export function claimValues(e: WdEntity, prop: string): unknown[] {
  const list = (e.claims?.[prop] ?? []).filter((c) => c.rank !== "deprecated" && c.mainsnak?.datavalue);
  const order = (c: Claim) => (c.rank === "preferred" ? 0 : 1);
  return [...list].sort((a, b) => order(a) - order(b)).map((c) => c.mainsnak!.datavalue!.value);
}

const idOf = (v: unknown) => (v && typeof v === "object" && typeof (v as { id?: unknown }).id === "string" ? (v as { id: string }).id : null);
const textOf = (m: Record<string, Text> | undefined, lang: string) => m?.[lang]?.value ?? m?.en?.value ?? Object.values(m ?? {})[0]?.value ?? null;

/** The item's label in a language, falling back to English or any. */
export const labelOf = (e: WdEntity, lang = "en") => textOf(e.labels, lang);
export const descriptionOf = (e: WdEntity, lang = "en") => textOf(e.descriptions, lang);

/** Official websites (P856) as plain strings. */
export const websitesOf = (e: WdEntity) => claimValues(e, "P856").filter((v): v is string => typeof v === "string");

// Sitelinks that end in "wiki" but are not a Wikipedia.
const NOT_WIKIPEDIA = new Set(["commonswiki", "specieswiki", "metawiki", "mediawikiwiki", "wikidatawiki", "sourceswiki", "wikifunctionswiki", "wikimaniawiki", "incubatorwiki", "outreachwiki", "foundationwiki", "testwiki", "test2wiki", "testwikidatawiki", "strategywiki", "donatewiki", "votewiki", "loginwiki", "abstractwiki"]);

/** Wikipedia language codes this item has an article in, English first. "zh_yue" becomes "zh-yue". */
export function wikiLanguages(sitelinks: WdEntity["sitelinks"]): string[] {
  const codes = Object.keys(sitelinks ?? {})
    .filter((k) => /^[a-z_]+wiki$/.test(k) && !NOT_WIKIPEDIA.has(k))
    .map((k) => k.slice(0, -4).replace(/_/g, "-"));
  return codes.sort((a, b) => (a === "en" ? -1 : b === "en" ? 1 : a.localeCompare(b)));
}

/** The article to read: the market's language, then English, then the first one. */
export function pickArticle(sitelinks: WdEntity["sitelinks"], lang = "en"): { lang: string; title: string } | null {
  const langs = wikiLanguages(sitelinks);
  const pick = [lang, "en"].find((l) => langs.includes(l)) ?? langs[0];
  if (!pick) return null;
  const title = sitelinks?.[`${pick.replace(/-/g, "_")}wiki`]?.title;
  return title ? { lang: pick, title } : null;
}

// Words in a Wikidata description that say the item is a business or brand, for name-only matches.
const ORG = /\b(company|companies|business|brand|software|startup|start-up|corporation|firm|manufacturer|retailer|retail|platform|service|provider|agency|bank|app|application|website|organi[sz]ation|maker|developer|publisher|chain|store|marketplace|producer|label|enterprise|group|subsidiary|conglomerate|operator|airline|restaurant|consultancy)\b/i;
const NOT_ORG = /\b(given name|family name|surname|disambiguation|village|river|mountain|species|genus|asteroid|album|song|single by|film|novel|episode|painting|human settlement|commune|municipality|census)\b/i;

/**
 * The item that is this brand, from search candidates. A match on the official website wins. Without one,
 * a candidate named exactly like the brand counts only if it has no website of its own (a website that
 * points elsewhere means another organization) and its description reads like a business.
 */
export function pickWikidata(candidates: WdEntity[], brand: { name: string; domain?: string | null }, lang = "en"): { entity: WdEntity; match: "website" | "name" } | null {
  const live = candidates.filter((e) => e && e.id && !("missing" in e));
  const names = (e: WdEntity) => [labelOf(e, lang), labelOf(e, "en"), ...Object.values(e.aliases ?? {}).flat().map((a) => a.value ?? "")];
  const named = (e: WdEntity) => names(e).some((n) => nameMatches(n, brand));
  const orgLike = (e: WdEntity) => {
    const d = `${descriptionOf(e, lang) ?? ""} ${descriptionOf(e, "en") ?? ""}`;
    return ORG.test(d) && !NOT_ORG.test(d);
  };
  if (brand.domain) {
    const bySite = live.filter((e) => websitesOf(e).some((w) => sameSite(w, brand.domain)));
    // A founder or product can list the company's site too, so prefer the one named like the brand.
    const best = bySite.find(named) ?? bySite.find(orgLike) ?? bySite.find((e) => wikiLanguages(e.sitelinks).length) ?? bySite[0];
    if (best) return { entity: best, match: "website" };
  }
  const byName = live.find((e) => named(e) && !websitesOf(e).length && orgLike(e));
  return byName ? { entity: byName, match: "name" } : null;
}

/** A Wikidata time as a year, or year and month when that precise. "+2006-00-00T00:00:00Z" is "2006". */
export function wikiDate(v: unknown): string | null {
  if (!v || typeof v !== "object") return null;
  const { time, precision } = v as { time?: string; precision?: number };
  const m = /^([+-])0*(\d{1,})-(\d{2})-(\d{2})/.exec(time ?? "");
  if (!m || m[1] === "-") return null;
  if ((precision ?? 9) >= 11 && m[3] !== "00" && m[4] !== "00") return `${m[2]}-${m[3]}-${m[4]}`;
  if ((precision ?? 9) >= 10 && m[3] !== "00") return `${m[2]}-${m[3]}`;
  return m[2];
}

/** Item ids the facts need labels for: headquarters and industry. */
export function factIds(e: WdEntity): string[] {
  return [...claimValues(e, "P159").slice(0, 1), ...claimValues(e, "P452").slice(0, 3)].map(idOf).filter((x): x is string => Boolean(x));
}

/** Key facts from the item, with labels for the linked items when known. */
export function wikiFacts(e: WdEntity, labels: Record<string, string> = {}): WikiFacts {
  const hqId = idOf(claimValues(e, "P159")[0]);
  return {
    website: websitesOf(e)[0] ?? null,
    founded: wikiDate(claimValues(e, "P571")[0]),
    hq: hqId ? (labels[hqId] ?? null) : null,
    industry: claimValues(e, "P452").slice(0, 3).map(idOf).map((id) => (id ? labels[id] : null)).filter((x): x is string => Boolean(x)),
  };
}

/** Total views from a Wikimedia per-article pageviews response. */
export function sumViews(json: unknown): number | null {
  const items = (json as { items?: { views?: unknown }[] } | null)?.items;
  if (!Array.isArray(items)) return null;
  return items.reduce((n, i) => n + (Number(i?.views) || 0), 0);
}

/** The newest revision's time from an action API query (formatversion=2). */
export function lastEditOf(json: unknown): string | null {
  const page = (json as { query?: { pages?: { missing?: boolean; revisions?: { timestamp?: string }[] }[] } } | null)?.query?.pages?.[0];
  if (!page || page.missing) return null;
  return page.revisions?.[0]?.timestamp ?? null;
}

/** YYYYMMDD for the pageviews API. */
export const ymd = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, "");

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const clip = (s: unknown, max: number) => (typeof s === "string" ? s.replace(/\s+/g, " ").trim().slice(0, max) : "");

/** A finished Trustpilot reviews task as a status, rating, count and a few recent reviews. */
export function parseTrustpilot(result: unknown, max = 3): TrustpilotPresence {
  const r = (result ?? {}) as { title?: string | null; reviews_count?: unknown; rating?: { value?: unknown } | null; check_url?: string; domain?: string; items?: unknown[] };
  const reviews = num(r.reviews_count);
  const rating = num(r.rating?.value);
  if (!r.title && reviews === null && rating === null) return { status: "missing" };
  const page = r.check_url ? r.check_url.replace(/\?.*$/, "") : r.domain ? `https://www.trustpilot.com/review/${r.domain}` : null;
  const recent: Review[] = (Array.isArray(r.items) ? r.items : [])
    .map((x) => x as { rating?: { value?: unknown }; title?: string; review_text?: string; timestamp?: string; url?: string })
    .filter((x) => x && (x.review_text || x.title))
    .slice(0, max)
    .map((x) => ({ rating: num(x.rating?.value), title: clip(x.title, 140) || null, text: clip(x.review_text, 300), date: x.timestamp ? x.timestamp.slice(0, 10) : null, url: x.url ?? null }));
  return { status: "found", rating, reviews, url: page, recent };
}

/** A finished Google Business Profile task. Found only when the profile links to the brand's site. */
export function parseGbp(result: unknown, domain: string | null): GbpPresence {
  const items = ((result ?? {}) as { items?: unknown[] }).items;
  const it = (Array.isArray(items) ? items : []).find((x) => (x as { type?: string })?.type === "google_business_info") as
    | { title?: string; domain?: string; url?: string; category?: string; address?: string; rating?: { value?: unknown; votes_count?: unknown } | null; is_claimed?: unknown; cid?: string }
    | undefined;
  if (!it) return { status: "missing" };
  if (!domain || !(sameSite(it.domain, domain) || sameSite(it.url, domain))) {
    return { status: "missing", note: it.domain || it.url ? `Google showed a profile for ${it.title ?? "another business"}, but it links to another site.` : undefined };
  }
  return {
    status: "found",
    title: it.title ?? null,
    rating: num(it.rating?.value),
    reviews: num(it.rating?.votes_count),
    category: it.category ?? null,
    address: it.address ?? null,
    claimed: typeof it.is_claimed === "boolean" ? it.is_claimed : null,
    url: it.cid ? `https://www.google.com/maps?cid=${it.cid}` : null,
  };
}

/** What to search Google for: the name, plus the head office city when Wikidata knows it. */
export const gbpKeyword = (name: string, hq: string | null | undefined) => (hq && !normName(name).includes(normName(hq)) ? `${name} ${hq}` : name).slice(0, 200);

/** A tip for each source the brand is missing from, for the MCP tool and Zippie. */
export function missingTips(p: BrandPresence): string[] {
  const out: string[] = [];
  if (p.wiki.status === "missing" || (p.wiki.status === "found" && !p.wiki.article)) out.push(SOURCES.wiki.tip);
  if (p.wiki.status === "missing") out.push(SOURCES.wikidata.tip);
  if (p.trustpilot.status === "missing") out.push(SOURCES.trustpilot.tip);
  if (p.gbp.status === "missing") out.push(SOURCES.gbp.tip);
  return out;
}

/** Up to 4 brands: the picked one first, then its competitors, without repeats or the brand's own site. */
export function presenceList(you: { name: string; domain: string }, rivals: unknown, max = 3): Who[] {
  const out: Who[] = [{ name: you.name.trim().slice(0, 120), domain: cleanHost(you.domain) || null, you: true }];
  const seen = new Set([normName(you.name), cleanHost(you.domain)].filter(Boolean));
  for (const r of Array.isArray(rivals) ? rivals : []) {
    if (out.length > max) break;
    const name = typeof r?.name === "string" ? r.name.trim().slice(0, 120) : "";
    const domain = cleanHost(typeof r?.domain === "string" ? r.domain : "") || null;
    if (!name || !normName(name) || seen.has(normName(name)) || (domain && seen.has(domain))) continue;
    seen.add(normName(name));
    if (domain) seen.add(domain);
    out.push({ name, domain });
  }
  return out;
}
