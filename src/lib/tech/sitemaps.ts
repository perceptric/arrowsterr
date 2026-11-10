import { normUrl } from "./url.ts";

// Reading sitemaps for the crawler. Pure: XML text in, the addresses it lists out.

export type SitemapRead = { kind: "index" | "urlset" | "bad"; locs: string[] };

/** A sitemap index's child sitemaps, or a sitemap's page addresses. Anything else is bad XML. */
export function parseSitemap(xml: string): SitemapRead {
  const text = xml.replace(/^﻿/, "").trim();
  const isIndex = /<sitemapindex[\s>]/i.test(text);
  const isSet = /<urlset[\s>]/i.test(text);
  if (!isIndex && !isSet) return { kind: "bad", locs: [] };
  const locs: string[] = [];
  const re = /<loc>\s*(?:<!\[CDATA\[)?\s*([^<\]]+?)\s*(?:\]\]>)?\s*<\/loc>/gi;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const u = normUrl(m[1].replace(/&amp;/g, "&").trim());
    if (u) locs.push(u);
  }
  return { kind: isIndex ? "index" : "urlset", locs };
}

/** Sitemap addresses listed in robots.txt. */
export function robotsSitemaps(robots: string): string[] {
  return robots
    .split(/\r?\n/)
    .map((l) => /^\s*sitemap\s*:\s*(\S+)/i.exec(l)?.[1])
    .filter((x): x is string => Boolean(x))
    .map((x) => normUrl(x))
    .filter((x): x is string => Boolean(x));
}
