// What Zippie's crawl tools read from a page and a site (docs/zippie-skills-plan.md, section 3.2): the facts a technical
// SEO check needs, and the problems across a site, most harmful first. Pure apart from cheerio, so tests run on
// recorded HTML.
import * as cheerio from "cheerio";
import { robotsAllows } from "./articleResearch.ts";

export type Link = { url: string; anchor: string; internal: boolean; nofollow: boolean };
export type PageFacts = {
  title: string;
  description: string;
  canonical: string | null;
  robots: string;
  noindex: boolean;
  lang: string | null;
  h1: string[];
  h2: number;
  words: number;
  links: Link[];
  images: { src: string; alt: string | null }[];
  schema: string[];
  hreflang: { lang: string; url: string }[];
};

const host = (u: string) => {
  try {
    return new URL(u).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
};
/** A URL written the same way every time: no hash, no trailing slash (except the root), lowercase host. */
export function urlKey(u: string): string {
  try {
    const x = new URL(u);
    x.hash = "";
    const path = x.pathname.replace(/\/+$/, "") || "/";
    return `${x.protocol}//${x.hostname.toLowerCase().replace(/^www\./, "")}${path}${x.search}`;
  } catch {
    return u;
  }
}

function schemaTypes(raw: string): string[] {
  const out: string[] = [];
  const walk = (x: unknown) => {
    if (!x || typeof x !== "object") return;
    if (Array.isArray(x)) return x.forEach(walk);
    const t = (x as { "@type"?: unknown })["@type"];
    if (typeof t === "string") out.push(t);
    else if (Array.isArray(t)) out.push(...t.filter((v): v is string => typeof v === "string"));
    walk((x as { "@graph"?: unknown })["@graph"]);
  };
  try {
    walk(JSON.parse(raw));
  } catch {
    /* broken JSON-LD reads as none */
  }
  return out;
}

/** The SEO facts of one page. base is the page's final URL, for resolving links. */
export function pageFacts(html: string, base: string): PageFacts {
  const $ = cheerio.load(html);
  const meta = (name: string) => $(`meta[name="${name}" i]`).attr("content")?.trim() ?? "";
  const abs = (h: string | undefined) => {
    if (!h) return "";
    try {
      return new URL(h, base).toString();
    } catch {
      return "";
    }
  };
  const robots = meta("robots").toLowerCase();
  const schema = $('script[type="application/ld+json"]')
    .toArray()
    .flatMap((s) => schemaTypes($(s).text()));
  const links: Link[] = [];
  $("a[href]").each((_, a) => {
    const href = $(a).attr("href") ?? "";
    if (/^(#|mailto:|tel:|javascript:)/i.test(href)) return;
    const url = abs(href);
    if (!/^https?:/i.test(url)) return;
    links.push({ url, anchor: $(a).text().replace(/\s+/g, " ").trim().slice(0, 120) || ($(a).find("img").attr("alt") ?? "").trim(), internal: host(url) === host(base), nofollow: /nofollow/i.test($(a).attr("rel") ?? "") });
  });
  const images = $("img")
    .toArray()
    .map((i) => ({ src: abs($(i).attr("src") ?? $(i).attr("data-src")), alt: $(i).attr("alt") ?? null }))
    .filter((i) => i.src);
  const body = $("body").clone();
  body.find("script, style, noscript, svg, nav, header, footer").remove();
  const text = body.text().replace(/\s+/g, " ").trim();
  return {
    title: $("title").first().text().replace(/\s+/g, " ").trim(),
    description: meta("description"),
    canonical: abs($('link[rel="canonical" i]').attr("href")) || null,
    robots,
    noindex: /noindex/.test(robots),
    lang: $("html").attr("lang") ?? null,
    h1: $("h1")
      .toArray()
      .map((h) => $(h).text().replace(/\s+/g, " ").trim())
      .filter(Boolean),
    h2: $("h2").length,
    words: text ? text.split(" ").length : 0,
    links,
    images,
    schema,
    hreflang: $('link[rel="alternate" i][hreflang]')
      .toArray()
      .map((l) => ({ lang: $(l).attr("hreflang") ?? "", url: abs($(l).attr("href")) }))
      .filter((h) => h.url),
  };
}

/** One page as the site check sees it: the fetch result and its facts. */
export type CrawledPage = { url: string; status: number; hops: number; finalUrl: string; inSitemap: boolean; facts: PageFacts | null; error?: string };
export type Issue = { key: string; label: string; severity: "fix" | "check"; pages: string[]; note?: string };

/** The problems across a crawled site, most harmful first, each with the pages it hits. */
export function siteIssues(pages: CrawledPage[]): Issue[] {
  const ok = pages.filter((p) => p.facts && p.status >= 200 && p.status < 300);
  const inbound = new Map<string, number>();
  for (const p of ok) for (const l of p.facts!.links) if (l.internal) inbound.set(urlKey(l.url), (inbound.get(urlKey(l.url)) ?? 0) + 1);
  const byValue = (f: (p: CrawledPage) => string) => {
    const groups = new Map<string, string[]>();
    for (const p of ok) {
      const v = f(p).trim().toLowerCase();
      if (v) groups.set(v, [...(groups.get(v) ?? []), p.finalUrl]);
    }
    return [...groups.values()].filter((g) => g.length > 1).flat();
  };
  const home = (u: string) => {
    try {
      return new URL(u).pathname.replace(/\/+$/, "") === "";
    } catch {
      return false;
    }
  };
  const issues: Issue[] = [
    { key: "broken", label: "Pages that return an error", severity: "fix", pages: pages.filter((p) => p.status >= 400 || p.status === 0).map((p) => p.url) },
    { key: "noindex", label: "Pages in the sitemap with noindex", severity: "fix", pages: ok.filter((p) => p.inSitemap && p.facts!.noindex).map((p) => p.finalUrl) },
    { key: "chains", label: "Redirect chains (more than 1 hop)", severity: "fix", pages: pages.filter((p) => p.hops > 1).map((p) => p.url) },
    { key: "canonical", label: "Canonical points to another page", severity: "check", pages: ok.filter((p) => p.facts!.canonical && urlKey(p.facts!.canonical) !== urlKey(p.finalUrl)).map((p) => p.finalUrl) },
    { key: "no-title", label: "No title", severity: "fix", pages: ok.filter((p) => !p.facts!.title).map((p) => p.finalUrl) },
    { key: "dup-title", label: "Titles used on more than one page", severity: "fix", pages: byValue((p) => p.facts!.title) },
    { key: "long-title", label: "Titles over 60 characters", severity: "check", pages: ok.filter((p) => p.facts!.title.length > 60).map((p) => p.finalUrl) },
    { key: "no-description", label: "No meta description", severity: "fix", pages: ok.filter((p) => !p.facts!.description).map((p) => p.finalUrl) },
    { key: "dup-description", label: "Meta descriptions used on more than one page", severity: "check", pages: byValue((p) => p.facts!.description) },
    { key: "h1", label: "No H1, or more than one", severity: "check", pages: ok.filter((p) => p.facts!.h1.length !== 1).map((p) => p.finalUrl) },
    { key: "thin", label: "Thin pages (under 300 words)", severity: "check", pages: ok.filter((p) => !home(p.finalUrl) && p.facts!.words < 300).map((p) => p.finalUrl) },
    { key: "orphan", label: "No internal links point here", severity: "check", pages: ok.filter((p) => !home(p.finalUrl) && !inbound.get(urlKey(p.finalUrl))).map((p) => p.finalUrl) },
    { key: "alt", label: "Images with no alt text", severity: "check", pages: ok.filter((p) => p.facts!.images.some((i) => i.alt === null)).map((p) => p.finalUrl) },
    { key: "schema", label: "No structured data", severity: "check", pages: ok.filter((p) => !p.facts!.schema.length).map((p) => p.finalUrl) },
  ];
  return issues.filter((i) => i.pages.length);
}

/** How many internal links point at each page, for orphan and link plans. */
export function inboundCounts(pages: CrawledPage[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of pages) for (const l of p.facts?.links ?? []) if (l.internal) out[urlKey(l.url)] = (out[urlKey(l.url)] ?? 0) + 1;
  return out;
}

// ─────────────── robots.txt ───────────────
export const AI_BOTS: { agent: string; owner: string }[] = [
  { agent: "GPTBot", owner: "OpenAI (training)" },
  { agent: "OAI-SearchBot", owner: "OpenAI (ChatGPT search)" },
  { agent: "ChatGPT-User", owner: "OpenAI (ChatGPT browsing)" },
  { agent: "ClaudeBot", owner: "Anthropic" },
  { agent: "PerplexityBot", owner: "Perplexity" },
  { agent: "Google-Extended", owner: "Google (Gemini training)" },
  { agent: "Googlebot", owner: "Google Search and AI Overviews" },
  { agent: "Bingbot", owner: "Bing and Copilot" },
  { agent: "CCBot", owner: "Common Crawl" },
];

/** What robots.txt says: its sitemaps, and whether each bot may read the homepage and a typical page. */
export function robotsReport(txt: string): { sitemaps: string[]; bots: { agent: string; owner: string; home: boolean; blog: boolean }[]; blocksAll: boolean } {
  const sitemaps = [...txt.matchAll(/^\s*sitemap\s*:\s*(\S+)/gim)].map((m) => m[1]);
  const bots = AI_BOTS.map((b) => ({ ...b, home: robotsAllows(txt, "/", b.agent), blog: robotsAllows(txt, "/blog/example", b.agent) }));
  return { sitemaps, bots, blocksAll: !robotsAllows(txt, "/", "*") };
}

// ─────────────── PageSpeed Insights ───────────────
type Audit = { title?: string; displayValue?: string; numericValue?: number; details?: { type?: string; overallSavingsMs?: number } };
/** The parts of a PageSpeed Insights result worth showing: score, the main lab metrics, field data and the biggest savings. */
export function speedReport(raw: unknown) {
  const r = raw as { lighthouseResult?: { categories?: { performance?: { score?: number } }; audits?: Record<string, Audit> }; loadingExperience?: { metrics?: Record<string, { percentile?: number; category?: string }> } };
  const audits = r.lighthouseResult?.audits ?? {};
  const lab = (k: string) => audits[k]?.displayValue ?? null;
  const field = r.loadingExperience?.metrics ?? {};
  const f = (k: string) => (field[k] ? { value: field[k].percentile ?? null, rating: field[k].category ?? null } : null);
  const savings = Object.values(audits)
    .filter((a) => a.details?.type === "opportunity" && (a.details.overallSavingsMs ?? 0) > 100)
    .sort((a, b) => (b.details!.overallSavingsMs ?? 0) - (a.details!.overallSavingsMs ?? 0))
    .slice(0, 5)
    .map((a) => ({ fix: a.title ?? "", saves: `${Math.round((a.details!.overallSavingsMs ?? 0) / 100) / 10} s` }));
  const score = r.lighthouseResult?.categories?.performance?.score;
  return {
    score: typeof score === "number" ? Math.round(score * 100) : null,
    lab: { lcp: lab("largest-contentful-paint"), cls: lab("cumulative-layout-shift"), tbt: lab("total-blocking-time"), fcp: lab("first-contentful-paint") },
    field: { lcp: f("LARGEST_CONTENTFUL_PAINT_MS"), cls: f("CUMULATIVE_LAYOUT_SHIFT_SCORE"), inp: f("INTERACTION_TO_NEXT_PAINT") },
    savings,
  };
}
