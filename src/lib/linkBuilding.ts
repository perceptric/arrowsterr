// Link Building board (docs/link-building.md). Pure, so the route, the worker and the tests share one copy.
// Cards are outreach_targets on the brand's "Link building" list. A won link is checked every week, and only two
// failed checks in a row mark it gone, so one slow or flaky page never raises a false alarm.

import * as cheerio from "cheerio";
import { sourceType } from "./metrics.ts";

export type Stage = "prospect" | "contacted" | "replied" | "won" | "lost";
export type Source = "ai_cites" | "link_gap" | "broken_page" | "unlinked_mention" | "manual";
export const STAGES: { id: Stage; label: string }[] = [
  { id: "prospect", label: "Prospects" },
  { id: "contacted", label: "Contacted" },
  { id: "replied", label: "Replied" },
  { id: "won", label: "Won" },
  { id: "lost", label: "Lost" },
];
export const SOURCES: { id: Source; label: string }[] = [
  { id: "ai_cites", label: "AI cites" },
  { id: "link_gap", label: "Link gap" },
  { id: "broken_page", label: "Broken page" },
  { id: "unlinked_mention", label: "Unlinked mention" },
  { id: "manual", label: "Added by hand" },
];
/** Failed checks in a row before a won link counts as gone. */
export const MISSES_TO_LOSE = 2;

export const bare = (raw: string) => raw.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/[/?#:].*$/, "").replace(/\.$/, "");
const owns = (host: string, domain: string) => Boolean(domain) && (host === domain || host.endsWith(`.${domain}`));

/** Can a card move to this stage? Won needs the page where the link sits, so it can be checked. */
export function moveError(to: Stage, linkPage: string | null | undefined, blocked: boolean): string | null {
  if (!STAGES.some((s) => s.id === to)) return "Pick a stage.";
  if (to === "won" && !validUrl(linkPage ?? "")) return "Add the page where the link is, so Arrowsterr can check it.";
  if ((to === "contacted" || to === "replied") && blocked) return "This site is on your do-not-contact list.";
  return null;
}

export function validUrl(raw: string): boolean {
  try {
    const u = new URL(raw.trim());
    return /^https?:$/.test(u.protocol) && /\.[a-z]{2,}$/i.test(u.hostname);
  } catch {
    return false;
  }
}

export type LinkFound = { found: boolean; follow: boolean; anchor: string; href: string };

/** Does this page link to the brand's site (any page, www or a subdomain)? A followed link wins over a nofollow one. */
export function findLink(html: string, pageUrl: string, brandDomain: string): LinkFound {
  const $ = cheerio.load(html.slice(0, 3_000_000));
  const me = bare(brandDomain);
  let best: LinkFound = { found: false, follow: false, anchor: "", href: "" };
  $("a[href]").each((_, a) => {
    const raw = ($(a).attr("href") ?? "").trim();
    let host = "";
    let href = "";
    try {
      const u = new URL(raw, pageUrl);
      if (!/^https?:$/.test(u.protocol)) return;
      host = u.hostname.toLowerCase().replace(/^www\./, "");
      href = u.toString();
    } catch {
      return;
    }
    if (!owns(host, me)) return;
    const rel = ($(a).attr("rel") ?? "").toLowerCase();
    const follow = !/\b(nofollow|sponsored|ugc)\b/.test(rel);
    if (!best.found || (follow && !best.follow)) best = { found: true, follow, anchor: $(a).text().replace(/\s+/g, " ").trim().slice(0, 200), href };
  });
  return best;
}

export type CheckState = { live: boolean | null; misses: number };
export type CheckResult = "found" | "missing" | "error";

/**
 * The link's state after one weekly check. Found: live, misses reset. Missing (the page loaded without the link) or
 * error (timeout, 5xx): one more miss, and the link only counts as gone at MISSES_TO_LOSE misses in a row.
 */
export function nextCheck(prev: CheckState, r: CheckResult): CheckState {
  if (r === "found") return { live: true, misses: 0 };
  const misses = prev.misses + 1;
  return { live: misses >= MISSES_TO_LOSE ? false : prev.live, misses };
}

/** Is this card on the do-not-contact list, by email, email domain or site? */
export function suppressed(card: { domain?: string | null; email?: string | null }, list: Set<string>): boolean {
  const d = bare(card.domain ?? "");
  const e = (card.email ?? "").trim().toLowerCase();
  if (e && (list.has(e) || list.has(e.split("@")[1] ?? ""))) return true;
  if (!d) return false;
  for (const v of list) if (!v.includes("@") && owns(d, bare(v))) return true;
  return false;
}

const JUNK_EMAIL = /(@(example|domain|email)\.|@([a-z0-9-]+\.)*(sentry|sentry-next|wixpress|ingest|bugsnag|rollbar)\.|\.(png|jpe?g|gif|webp|svg)$|^noreply|^no-reply|^donotreply|@2x|^[a-f0-9]{16,}@)/i;
const ROLE_ORDER = ["editor", "editorial", "news", "press", "media", "pr", "partnerships", "partner", "marketing", "content", "hello", "contact", "info", "team", "support"];

/** Contact emails on a page, best first: role addresses editors read, on the site's own domain, before personal or support ones. */
export function emailsIn(html: string, siteDomain: string): string[] {
  const found = new Set<string>();
  const $ = cheerio.load(html.slice(0, 2_000_000));
  $('a[href^="mailto:"]').each((_, a) => {
    const v = decodeURIComponent(($(a).attr("href") ?? "").slice(7).split("?")[0]).trim().toLowerCase();
    if (v) found.add(v);
  });
  for (const m of $.root().text().matchAll(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi)) found.add(m[0].toLowerCase());
  const me = bare(siteDomain);
  const score = (e: string) => {
    const [user, host] = e.split("@");
    const role = ROLE_ORDER.findIndex((r) => user === r || user.startsWith(`${r}.`) || user.startsWith(`${r}-`));
    return (owns(host ?? "", me) ? 0 : 100) + (role === -1 ? 50 : role);
  };
  return [...found].filter((e) => /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/.test(e) && !JUNK_EMAIL.test(e)).sort((a, b) => score(a) - score(b) || a.localeCompare(b));
}

export type ChatLite = { brands?: { name: string }[]; sources?: { url: string; domain?: string | null }[] };
export type Prospect = { domain: string; url: string; source: Source; note: string; score: number };

/**
 * Sites AI answers cite when they name a rival and not the brand. Only editorial, review and company sites: forums,
 * social sites and encyclopedias aren't places to ask for a link. Most cited first.
 */
export function aiProspects(chats: ChatLite[], brand: { name: string; domain: string }, rivals: { name: string; domain: string }[], max = 25): Prospect[] {
  const me = bare(brand.domain);
  const rivalDomains = new Set(rivals.map((r) => bare(r.domain)).filter(Boolean));
  const rivalNames = rivals.map((r) => r.name.toLowerCase());
  const by = new Map<string, { count: number; urls: Map<string, number>; rivals: Set<string> }>();
  for (const c of chats) {
    const names = (c.brands ?? []).map((b) => b.name.toLowerCase());
    if (names.includes(brand.name.toLowerCase())) continue;
    const named = rivals.filter((r, i) => names.includes(rivalNames[i]));
    if (!named.length) continue;
    for (const s of c.sources ?? []) {
      const d = bare(s.domain || s.url);
      if (!d || owns(d, me) || [...rivalDomains].some((r) => owns(d, r))) continue;
      const type = sourceType(d, me, rivalDomains);
      if (type !== "Editorial" && type !== "Reviews" && type !== "Corporate") continue;
      const row = by.get(d) ?? { count: 0, urls: new Map<string, number>(), rivals: new Set<string>() };
      row.count++;
      row.urls.set(s.url, (row.urls.get(s.url) ?? 0) + 1);
      for (const r of named) row.rivals.add(r.name);
      by.set(d, row);
    }
  }
  return [...by.entries()]
    .sort((a, b) => b[1].count - a[1].count || a[0].localeCompare(b[0]))
    .slice(0, max)
    .map(([domain, r]) => ({
      domain,
      url: [...r.urls.entries()].sort((a, b) => b[1] - a[1])[0][0],
      source: "ai_cites" as const,
      note: `AI cited it ${r.count}× in answers that name ${[...r.rivals].slice(0, 2).join(" and ")} and not ${brand.name}`,
      score: r.count,
    }));
}

/** A page that names the brand and doesn't link to it. */
export function unlinkedMention(html: string, pageUrl: string, brand: { name: string; domain: string }): boolean {
  if (bare(pageUrl) === bare(brand.domain) || owns(bare(pageUrl), bare(brand.domain))) return false;
  const $ = cheerio.load(html.slice(0, 3_000_000));
  $("script, style, noscript").remove();
  const text = $("body").text().replace(/\s+/g, " ");
  const name = brand.name.trim();
  if (name.length < 3) return false;
  const re = new RegExp(`(^|[^a-z0-9])${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`, "i");
  return re.test(text) && !findLink(html, pageUrl, brand.domain).found;
}

/** Counts per column for the board header, and the reply rate of everything contacted. */
export function boardStats(cards: { stage: Stage; link_live?: boolean | null }[]) {
  const n = (s: Stage) => cards.filter((c) => c.stage === s).length;
  const reached = n("contacted") + n("replied") + n("won") + n("lost");
  return { prospects: n("prospect"), reached, replyRate: reached ? Math.round(((n("replied") + n("won")) / reached) * 100) : 0, won: n("won"), gone: cards.filter((c) => c.stage === "won" && c.link_live === false).length };
}
