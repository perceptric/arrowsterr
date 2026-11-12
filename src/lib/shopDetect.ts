// AI Shopping: does this brand sell products online? (docs/ai-shopping-plan.md, section 3.1). Pure, no network:
// the server fetches a few pages, slims them with slimPage, and decide() reads the slim pages and the other signals.
import * as cheerio from "cheerio";
import { readCards } from "./shopParse.ts";

export type ShopReason = "store" | "site" | "answers" | "cards";

/** What's kept of a page: its JSON-LD blocks and where its links and forms go. Small enough to save as a test fixture. */
export type SlimPage = { url: string; ld: string[]; links: string[]; forms: string[]; buttons: number };

/** Keep only what the check reads. Links are paths on the page's own site, or other hosts' full addresses. */
export function slimPage(html: string, url: string): SlimPage {
  const $ = cheerio.load(html);
  const base = new URL(url);
  const ld = $('script[type="application/ld+json"]')
    .map((_, el) => $(el).text().trim().slice(0, 20_000))
    .get()
    .filter(Boolean)
    .slice(0, 12);
  const where = (href: string | undefined) => {
    if (!href) return null;
    try {
      const u = new URL(href, base);
      if (!/^https?:$/.test(u.protocol)) return null;
      return u.hostname.replace(/^www\./, "") === base.hostname.replace(/^www\./, "") ? u.pathname.toLowerCase() : `${u.hostname}${u.pathname}`.toLowerCase();
    } catch {
      return null;
    }
  };
  const links = [...new Set($("a[href]").map((_, a) => where($(a).attr("href"))).get().filter(Boolean) as string[])].slice(0, 600);
  const forms = [...new Set($("form[action]").map((_, f) => where($(f).attr("action"))).get().filter(Boolean) as string[])].slice(0, 50);
  // "Add to cart" / "Add to bag" buttons, which shops show without a /cart link on some themes.
  const buttons = $("button, input[type=submit], a")
    .filter((_, el) => /^\s*(add to (cart|bag|basket)|buy now)\s*$/i.test($(el).text() || $(el).attr("value") || ""))
    .length;
  return { url, ld, links, forms, buttons };
}

/** True when the JSON-LD holds a Product (or a ProductGroup) with a price in its offers. Software apps don't count. */
export function pricedProduct(ld: string[]): boolean {
  let found = false;
  const walk = (n: unknown): void => {
    if (found || !n) return;
    if (Array.isArray(n)) return n.forEach(walk);
    if (typeof n !== "object") return;
    const o = n as Record<string, unknown>;
    const types = [o["@type"]].flat().map(String);
    if (types.some((t) => /^(Product|ProductGroup|IndividualProduct|ProductModel)$/i.test(t)) && !types.some((t) => /Software|WebApplication|MobileApplication|Service/i.test(t))) {
      if (hasPrice(o.offers) || hasPrice((o.hasVariant as unknown[] | undefined)?.map((v) => (v as Record<string, unknown>)?.offers))) found = true;
    }
    for (const k of ["@graph", "mainEntity", "itemListElement", "item", "hasVariant"]) if (o[k]) walk(o[k]);
  };
  for (const raw of ld) {
    try {
      walk(JSON.parse(raw));
    } catch {
      // Broken JSON-LD counts as none.
    }
    if (found) return true;
  }
  return false;
}

function hasPrice(offers: unknown): boolean {
  if (!offers) return false;
  if (Array.isArray(offers)) return offers.some(hasPrice);
  if (typeof offers !== "object") return false;
  const o = offers as Record<string, unknown>;
  const p = o.price ?? o.lowPrice ?? (o.priceSpecification as Record<string, unknown> | undefined)?.price;
  if (p !== undefined && p !== null && p !== "" && Number(String(p).replace(/[^\d.]/g, "")) > 0) return true;
  return hasPrice(o.offers);
}

const CART = /^\/(cart|basket|bag)(\/|$)|^\/checkout\/cart|\/cart\/add|add[-_]?to[-_]?cart/;

/** A shop's cart: a link or form to /cart, /basket or /bag, an add-to-cart form, or add-to-cart buttons. */
export function hasCart(p: SlimPage): boolean {
  return p.links.some((l) => CART.test(l)) || p.forms.some((f) => CART.test(f)) || p.buttons >= 1;
}

export type SiteFacts = { pages: number; productPages: number; cart: boolean; shopifyProducts: number };

/** Sum up a site's slim pages. shopifyProducts is how many products the public /products.json listed (0 when none). */
export function siteFacts(pages: SlimPage[], shopifyProducts = 0): SiteFacts {
  return { pages: pages.length, productPages: pages.filter((p) => pricedProduct(p.ld)).length, cart: pages.some(hasCart), shopifyProducts };
}

/** Which links on a homepage are worth reading for products: product and collection pages first. */
export function productLinks(home: SlimPage, limit = 6): string[] {
  const own = home.links.filter((l) => l.startsWith("/"));
  const score = (l: string) => (/^\/(products?|p|item|shop\/p)\/[^/]+/.test(l) ? 3 : /^\/(collections|shop|store|category|categories|c)\b/.test(l) ? 2 : 0);
  return own
    .map((l) => [l, score(l)] as const)
    .filter(([, s]) => s > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([l]) => l)
    .slice(0, limit);
}

/** What the "buy <brand>" answers show (one AI Mode answer, one ChatGPT answer). */
export type ProbeFacts = { googleProducts: number; merchantLinks: number; ownCards: number };

const hostOf = (u: string) => {
  try {
    return new URL(u).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
};
const ownHost = (h: string, domain: string) => {
  const d = domain.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
  return Boolean(d) && (h === d || h.endsWith(`.${d}`));
};

/** Every web address anywhere in a result: links, references, and links written inside the answer's markdown. */
function addresses(node: unknown, out: string[] = []): string[] {
  if (typeof node === "string") {
    for (const m of node.matchAll(/https?:\/\/[^\s)"'\]<>]+/g)) out.push(m[0]);
  } else if (Array.isArray(node)) node.forEach((n) => addresses(n, out));
  else if (node && typeof node === "object") Object.values(node).forEach((v) => addresses(v, out));
  return out;
}

/**
 * Read the two "buy <brand>" answers. Google product links (Google Shopping pages, one per product) mean Google treats
 * the brand as something to buy. A link to the brand's own site tagged srsltid means the site is a Google Merchant
 * Center store. A ChatGPT card from the brand's own site means it sells there. Either answer can be missing.
 */
export function probeFacts(aim: unknown, gpt: unknown, domain: string): ProbeFacts {
  const urls = addresses(aim ?? null);
  const products = new Set<string>();
  for (const u of urls) {
    if (!/google\.[a-z.]+\/search\?[^ ]*ibp=oshop/.test(u)) continue;
    const id = /gpcid:(\d+)/.exec(u)?.[1] ?? /PC_(\d+)/.exec(decodeURIComponent(u))?.[1];
    if (id) products.add(id);
  }
  for (const c of readCards("aim", aim).cards) if (c.gid) products.add(c.gid);
  const merchant = new Set(urls.filter((u) => ownHost(hostOf(u), domain) && /[?&]srsltid=/.test(u)).map((u) => u.split("?")[0]));
  const ownCards = readCards("gpt", gpt).cards.filter((c) => c.domain && ownHost(c.domain, domain)).length;
  return { googleProducts: products.size, merchantLinks: merchant.size, ownCards };
}

export type DetectInput = { sources: number; site: SiteFacts | null; probe: ProbeFacts | null; brandCards: number };
export type Detected = { on: boolean; reason: ShopReason | null };

/** The rules of section 3.1, first match wins. None of them means off. */
export function decide(x: DetectInput): Detected {
  if (x.sources > 0) return { on: true, reason: "store" };
  const s = x.site;
  if (s && (s.shopifyProducts > 0 || s.productPages >= 3 || (s.productPages >= 1 && s.cart))) return { on: true, reason: "site" };
  const p = x.probe;
  if (p && (p.googleProducts > 0 || p.merchantLinks > 0 || p.ownCards > 0)) return { on: true, reason: "answers" };
  if (x.brandCards >= 3) return { on: true, reason: "cards" };
  return { on: false, reason: null };
}

export type ShopMode = "auto" | "on" | "off";
/** What the screens use: a switch set by hand wins over Auto. */
export const shopOn = (mode: ShopMode | null | undefined, auto: boolean | null | undefined) => (mode === "on" ? true : mode === "off" ? false : Boolean(auto));

/** True when a card names the brand: its name as a whole word at the start or inside the title, or its store is the brand's. */
export function cardNamesBrand(card: { title: string; seller?: string | null; domain?: string | null }, brand: string, domain: string): boolean {
  const name = brand.trim().toLowerCase();
  const host = domain.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
  if (host && card.domain && (card.domain === host || card.domain.endsWith(`.${host}`))) return true;
  if (!name || name.length < 2) return false;
  const esc = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${esc}([^a-z0-9]|$)`, "i").test(card.title) || (card.seller ? card.seller.toLowerCase() === name : false);
}
