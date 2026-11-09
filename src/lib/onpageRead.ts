// Read one page for the On-page Audit: PageFacts (as the free AI Answer-Ready Checker reads it) plus the H1, images,
// links, canonical and noindex. No server imports, so tests run it on sample pages.
import * as cheerio from "cheerio";
import type { PageRead } from "./onpage.ts";
import { pageFacts } from "./pageFacts.ts";

const host = (u: string) => {
  try {
    return new URL(u).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
};

export function readOnpage(html: string, url: string, aiBlocked: string[] = []): PageRead {
  const facts = pageFacts(html, url, aiBlocked);
  const $ = cheerio.load(html.slice(0, 3_000_000));
  const imgs = $("body img").filter((_, el) => !/^data:/.test($(el).attr("src") ?? "") && $(el).attr("role") !== "presentation" && $(el).attr("aria-hidden") !== "true");
  const noAlt = imgs.filter((_, el) => !($(el).attr("alt") ?? "").trim()).length;
  const canonical = ($('link[rel="canonical"]').attr("href") ?? "").trim();
  const robots = `${$('meta[name="robots"]').attr("content") ?? ""} ${$('meta[name="googlebot"]').attr("content") ?? ""}`.toLowerCase();
  // Links in the writing only: menus, headers and footers repeat on every page and say nothing about this one.
  const body = cheerio.load($("body").html() ?? "");
  body("nav, header, footer, aside, [role=navigation]").remove();
  const me = host(url);
  const self = url.replace(/#.*$/, "").replace(/\/+$/, "");
  let internal = 0;
  let external = 0;
  const seen = new Set<string>();
  body("a[href]").each((_, a) => {
    const href = (body(a).attr("href") ?? "").trim();
    if (!href || href.startsWith("#") || /^(mailto|tel|javascript):/i.test(href)) return;
    let abs: string;
    try {
      abs = new URL(href, url).toString().replace(/#.*$/, "");
    } catch {
      return;
    }
    if (!/^https?:/i.test(abs) || abs.replace(/\/+$/, "") === self || seen.has(abs)) return;
    seen.add(abs);
    if (host(abs) === me) internal++;
    else external++;
  });
  let path = "/";
  try {
    path = new URL(url).pathname || "/";
  } catch {
    // keep "/"
  }
  return {
    ...facts,
    url,
    path,
    h1Text: $("h1").first().text().replace(/\s+/g, " ").trim(),
    images: imgs.length,
    noAlt,
    internalLinks: internal,
    externalLinks: external,
    canonical: canonical ? (() => { try { return new URL(canonical, url).toString(); } catch { return canonical; } })() : null,
    noindex: /\bnoindex\b/.test(robots),
  };
}
