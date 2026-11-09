// Backlinks screen (docs/backlinks.md): DataForSEO Backlinks answers turned into what the page shows, and the link gap.
// Pure, so the route, Zippie and the tests share one copy. Ranks use DataForSEO's 0 to 100 scale (rank_scale one_hundred).

export type BlSummary = { rank: number; backlinks: number; domains: number; nofollowDomains: number; spam: number; broken: number };
export type Week = { date: string; newDomains: number; lostDomains: number };
export type Anchor = { anchor: string; domains: number; backlinks: number; share: number };
export type LinkedPage = { url: string; domains: number; backlinks: number };
export type Overview = { target: string; summary: BlSummary | null; weeks: Week[]; anchors: Anchor[]; pages: LinkedPage[] };
export type LinkRow = { from: string; domain: string; to: string; anchor: string; follow: boolean; type: string; firstSeen: string | null; isNew: boolean; isLost: boolean; spam: number; rank: number };
export type LinkKind = "all" | "new" | "lost" | "follow" | "nofollow" | "spam";
export type GapRow = { domain: string; rank: number; rivals: string[]; aiCited: number };

export const LINK_KINDS: { id: LinkKind; label: string }[] = [
  { id: "all", label: "All" },
  { id: "new", label: "New" },
  { id: "lost", label: "Lost" },
  { id: "follow", label: "Follow" },
  { id: "nofollow", label: "Nofollow" },
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
    }));
}

/** The DataForSEO backlinks/live settings for each list on the Links tab. One row per linking site, strongest first. */
export function linksQuery(kind: LinkKind, now = new Date()): Record<string, unknown> {
  const base = { mode: "one_per_domain", order_by: ["domain_from_rank,desc"], rank_scale: "one_hundred" };
  const since = new Date(now.getTime() - 30 * 864e5).toISOString().slice(0, 10);
  if (kind === "lost") return { ...base, backlinks_status_type: "lost" };
  if (kind === "new") return { ...base, backlinks_status_type: "live", filters: ["first_seen", ">", `${since} 00:00:00 +00:00`], order_by: ["first_seen,desc"] };
  if (kind === "follow") return { ...base, backlinks_status_type: "live", filters: ["dofollow", "=", true] };
  if (kind === "nofollow") return { ...base, backlinks_status_type: "live", filters: ["dofollow", "=", false] };
  if (kind === "spam") return { ...base, backlinks_status_type: "live", filters: ["backlink_spam_score", ">", SPAM_LINE], order_by: ["backlink_spam_score,desc"] };
  return { ...base, backlinks_status_type: "live" };
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
export function gapRivals(list: string[], own: string): string[] {
  const me = bareDomain(own);
  const out: string[] = [];
  for (const r of list) {
    const d = bareDomain(r);
    if (d && /\.[a-z]{2,}$/.test(d) && d !== me && !out.includes(d)) out.push(d);
    if (out.length === 3) break;
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
