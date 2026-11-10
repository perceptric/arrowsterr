import * as cheerio from "cheerio";
import { NOT_A_PAGE, normUrl } from "./url.ts";

// What the crawler reads from one HTML page (docs/technical-seo-plan.md, section 6). Pure: HTML and headers in,
// facts out, so the crawler and the tests read pages the same way.

export type Link = { url: string; anchor: string; nofollow: boolean; img: boolean };
export type PageFacts = {
  title: string;
  titles: number;
  description: string;
  descriptions: number;
  h1: string[];
  headings: number;
  headingSkip: boolean;
  canonical: string | null;
  canonicalRaw: string | null;
  canonicals: number;
  metaRobots: string;
  xRobots: string;
  noindex: boolean;
  nofollowPage: boolean;
  lang: string;
  viewport: boolean;
  hreflang: { lang: string; url: string }[];
  schema: string[];
  schemaInvalid: number;
  ogImage: boolean;
  images: number;
  imagesNoAlt: number;
  imageLinksNoAlt: number;
  words: number;
  textHash: string;
  internal: Link[];
  external: Link[];
  linksOut: number;
  emptyAnchors: number;
  nofollowInternal: number;
  httpLinks: number;
  mixedContent: number;
  metaRefresh: string | null;
  shell: boolean;
  bytes: number;
};

/** A short stable hash of text, for spotting pages with the same main content. */
export function hashText(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

/** Main text: the body without scripts, menus, headers, footers, sidebars, forms and cookie banners. */
function mainText($: cheerio.CheerioAPI): string {
  const body = $("body").clone();
  body.find("script, style, noscript, template, svg, nav, header, footer, aside, form, iframe, [role=navigation], [aria-hidden=true], [class*=cookie], [id*=cookie], [class*=consent], [id*=consent]").remove();
  const main = body.find("main, article, [role=main]").first();
  return (main.length ? main : body).text().replace(/\s+/g, " ").trim();
}

export function readPage(url: string, html: string, headers: Record<string, string> = {}, opts: { root: string; subdomains?: boolean; dropQuery?: boolean } = { root: url }): PageFacts {
  const $ = cheerio.load(html);
  const base = $("base[href]").attr("href");
  const at = (() => {
    try {
      return base ? new URL(base, url).toString() : url;
    } catch {
      return url;
    }
  })();
  const rootHost = new URL(opts.root).hostname.replace(/^www\./, "");
  const internalHost = (h: string) => {
    const x = h.replace(/^www\./, "");
    return x === rootHost || (Boolean(opts.subdomains) && x.endsWith(`.${rootHost}`));
  };

  const metaRobots = $('meta[name="robots" i], meta[name="googlebot" i]').map((_, el) => $(el).attr("content") ?? "").get().join(", ").toLowerCase();
  const xRobots = (headers["x-robots-tag"] ?? "").toLowerCase();
  const robots = `${metaRobots} ${xRobots}`;
  const canonTags = $('link[rel="canonical" i]');
  const canonicalRaw = canonTags.first().attr("href")?.trim() || null;
  const headerCanon = /<([^>]+)>\s*;\s*rel="?canonical"?/i.exec(headers["link"] ?? "")?.[1] ?? null;

  const schema: string[] = [];
  let schemaInvalid = 0;
  $('script[type="application/ld+json" i]').each((_, el) => {
    try {
      const walk = (n: unknown) => {
        if (Array.isArray(n)) return n.forEach(walk);
        if (n && typeof n === "object") {
          const o = n as Record<string, unknown>;
          const t = o["@type"];
          for (const x of Array.isArray(t) ? t : t ? [t] : []) if (typeof x === "string" && !schema.includes(x)) schema.push(x);
          if (o["@graph"]) walk(o["@graph"]);
        }
      };
      walk(JSON.parse($(el).text()));
    } catch {
      schemaInvalid++;
    }
  });
  $("[itemtype]").each((_, el) => {
    const t = ($(el).attr("itemtype") ?? "").split("/").pop();
    if (t && !schema.includes(t)) schema.push(t);
  });

  const internal: Link[] = [];
  const external: Link[] = [];
  let emptyAnchors = 0;
  let nofollowInternal = 0;
  let httpLinks = 0;
  let imageLinksNoAlt = 0;
  const seen = new Set<string>();
  $("a[href]").each((_, el) => {
    const href = ($(el).attr("href") ?? "").trim();
    if (!href || /^(#|mailto:|tel:|javascript:|sms:|data:)/i.test(href)) return;
    const abs = normUrl(href, at, opts.dropQuery);
    if (!abs) return;
    const rel = ($(el).attr("rel") ?? "").toLowerCase();
    const img = $(el).find("img").length > 0;
    const text = $(el).text().replace(/\s+/g, " ").trim();
    const alt = $(el).find("img[alt]").map((__, i) => $(i).attr("alt") ?? "").get().join(" ").trim();
    const anchor = (text || alt || $(el).attr("aria-label") || $(el).attr("title") || "").slice(0, 120);
    const nofollow = /\bnofollow\b/.test(rel);
    const host = new URL(abs).hostname;
    const isIn = internalHost(host);
    if (isIn) {
      if (!anchor) emptyAnchors++;
      if (nofollow) nofollowInternal++;
      if (img && !alt) imageLinksNoAlt++;
      if (abs.startsWith("http://") && url.startsWith("https://")) httpLinks++;
    }
    const key = `${isIn ? "i" : "e"}${abs}`;
    if (seen.has(key)) return;
    seen.add(key);
    if (isIn) {
      if (!NOT_A_PAGE.test(new URL(abs).pathname)) internal.push({ url: abs, anchor, nofollow, img });
    } else external.push({ url: abs, anchor, nofollow, img });
  });

  const imgs = $("img");
  // An empty H1 counts as no H1.
  const h1 = $("h1").map((_, el) => $(el).text().replace(/\s+/g, " ").trim()).get().filter(Boolean);
  const levels = $("h1, h2, h3, h4, h5, h6").map((_, el) => Number(el.tagName.slice(1))).get();
  let headingSkip = false;
  for (let i = 1; i < levels.length; i++) if (levels[i] > levels[i - 1] + 1) headingSkip = true;
  const text = mainText($);
  const words = text ? text.split(" ").length : 0;
  const https = url.startsWith("https://");
  const mixed = https ? $('img[src^="http:"], script[src^="http:"], link[rel="stylesheet" i][href^="http:"], iframe[src^="http:"], video[src^="http:"], audio[src^="http:"], source[src^="http:"]').length : 0;
  const refresh = $('meta[http-equiv="refresh" i]').attr("content") ?? null;
  const bodyKids = $("body").children().not("script, style, noscript, link").length;

  return {
    title: $("head title").first().text().replace(/\s+/g, " ").trim() || $("title").first().text().replace(/\s+/g, " ").trim(),
    titles: $("head title").length,
    description: ($('meta[name="description" i]').first().attr("content") ?? "").replace(/\s+/g, " ").trim(),
    descriptions: $('meta[name="description" i]').length,
    h1,
    headings: levels.length,
    headingSkip,
    canonical: canonicalRaw ? normUrl(canonicalRaw, at) : headerCanon ? normUrl(headerCanon, at) : null,
    canonicalRaw,
    canonicals: canonTags.length + (headerCanon ? 1 : 0),
    metaRobots,
    xRobots,
    noindex: /\b(noindex|none)\b/.test(robots),
    nofollowPage: /\b(nofollow|none)\b/.test(robots),
    lang: ($("html").attr("lang") ?? "").trim(),
    viewport: $('meta[name="viewport" i]').length > 0,
    hreflang: $('link[rel="alternate" i][hreflang]')
      .map((_, el) => ({ lang: ($(el).attr("hreflang") ?? "").trim(), url: normUrl($(el).attr("href") ?? "", at) ?? "" }))
      .get()
      .filter((x) => x.lang && x.url),
    schema,
    schemaInvalid,
    ogImage: $('meta[property="og:image" i], meta[name="og:image" i]').length > 0,
    images: imgs.length,
    imagesNoAlt: imgs.filter((_, el) => $(el).attr("alt") === undefined && $(el).attr("role") !== "presentation" && $(el).attr("aria-hidden") !== "true").length,
    imageLinksNoAlt,
    words,
    textHash: words >= 50 ? hashText(text.toLowerCase()) : "",
    internal: internal.slice(0, 400),
    external: external.slice(0, 100),
    linksOut: internal.length + external.length,
    emptyAnchors,
    nofollowInternal,
    httpLinks,
    mixedContent: mixed,
    metaRefresh: refresh,
    // Almost no text and almost nothing in the body but a root element: the page is built by JavaScript.
    shell: words < 50 && bodyKids <= 2 && $("body script").length > 0,
    bytes: html.length,
  };
}

/** True when a meta refresh sends the visitor somewhere else (not just a reload). */
export function refreshTarget(content: string | null, url: string): string | null {
  if (!content) return null;
  const m = /url\s*=\s*['"]?([^'";]+)/i.exec(content);
  return m ? normUrl(m[1].trim(), url) : null;
}
