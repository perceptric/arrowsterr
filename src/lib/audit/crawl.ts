// Audit's link crawler, the parts with no network: cleaning addresses, deciding what to crawl, reading a page's
// facts and links, and saying when a crawl is partial (docs/audit-plan.md, sections 4.5 and 10).
// Pure, so tests cover it. The server side is in crawlServer.ts.
import { createHash } from "node:crypto";
import * as cheerio from "cheerio";
import { pageMeta } from "../pageMeta.ts";
import { pageText } from "../pageText.ts";

export type CrawlSettings = {
  start: string; // the start address
  subdomains: boolean; // crawl blog.acme.com too
  include: string[]; // path patterns with *, like /blog/*; empty means everything
  exclude: string[]; // path patterns never crawled
  speed: "gentle" | "normal" | "fast"; // 1, 2 or 5 requests a second
  limit: number; // pages, never above the plan's limit
};

export const SPEEDS: Record<CrawlSettings["speed"], number> = { gentle: 1, normal: 2, fast: 5 };
export const MAX_DEPTH = 20;
export const MAX_QUERY_VARIANTS = 50; // one path with more query strings than this is an endless space
export const TIME_CAP_MS = 4 * 3600_000;

const TRACKING = /^(utm_[a-z]+|gclid|fbclid|msclkid|dclid|yclid|mc_cid|mc_eid|_ga|_gl|igshid|ref_src)$/i;
const FILE_EXT = /\.(jpe?g|png|gif|svg|webp|avif|ico|bmp|tiff?|pdf|zip|gz|rar|7z|mp4|mp3|m4a|wav|webm|mov|avi|css|js|mjs|json|xml|txt|csv|xlsx?|docx?|pptx?|woff2?|ttf|eot|otf|exe|dmg|apk)$/i;

/**
 * One way to write an address, used everywhere: lowercase host, no default port, no fragment, tracking parameters
 * dropped, the rest of the query sorted. The path and its trailing slash stay as they are. Null when it isn't http(s).
 */
export function normUrl(raw: string, base?: string): string | null {
  let u: URL;
  try {
    u = base ? new URL(raw, base) : new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  u.hash = "";
  u.username = "";
  u.password = "";
  u.hostname = u.hostname.toLowerCase().replace(/\.$/, "");
  if ((u.protocol === "http:" && u.port === "80") || (u.protocol === "https:" && u.port === "443")) u.port = "";
  const params = [...u.searchParams.entries()].filter(([k]) => !TRACKING.test(k)).sort(([a, av], [b, bv]) => (a === b ? av.localeCompare(bv) : a.localeCompare(b)));
  u.search = params.length ? `?${new URLSearchParams(params).toString()}` : "";
  return u.toString();
}

/** A short, steady key for an address after normUrl. */
export const urlHash = (url: string) => createHash("sha256").update(url).digest("hex").slice(0, 20);

/** The site's own host without www, for deciding what's internal. */
export const siteHost = (url: string) => {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
};

/** Same site: the same host with or without www, or any subdomain when subdomains are on. */
export function isInternal(url: string, host: string, subdomains: boolean): boolean {
  const h = siteHost(url);
  if (!h || !host) return false;
  return h === host || (subdomains && h.endsWith(`.${host}`));
}

/** Does a path pattern with * match? A pattern without * matches that path and everything under it. */
export function pathMatches(pattern: string, path: string): boolean {
  const p = pattern.trim();
  if (!p) return false;
  const body = p
    .split("*")
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${body}${p.includes("*") ? "$" : "(/.*)?$"}`, "i").test(path);
}

/** Why an internal address isn't crawled, or null when it should be. Robots rules are checked by the caller. */
export function skipReason(url: string, s: Pick<CrawlSettings, "include" | "exclude">, depth: number): "file" | "excluded" | "endless" | "deep" | null {
  const u = new URL(url);
  const path = u.pathname;
  if (FILE_EXT.test(path)) return "file";
  if (depth > MAX_DEPTH) return "deep";
  if (s.exclude.some((p) => pathMatches(p, path))) return "excluded";
  if (s.include.length && path !== "/" && !s.include.some((p) => pathMatches(p, path))) return "excluded";
  if (endlessPath(u)) return "endless";
  return null;
}

/** Paths that never end: very deep paths, a part repeated 3 times, or a calendar's date in the query. */
export function endlessPath(u: URL): boolean {
  const parts = u.pathname.split("/").filter(Boolean);
  if (parts.length > 12) return true;
  const seen = new Map<string, number>();
  for (const p of parts) seen.set(p, (seen.get(p) ?? 0) + 1);
  if ([...seen.values()].some((n) => n >= 3)) return true;
  for (const [k, v] of u.searchParams) if (/^(date|day|month|year|week|calendar|start|end)$/i.test(k) && /\d{4}/.test(v)) return true;
  return false;
}

export type FoundLink = { url: string; anchor: string; rel: string; place: "body" | "nav" | "footer" };
export type PageRead = {
  title: string;
  h1: string[];
  h2: string[];
  canonical: string | null;
  metaRobots: string | null;
  noindex: boolean;
  words: number;
  published: string | null;
  modified: string | null;
  links: FoundLink[]; // internal links, every one with its anchor and place
  extLinks: number;
};

const clean = (s: string) => s.replace(/\s+/g, " ").trim();

/** A page's facts and links from its HTML. Links are made absolute against the page (or its <base>). */
export function readPage(html: string, pageUrl: string, host: string, subdomains: boolean): PageRead {
  const $ = cheerio.load(html.slice(0, 5_000_000));
  const base = normUrl($("base[href]").attr("href") ?? "", pageUrl) ?? pageUrl;
  const metaRobots = $('meta[name="robots" i], meta[name="googlebot" i]')
    .map((_, m) => $(m).attr("content") ?? "")
    .get()
    .join(", ")
    .toLowerCase() || null;
  const canonicalRaw = $('link[rel="canonical" i]').first().attr("href");
  const canonical = canonicalRaw ? normUrl(canonicalRaw, base) : null;
  const links: FoundLink[] = [];
  let extLinks = 0;
  $("a[href]").each((_, a) => {
    const href = ($(a).attr("href") ?? "").trim();
    if (!href || /^(#|mailto:|tel:|javascript:|data:|sms:)/i.test(href)) return;
    const url = normUrl(href, base);
    if (!url) return;
    if (!isInternal(url, host, subdomains)) {
      extLinks++;
      return;
    }
    const $a = $(a);
    const place = $a.closest("footer, [role=contentinfo]").length ? "footer" : $a.closest("nav, header, [role=navigation], [role=banner]").length ? "nav" : "body";
    const anchor = clean($a.text()) || clean($a.attr("aria-label") ?? "") || clean($a.find("img[alt]").first().attr("alt") ?? "");
    links.push({ url, anchor: anchor.slice(0, 200), rel: clean(($a.attr("rel") ?? "").toLowerCase()), place });
  });
  const meta = pageMeta(html, pageUrl);
  return {
    title: clean($("title").first().text()).slice(0, 300),
    h1: $("h1").map((_, h) => clean($(h).text()).slice(0, 300)).get().filter(Boolean).slice(0, 5),
    h2: $("h2").map((_, h) => clean($(h).text()).slice(0, 200)).get().filter(Boolean).slice(0, 30),
    canonical,
    metaRobots,
    noindex: /\bnoindex\b|\bnone\b/.test(metaRobots ?? ""),
    words: pageText(html).words,
    published: meta.published || null,
    modified: meta.modified || null,
    links,
    extLinks,
  };
}

/** Indexable: answered 200, no noindex in the page or the X-Robots-Tag header, and its canonical is itself or empty. */
export function indexable(status: number, read: Pick<PageRead, "noindex" | "canonical"> | null, url: string, xRobots: string | null): boolean {
  if (status < 200 || status >= 300 || !read) return false;
  if (read.noindex || /\bnoindex\b|\bnone\b/i.test(xRobots ?? "")) return false;
  return !read.canonical || sameish(read.canonical, url);
}

/** Two addresses for the same page: ignoring scheme, www and a trailing slash. */
export function sameish(a: string, b: string): boolean {
  const k = (s: string) => {
    try {
      const u = new URL(s);
      return `${u.hostname.toLowerCase().replace(/^www\./, "")}${u.pathname.replace(/\/+$/, "") || "/"}${u.search}`;
    } catch {
      return s;
    }
  };
  return k(a) === k(b);
}

/** A page from a bot wall (Cloudflare, Sucuri, Akamai and others) instead of the site. */
export function isChallenge(status: number, body: string, headers: Headers | null): boolean {
  if (headers?.get("cf-mitigated")?.toLowerCase() === "challenge") return true;
  if (![403, 429, 503].includes(status)) return false;
  return /cf-chl|challenge-platform|just a moment\.\.\.|attention required|sucuri website firewall|access denied.*akamai|ddos-guard|captcha|are you a robot|verify you are human/i.test(body.slice(0, 50_000));
}

/** Crawl-delay for our bot (or *) from robots.txt, in seconds. */
export function crawlDelay(robots: string): number | null {
  let applies = false;
  let delay: number | null = null;
  let inAgents = false;
  for (const raw of robots.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    const m = line.match(/^([a-z-]+)\s*:\s*(.*)$/i);
    if (!m) continue;
    const key = m[1].toLowerCase();
    if (key === "user-agent") {
      if (!inAgents) applies = false;
      inAgents = true;
      const a = m[2].trim().toLowerCase();
      if (a === "*" || a.includes("arrowsterrbot")) applies = true;
      continue;
    }
    inAgents = false;
    if (key === "crawl-delay" && applies) {
      const n = Number(m[2]);
      if (Number.isFinite(n) && n > 0) delay = Math.max(delay ?? 0, Math.min(n, 30));
    }
  }
  return delay;
}

/** Pages a second for this crawl: the setting, slowed by Crawl-delay and halved for every 429 seen. */
export function crawlRate(speed: CrawlSettings["speed"], delay: number | null, halvings: number): number {
  let rps = SPEEDS[speed] ?? 2;
  if (delay) rps = Math.min(rps, 1 / delay);
  return Math.max(0.1, rps / 2 ** Math.min(halvings, 4));
}

/** Retry a fetch that failed for a reason that passes: no answer, too many requests, or a server error. */
export const retryable = (status: number) => status === 0 || status === 429 || (status >= 500 && status < 600);
export const RETRY_WAITS = [5, 30]; // seconds before the 2nd and 3rd try

export type CrawlTally = { home: { status: number } | null; done: number; noAnswer: number; found: number; startedAt: number; now: number };

/**
 * Why a finished crawl is partial, or null for a full crawl (docs/audit-plan.md, section 10.1). A partial crawl gets
 * no score and no alert. Pages that answer with an error (404, 500) still count as answered.
 */
export function partialReason(t: CrawlTally): "home" | "no_answer" | "time" | null {
  if (!t.home || t.home.status === 0 || t.home.status >= 500) return "home";
  if (t.done >= 4 && t.noAnswer > t.done / 2) return "no_answer";
  if (t.now - t.startedAt >= TIME_CAP_MS && t.done < t.found / 2) return "time";
  return null;
}

/** Clean what people typed into the crawl settings. */
export function readSettings(raw: Record<string, unknown> | null | undefined, fallbackStart: string, planLimit: number): CrawlSettings {
  const r = raw ?? {};
  const list = (v: unknown) =>
    (Array.isArray(v) ? v : typeof v === "string" ? v.split(/[\n,]/) : [])
      .map((x) => String(x).trim())
      .filter(Boolean)
      .map((x) => (x.startsWith("/") || x.startsWith("*") ? x : `/${x}`))
      .slice(0, 30);
  const start = typeof r.start === "string" && normUrl(r.start.includes("://") ? r.start : `https://${r.start}`) ? normUrl(r.start.includes("://") ? r.start : `https://${r.start}`)! : fallbackStart;
  const speed = r.speed === "gentle" || r.speed === "fast" ? r.speed : "normal";
  const limit = Math.max(10, Math.min(planLimit, Number(r.limit) > 0 ? Math.round(Number(r.limit)) : planLimit));
  return { start, subdomains: r.subdomains === true, include: list(r.include), exclude: list(r.exclude), speed, limit };
}
