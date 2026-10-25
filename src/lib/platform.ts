import "server-only";
import { safeFetch } from "./safeFetch.ts";

export type Platform = "wordpress" | "shopify" | "webflow" | "wix" | "squarespace" | "framer" | "gtm" | "other";

/** Read the homepage once: how the site is built, and whether our snippet is already on it. */
export type Snippet = { tag: string | null; delayed: boolean; src: string | null; domains: string[] | null };
export type SiteCheck = { platform: Platform; installed: boolean; reachable: boolean; snippet: Snippet | null };

/** Find our script tag in the page and note anything a speed plugin or a typo would break. */
function readSnippet(html: string, websiteId: string): Snippet | null {
  const tag = html.match(new RegExp(`<script[^>]*${websiteId.replace(/[^a-z0-9-]/gi, "")}[^>]*>`, "i"))?.[0] ?? null;
  if (!tag) return html.toLowerCase().includes(websiteId.toLowerCase()) ? { tag: null, delayed: false, src: null, domains: null } : null;
  const attr = (name: string) => tag.match(new RegExp(`\\s${name}\\s*=\\s*["']([^"']*)["']`, "i"))?.[1] ?? null;
  const type = attr("type");
  return {
    tag,
    // LiteSpeed, WP Rocket and similar plugins rename the type or move src to data-src to load scripts later.
    delayed: Boolean((type && !/^(text|application)\/javascript$|^module$/i.test(type)) || (!attr("src") && attr("data-src"))),
    src: attr("src") ?? attr("data-src"),
    domains: attr("data-domains")?.split(",").map((d) => d.trim().toLowerCase()).filter(Boolean) ?? null,
  };
}

export async function inspectSite(domain: string, websiteId?: string | null): Promise<SiteCheck> {
  const res = await safeFetch(`https://${domain}`, { timeout: 15_000, maxBytes: 3_000_000 });
  if (res.status === 0) return { platform: "other", installed: false, reachable: false, snippet: null };
  const html = res.body;
  const h = html.toLowerCase();
  const platform: Platform = h.includes("cdn.shopify.com") || h.includes("shopify.theme")
    ? "shopify"
    : h.includes("wp-content") || h.includes("wp-includes")
      ? "wordpress"
      : h.includes("webflow")
        ? "webflow"
        : h.includes("static.wixstatic.com") || h.includes("wix.com")
          ? "wix"
          : h.includes("squarespace")
            ? "squarespace"
            : h.includes("framerusercontent") || h.includes("framer.com")
              ? "framer"
              : h.includes("googletagmanager.com/gtm.js")
                ? "gtm"
                : "other";
  return { platform, installed: Boolean(websiteId && h.includes(websiteId.toLowerCase())), reachable: true, snippet: websiteId ? readSnippet(html, websiteId) : null };
}
