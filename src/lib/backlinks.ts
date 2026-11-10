// Backlinks screen (docs/backlinks.md): DataForSEO Backlinks answers turned into what the page shows, and the link gap.
// Pure, so the route, Zippie and the tests share one copy. Ranks use DataForSEO's 0 to 100 scale (rank_scale one_hundred).

export type BlSummary = { rank: number; backlinks: number; domains: number; nofollowDomains: number; spam: number; broken: number };
export type Week = { date: string; newDomains: number; lostDomains: number };
export type Anchor = { anchor: string; domains: number; backlinks: number; share: number };
export type LinkedPage = { url: string; domains: number; backlinks: number };
export type Overview = {
  target: string;
  summary: BlSummary | null;
  weeks: Week[];
  anchors: Anchor[];
  pages: LinkedPage[];
  /** Added later: older saved overviews don't have these. */
  profile?: BlProfile | null;
  history?: Month[];
  bands?: number[];
  listed?: number;
};
export type LinkRow = { from: string; domain: string; to: string; anchor: string; follow: boolean; type: string; firstSeen: string | null; isNew: boolean; isLost: boolean; spam: number; rank: number; pre?: string; post?: string; place?: string; attrs?: string[]; title?: string };
export type LinkKind = "all" | "new" | "lost" | "follow" | "nofollow" | "ugc" | "sponsored" | "spam";
export type GapRow = { domain: string; rank: number; rivals: string[]; aiCited: number };

export const LINK_KINDS: { id: LinkKind; label: string }[] = [
  { id: "all", label: "All" },
  { id: "new", label: "New" },
  { id: "lost", label: "Lost" },
  { id: "follow", label: "Follow" },
  { id: "nofollow", label: "Nofollow" },
  { id: "ugc", label: "UGC" },
  { id: "sponsored", label: "Sponsored" },
  { id: "spam", label: "Spam" },
];
/** Spam score above this marks a link, or a whole profile, as spam. */
export const SPAM_LINE = 60;

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : Number(v) || 0);
const str = (v: unknown) => (typeof v === "string" ? v : "");

/** A bare host: no scheme, no www, no path, lower case. */
export function bareDomain(raw: string): string {
  return raw.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/[/?#].*$/, "").replace(/\.$/, "");
}

/** The site's numbers, or null when DataForSEO knows no links to it yet. */
export function parseSummary(r: Record<string, unknown> | null | undefined): BlSummary | null {
  if (!r || !num(r.backlinks)) return null;
  return { rank: Math.round(num(r.rank)), backlinks: num(r.backlinks), domains: num(r.referring_domains), nofollowDomains: num(r.referring_domains_nofollow), spam: Math.round(num(r.backlinks_spam_score)), broken: num(r.broken_backlinks) };
}

/** New and lost linking domains per week, oldest first, the last 12 weeks. */
export function parseWeeks(items: unknown[] | null | undefined): Week[] {
  return ((items ?? []) as Record<string, unknown>[])
    .filter((i) => str(i.date))
    .map((i) => ({ date: str(i.date).slice(0, 10), newDomains: num(i.new_referring_domains), lostDomains: num(i.lost_referring_domains) }))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-12);
}

/** Anchors by linking domains, the same words in any case counted once. Share is of all linking domains. */
export function parseAnchors(items: unknown[] | null | undefined, totalDomains: number, max = 12): Anchor[] {
  const by = new Map<string, Anchor>();
  for (const i of (items ?? []) as Record<string, unknown>[]) {
    const text = str(i.anchor).replace(/\s+/g, " ").trim();
    const key = text.toLowerCase();
    const cur = by.get(key) ?? { anchor: text || "No anchor text", domains: 0, backlinks: 0, share: 0 };
    cur.domains += num(i.referring_domains);
    cur.backlinks += num(i.backlinks);
    by.set(key, cur);
  }
  return [...by.values()]
    .sort((a, b) => b.domains - a.domains || b.backlinks - a.backlinks)
    .slice(0, max)
    .map((a) => ({ ...a, share: totalDomains ? Math.min(100, Math.round((a.domains / totalDomains) * 100)) : 0 }));
}

export function parsePages(items: unknown[] | null | undefined, max = 10): LinkedPage[] {
  return ((items ?? []) as Record<string, unknown>[])
    .filter((i) => str(i.url))
    .map((i) => ({ url: str(i.url), domains: num(i.referring_domains), backlinks: num(i.backlinks) }))
    .sort((a, b) => b.domains - a.domains)
    .slice(0, max);
}

export function parseLinks(items: unknown[] | null | undefined): LinkRow[] {
  return ((items ?? []) as Record<string, unknown>[])
    .filter((i) => str(i.url_from))
    .map((i) => ({
      from: str(i.url_from),
      domain: bareDomain(str(i.domain_from) || str(i.url_from)),
      to: str(i.url_to),
      anchor: str(i.anchor).replace(/\s+/g, " ").trim().slice(0, 200),
      follow: i.dofollow !== false,
      type: str(i.item_type) || "anchor",
      firstSeen: str(i.first_seen) ? str(i.first_seen).slice(0, 10) : null,
      isNew: i.is_new === true,
      isLost: i.is_lost === true,
      spam: Math.round(num(i.backlink_spam_score)),
      rank: Math.round(num(i.domain_from_rank)),
      pre: clip(str(i.text_pre), 90, "start"),
      post: clip(str(i.text_post), 90, "end"),
      place: str(i.semantic_location),
      attrs: Array.isArray(i.attributes) ? (i.attributes as unknown[]).map(String).filter((a) => a === "ugc" || a === "sponsored" || a === "nofollow") : [],
      title: str(i.page_from_title).slice(0, 160),
    }));
}

/** The words around an anchor, cut at a word to at most n letters, from the side away from the anchor. */
function clip(text: string, n: number, keep: "start" | "end"): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= n) return t;
  if (keep === "start") {
    const cut = t.slice(t.length - n);
    return "…" + cut.slice(cut.indexOf(" ") + 1);
  }
  const cut = t.slice(0, n);
  return cut.slice(0, cut.lastIndexOf(" ")) + "…";
}

/** Extra narrowing on the Backlinks tab: only links in the article body, and anchors containing some words. */
export type LinkExtra = { article?: boolean; anchor?: string };

/** Join DataForSEO filters with "and". One filter goes as is; none gives undefined. */
export function andAll(parts: unknown[][]): unknown[] | undefined {
  const p = parts.filter((x) => x.length);
  if (!p.length) return undefined;
  if (p.length === 1) return p[0];
  return p.flatMap((x, i) => (i ? ["and", x] : [x]));
}

/** The DataForSEO backlinks/live settings for each list on the Backlinks tab. One row per linking site, strongest first. */
export function linksQuery(kind: LinkKind, now = new Date(), extra: LinkExtra = {}): Record<string, unknown> {
  const since = new Date(now.getTime() - 30 * 864e5).toISOString().slice(0, 10);
  const words = (extra.anchor ?? "").replace(/[%_]/g, " ").trim().slice(0, 60);
  const more: unknown[][] = [extra.article ? ["semantic_location", "=", "article"] : [], words ? ["anchor", "like", `%${words}%`] : []];
  const by: Record<LinkKind, { status: string; filter: unknown[]; order?: string }> = {
    all: { status: "live", filter: [] },
    lost: { status: "lost", filter: [] },
    new: { status: "live", filter: ["first_seen", ">", `${since} 00:00:00 +00:00`], order: "first_seen,desc" },
    follow: { status: "live", filter: ["dofollow", "=", true] },
    nofollow: { status: "live", filter: ["dofollow", "=", false] },
    ugc: { status: "live", filter: ["attributes", "has", "ugc"] },
    sponsored: { status: "live", filter: ["attributes", "has", "sponsored"] },
    spam: { status: "live", filter: ["backlink_spam_score", ">", SPAM_LINE], order: "backlink_spam_score,desc" },
  };
  const k = by[kind] ?? by.all;
  const filters = andAll([k.filter, ...more]);
  return { mode: "one_per_domain", order_by: [k.order ?? "domain_from_rank,desc"], rank_scale: "one_hundred", backlinks_status_type: k.status, ...(filters ? { filters } : {}) };
}

/** How often each domain was cited in the brand's AI answers. */
export function citedDomains(runs: { chats?: { sources?: { domain?: string; url?: string }[] }[] }[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const r of runs) for (const c of r.chats ?? []) for (const s of c.sources ?? []) {
    const d = bareDomain(s.domain || s.url || "");
    if (d) out.set(d, (out.get(d) ?? 0) + 1);
  }
  return out;
}

/** Each domain the brand's AI answers cited, with how often and which AI models cited it, most cited first. */
export function citedDetail(runs: { chats?: { engine?: string; sources?: { domain?: string; url?: string }[] }[] }[], max = 200): { domain: string; cites: number; engines: string[] }[] {
  const by = new Map<string, { domain: string; cites: number; engines: Set<string> }>();
  for (const r of runs) for (const c of r.chats ?? []) for (const s of c.sources ?? []) {
    const d = bareDomain(s.domain || s.url || "");
    if (!d) continue;
    const row = by.get(d) ?? { domain: d, cites: 0, engines: new Set<string>() };
    row.cites++;
    if (c.engine) row.engines.add(c.engine);
    by.set(d, row);
  }
  return [...by.values()]
    .sort((a, b) => b.cites - a.cites || a.domain.localeCompare(b.domain))
    .slice(0, max)
    .map((r) => ({ domain: r.domain, cites: r.cites, engines: [...r.engines].sort() }));
}

/** AI citations for a domain, counting its subdomains (blog.g2.com counts for g2.com) and the other way round. */
function citesFor(domain: string, cited: Map<string, number>): number {
  let n = 0;
  for (const [d, c] of cited) if (d === domain || d.endsWith(`.${domain}`) || domain.endsWith(`.${d}`)) n += c;
  return n;
}

/**
 * Sites that link to rivals but not to the brand. DataForSEO's domain_intersection is asked once per rival, with that
 * rival as target "1" and the brand in exclude_targets, so DataForSEO itself drops every site that links to the brand.
 * The linking domain is the "target" field inside "1". The brand, its subdomains and the rivals are dropped too.
 * Sites linking to more rivals come first, then sites AI cites, then the strongest.
 */
export function parseGap(perRival: { rival: string; items: unknown[] }[], own: string, cited: Map<string, number>): GapRow[] {
  const me = bareDomain(own);
  const rivalSet = new Set(perRival.map((r) => bareDomain(r.rival)));
  const by = new Map<string, GapRow>();
  for (const { rival, items } of perRival) {
    for (const i of (items ?? []) as Record<string, unknown>[]) {
      const one = ((i.domain_intersection ?? {}) as Record<string, Record<string, unknown> | null>)["1"];
      if (!one) continue;
      const domain = bareDomain(str(one.target));
      if (!domain || domain === me || domain.endsWith(`.${me}`) || rivalSet.has(domain)) continue;
      const row = by.get(domain) ?? { domain, rank: 0, rivals: [], aiCited: citesFor(domain, cited) };
      row.rank = Math.max(row.rank, Math.round(num(one.rank)));
      const r = bareDomain(rival);
      if (!row.rivals.includes(r)) row.rivals.push(r);
      by.set(domain, row);
    }
  }
  return [...by.values()].sort((a, b) => b.rivals.length - a.rivals.length || Number(b.aiCited > 0) - Number(a.aiCited > 0) || b.rank - a.rank || a.domain.localeCompare(b.domain));
}

/** Up to 3 rival domains for the gap: cleaned, without the brand, no repeats. */
export function gapRivals(list: string[], own: string, max = 3): string[] {
  const me = bareDomain(own);
  const out: string[] = [];
  for (const r of list) {
    const d = bareDomain(r);
    if (d && /\.[a-z]{2,}$/.test(d) && d !== me && !out.includes(d)) out.push(d);
    if (out.length === max) break;
  }
  return out;
}

/** Low, medium or high, from DataForSEO's 0 to 100 spam score. */
export const spamLevel = (score: number): "low" | "medium" | "high" => (score > SPAM_LINE ? "high" : score > 30 ? "medium" : "low");

/** The change since the last snapshot at least 6 days older, for the KPI arrows. Snapshots come newest first. */
export function weekAgo<T extends { day: string }>(snaps: T[], today: string): T | null {
  const cut = new Date(Date.parse(`${today}T00:00:00Z`) - 6 * 864e5).toISOString().slice(0, 10);
  return snaps.find((s) => s.day <= cut) ?? null;
}

// ---- Any site or page (not only the brand's own) ----

/** What to read links for: a whole domain with its subdomains, one subdomain, or one exact page. */
export type BlScope = "domain" | "subdomain" | "url";
export type BlTarget = { scope: BlScope; target: string; label: string; host: string; id: string };
export const BL_SCOPES: { id: BlScope; label: string; hint: string }[] = [
  { id: "domain", label: "Root domain", hint: "competitor.com" },
  { id: "subdomain", label: "Subdomain", hint: "blog.competitor.com" },
  { id: "url", label: "Exact URL", hint: "competitor.com/pricing" },
];
export const BULK_MAX = 200;

const HOST = /^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/;

/**
 * A typed site or page as a DataForSEO Backlinks target. Domains and subdomains go bare; a page goes as its full link.
 * A page needs a path; a typed path on Root domain or Subdomain is dropped. id is the cache key part, and a plain
 * domain keeps its old key so saved answers still count.
 */
export function blTarget(input: string, scope: BlScope): BlTarget | null {
  let s = input.trim();
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) s = "https://" + s;
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase().replace(/\.$/, "");
  if (!HOST.test(host)) return null;
  if (scope === "domain") {
    const d = host.replace(/^www\./, "");
    return { scope, target: d, label: d, host: d, id: d };
  }
  if (scope === "subdomain") return { scope, target: host, label: host, host, id: `sub:${host}` };
  const path = u.pathname === "/" ? "" : u.pathname;
  if (!path && !u.search) return null;
  const target = `https://${host}${path}${u.search}`;
  return { scope, target, label: `${host}${path}${u.search}`, host, id: `url:${target}` };
}

/** The scope a typed address most likely means. A folder counts as its exact page. */
export function guessScope(input: string, guess: (s: string) => string | null): BlScope | null {
  const g = guess(input);
  if (!g) return null;
  return g === "subfolder" || g === "url" ? "url" : (g as BlScope);
}

/** Pasted sites or pages, one per line or comma, as targets: cleaned, duplicates dropped, in order. */
export function bulkTargets(text: string | string[]): { targets: BlTarget[]; skipped: number } {
  const lines = (Array.isArray(text) ? text : text.split(/[\n,]+/)).map((x) => x.trim()).filter(Boolean);
  const seen = new Map<string, BlTarget>();
  let skipped = 0;
  for (const l of lines) {
    const t = blTarget(l, "url") ?? blTarget(l, "domain");
    if (!t) skipped++;
    else if (!seen.has(t.target)) seen.set(t.target, t);
  }
  return { targets: [...seen.values()], skipped };
}

export type BulkRow = { target: string; rank: number; backlinks: number; domains: number; nofollowDomains: number; spam: number | null };

/** DataForSEO's four bulk answers joined by target, in the order asked, biggest link profile first. */
export function parseBulk(targets: string[], parts: { ranks?: unknown[]; backlinks?: unknown[]; domains?: unknown[]; spam?: unknown[] | null }): BulkRow[] {
  const by = (items: unknown[] | null | undefined) => {
    const m = new Map<string, Record<string, unknown>>();
    for (const it of (items ?? []) as Record<string, unknown>[]) if (it && typeof it.target === "string") m.set(norm(it.target), it);
    return m;
  };
  const norm = (t: string) => t.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, "");
  const ranks = by(parts.ranks);
  const links = by(parts.backlinks);
  const doms = by(parts.domains);
  const spam = parts.spam ? by(parts.spam) : null;
  return targets
    .map((t) => {
      const k = norm(t);
      const sp = spam?.get(k);
      return {
        target: t,
        rank: Math.round(num(ranks.get(k)?.rank)),
        backlinks: num(links.get(k)?.backlinks),
        domains: num(doms.get(k)?.referring_domains),
        nofollowDomains: num(doms.get(k)?.referring_domains_nofollow),
        spam: sp ? Math.round(num(sp.spam_score)) : null,
      };
    })
    .sort((a, b) => b.domains - a.domains || b.rank - a.rank);
}


// ---- Overview profile, history and linking sites ----

export type Slice = { key: string; label: string; value: number };
export type BlProfile = { ips: number; subnets: number; followLinks: number; nofollowLinks: number; ugc: number; sponsored: number; tlds: Slice[]; types: Slice[]; platforms: Slice[]; places: Slice[]; countries: Slice[] };
export type Month = { date: string; domains: number; backlinks: number; rank: number };
export type RefDomain = { domain: string; rank: number; backlinks: number; firstSeen: string | null; spam: number; follow: boolean; nofollowShare: number };

const TYPE_LABEL: Record<string, string> = { anchor: "Text", image: "Image", redirect: "Redirect", canonical: "Canonical", link: "Link tag", meta: "Meta", alternate: "Alternate" };
const PLATFORM_LABEL: Record<string, string> = { blogs: "Blogs", cms: "CMS sites", news: "News", "message-boards": "Forums", ecommerce: "Ecommerce", wikis: "Wikis", organization: "Organizations" };
const PLACE_LABEL: Record<string, string> = { article: "In the article", main: "Main content", section: "Page sections", summary: "Summaries", aside: "Sidebar", footer: "Footer", header: "Header", nav: "Menus" };

/** A count map from DataForSEO as sorted slices. Unknown keys keep their own name; zero and dropped keys go. */
export function slices(obj: unknown, label: (k: string) => string | null, max = 8): Slice[] {
  if (!obj || typeof obj !== "object") return [];
  return Object.entries(obj as Record<string, unknown>)
    .map(([key, v]) => ({ key, label: label(key), value: num(v) }))
    .filter((x): x is Slice => Boolean(x.label) && x.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, max);
}

/** Where the links come from and what they are, from the summary answer (asked with internal_list_limit). */
export function parseProfile(r: Record<string, unknown> | null | undefined): BlProfile | null {
  if (!r || !num(r.backlinks)) return null;
  const attrs = (r.referring_links_attributes ?? {}) as Record<string, unknown>;
  const nofollow = Math.min(num(r.backlinks), num(attrs.nofollow));
  return {
    ips: num(r.referring_ips),
    subnets: num(r.referring_subnets),
    followLinks: Math.max(0, num(r.backlinks) - nofollow),
    nofollowLinks: nofollow,
    ugc: num(attrs.ugc),
    sponsored: num(attrs.sponsored),
    tlds: slices(r.referring_links_tld, (k) => (k ? `.${k.replace(/^\./, "")}` : null)),
    types: slices(r.referring_links_types, (k) => TYPE_LABEL[k] ?? null, 5),
    platforms: slices(r.referring_links_platform_types, (k) => (k === "unknown" ? null : (PLATFORM_LABEL[k] ?? k))),
    places: slices(r.referring_links_semantic_locations, (k) => PLACE_LABEL[k] ?? null),
    countries: slices(r.referring_links_countries, (k) => (/^[A-Z]{2}$/i.test(k) ? k.toUpperCase() : null)),
  };
}

/** Linking sites, backlinks and authority per month, oldest first. */
export function parseHistory(items: unknown[] | null | undefined): Month[] {
  return ((items ?? []) as Record<string, unknown>[])
    .filter((i) => str(i.date))
    .map((i) => ({ date: str(i.date).slice(0, 10), domains: num(i.referring_domains), backlinks: num(i.backlinks), rank: Math.round(num(i.rank)) }))
    .sort((a, b) => a.date.localeCompare(b.date))
    .filter((m, i, all) => i === all.length - 1 || m.date.slice(0, 7) !== all[i + 1].date.slice(0, 7))
    .slice(-13);
}

/** The sites that link to a target, one row each, strongest first. */
export function parseRefDomains(items: unknown[] | null | undefined): RefDomain[] {
  return ((items ?? []) as Record<string, unknown>[])
    .filter((i) => str(i.domain))
    .map((i) => {
      const pages = num(i.referring_pages) || num(i.backlinks);
      const nf = num(i.referring_pages_nofollow);
      return {
        domain: bareDomain(str(i.domain)),
        rank: Math.round(num(i.rank)),
        backlinks: num(i.backlinks),
        firstSeen: str(i.first_seen) ? str(i.first_seen).slice(0, 10) : null,
        spam: Math.round(num(i.backlinks_spam_score)),
        follow: !pages || nf < pages,
        nofollowShare: pages ? Math.round((Math.min(nf, pages) / pages) * 100) : 0,
      };
    })
    .sort((a, b) => b.rank - a.rank || b.backlinks - a.backlinks);
}

/** Linking sites per authority band of 10: 0-9, 10-19 ... 90-100. */
export function authorityBands(rows: { rank: number }[]): number[] {
  const out = Array<number>(10).fill(0);
  for (const r of rows) out[Math.max(0, Math.min(9, Math.floor(r.rank / 10)))]++;
  return out;
}

// ---- Anchors ----

export type AnchorGroup = "brand" | "url" | "generic" | "keyword" | "empty";
export const ANCHOR_GROUPS: { id: AnchorGroup; label: string }[] = [
  { id: "brand", label: "Brand" },
  { id: "url", label: "URL" },
  { id: "generic", label: "Generic" },
  { id: "keyword", label: "Keyword" },
  { id: "empty", label: "No text" },
];
const GENERIC = new Set(["click here", "here", "this", "read more", "learn more", "more", "website", "this site", "this website", "link", "this link", "source", "this article", "this guide", "this post", "this page", "visit", "visit site", "see more", "continue reading", "check it out", "go", "home", "homepage", "official site", "their site", "view", "details", "more info", "find out more", "this study", "this report", "here's how", "via", "according to"]);

/** The words that name a brand, from its name and domain: "Acme Labs" and acme-labs.com give acme, labs, acmelabs. */
export function brandWords(name: string, domain: string): string[] {
  const host = bareDomain(domain).split(".")[0] ?? "";
  const words = `${name} ${host.replace(/-/g, " ")}`.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2);
  return [...new Set([...words, host.replace(/-/g, ""), name.toLowerCase().replace(/[^a-z0-9]/g, "")].filter((w) => w.length > 2))];
}

/** Which group an anchor falls in. Brand wins over URL when the link text is the brand's own domain. */
export function anchorGroup(anchor: string, brand: string[]): AnchorGroup {
  const a = anchor.toLowerCase().replace(/\s+/g, " ").trim();
  if (!a || a === "no anchor text") return "empty";
  const squashed = a.replace(/[^a-z0-9]/g, "");
  if (/^(https?:\/\/|www\.)/.test(a) || /^[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/.test(a)) return brand.some((b) => squashed.startsWith(b)) && !a.includes("/") ? "brand" : "url";
  if (brand.some((b) => squashed.includes(b))) return "brand";
  if (GENERIC.has(a.replace(/[.!?:]+$/, ""))) return "generic";
  return "keyword";
}

/** Linking sites per anchor group, with each group's share. */
export function anchorMix(anchors: Anchor[], brand: string[]): { id: AnchorGroup; label: string; domains: number; share: number }[] {
  const by = new Map<AnchorGroup, number>();
  for (const a of anchors) by.set(anchorGroup(a.anchor, brand), (by.get(anchorGroup(a.anchor, brand)) ?? 0) + a.domains);
  const total = [...by.values()].reduce((x, y) => x + y, 0);
  return ANCHOR_GROUPS.map((g) => ({ ...g, domains: by.get(g.id) ?? 0, share: total ? Math.round(((by.get(g.id) ?? 0) / total) * 100) : 0 })).filter((g) => g.domains > 0);
}

// ---- Broken backlinks ----

export type BrokenPage = { page: string; status: number; sites: number; links: number; from: { domain: string; url: string; rank: number; anchor: string }[]; redirect: string };

/** Links pointing at pages that are gone, grouped by the dead page, the page with the strongest links first. */
export function brokenPages(items: unknown[] | null | undefined, live: string[]): BrokenPage[] {
  const by = new Map<string, BrokenPage>();
  const sites = new Map<string, Set<string>>();
  for (const i of (items ?? []) as Record<string, unknown>[]) {
    const to = str(i.url_to);
    if (!to) continue;
    const p = by.get(to) ?? { page: to, status: num(i.url_to_status_code) || 404, sites: 0, links: 0, from: [], redirect: "" };
    p.links++;
    const d = bareDomain(str(i.domain_from) || str(i.url_from));
    const set = sites.get(to) ?? new Set<string>();
    if (!set.has(d)) {
      set.add(d);
      p.from.push({ domain: d, url: str(i.url_from), rank: Math.round(num(i.domain_from_rank)), anchor: str(i.anchor).trim().slice(0, 120) });
    }
    sites.set(to, set);
    by.set(to, p);
  }
  const dead = new Set(by.keys());
  return [...by.values()]
    .map((p) => ({ ...p, sites: p.from.length, from: p.from.sort((a, b) => b.rank - a.rank).slice(0, 5), redirect: suggestRedirect(p.page, live.filter((u) => !dead.has(u))) }))
    .sort((a, b) => (b.from[0]?.rank ?? 0) - (a.from[0]?.rank ?? 0) || b.sites - a.sites);
}

/** The live page whose address shares the most words with a dead one, or the home page. Paths only. */
export function suggestRedirect(dead: string, live: string[]): string {
  const path = (u: string) => {
    try {
      return new URL(u.startsWith("http") ? u : `https://x.com${u.startsWith("/") ? "" : "/"}${u}`).pathname.replace(/\/+$/, "") || "/";
    } catch {
      return "/";
    }
  };
  // Plural and singular count as the same word: webinars matches webinar.
  const words = (u: string) => new Set(path(u).toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !/^\d+$/.test(w)).map((w) => (w.length > 4 ? w.replace(/s$/, "") : w)));
  const want = words(dead);
  let best = "/";
  let score = 0;
  for (const u of live) {
    const p = path(u);
    if (p === path(dead)) continue;
    const w = words(u);
    let s = 0;
    for (const x of want) if (w.has(x)) s++;
    if (s > score || (s === score && s > 0 && p.length < best.length)) {
      best = p;
      score = s;
    }
  }
  return best;
}

// ---- Toxic links ----

const SPAMMY_TLD = new Set(["xyz", "top", "info", "biz", "click", "link", "online", "site", "icu", "buzz", "work", "loan", "win", "bid", "best", "rest", "monster", "cyou", "cfd", "sbs"]);
export type Risk = { score: number; level: "high" | "check" | "low"; reasons: string[] };

/** How risky a linking site looks: its spam score first, then a very weak site, a spam-prone ending and many links from a weak site. */
export function riskOf(d: RefDomain): Risk {
  const reasons: string[] = [];
  let score = d.spam;
  if (d.spam >= 30) reasons.push(`Spam score ${d.spam}`);
  if (d.rank < 5) {
    reasons.push("Very low authority");
    score += 10;
  }
  const tld = d.domain.split(".").pop() ?? "";
  if (SPAMMY_TLD.has(tld)) {
    reasons.push(`.${tld} ending`);
    score += 10;
  }
  if (d.backlinks >= 50 && d.rank < 15) {
    reasons.push(`${d.backlinks} links from a weak site`);
    score += 10;
  }
  score = Math.min(100, score);
  return { score, level: score >= 60 ? "high" : score >= 30 ? "check" : "low", reasons };
}

/** A disavow file in Google's format: comment lines, then one domain: line per site. */
export function disavowFile(domains: string[], target: string, day: string): string {
  const list = [...new Set(domains.map(bareDomain).filter(Boolean))].sort();
  return [`# Disavow file for ${target}`, `# Made in Arrowsterr on ${day}`, ...list.map((d) => `domain:${d}`)].join("\n") + "\n";
}

// ---- AI-cited links ----

export type AiLinkRow = { domain: string; cites: number; engines: string[]; rank: number; linksYou: boolean; competitors: string[]; priority: number };

/** Does a linking site match a cited one? The same host, or one is a subdomain of the other. */
export const sameSite = (a: string, b: string) => a === b || a.endsWith(`.${b}`) || b.endsWith(`.${a}`);

/**
 * Sites the brand's AI answers cite, with whether each links to the target and to which competitors.
 * Priority 1 to 5 is highest for a much-cited, strong site that links to competitors and not to the target.
 */
export function aiLinkRows(cited: { domain: string; cites: number; engines: string[] }[], linksTarget: string[], byCompetitor: Record<string, string[]>, ranks: Record<string, number>): AiLinkRow[] {
  const top = Math.max(1, ...cited.map((c) => c.cites));
  return cited
    .map((c) => {
      const linksYou = linksTarget.some((d) => sameSite(d, c.domain));
      const competitors = Object.entries(byCompetitor)
        .filter(([, list]) => list.some((d) => sameSite(d, c.domain)))
        .map(([k]) => k);
      const rank = ranks[c.domain] ?? 0;
      const raw = Math.log(1 + c.cites) / Math.log(1 + top) * 2 + Math.min(2, competitors.length) + rank / 100;
      const priority = linksYou ? 1 : Math.max(1, Math.min(5, Math.round(raw * 1.1)));
      return { domain: c.domain, cites: c.cites, engines: c.engines, rank, linksYou, competitors, priority };
    })
    .sort((a, b) => Number(a.linksYou) - Number(b.linksYou) || b.priority - a.priority || b.cites - a.cites);
}

/** Sites in the link gap by how many competitors each links to: 1, 2, and 3 or more. */
export function gapSpread(rows: GapRow[]): [number, number, number] {
  const out: [number, number, number] = [0, 0, 0];
  for (const r of rows) out[Math.min(2, Math.max(1, r.rivals.length) - 1)]++;
  return out;
}
