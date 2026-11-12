// AI Shopping: read the product cards out of one DataForSEO result. Pure, no network.
// Written against the real responses in tests/fixtures/shop (recorded with scripts/shop-record.mjs);
// docs/ai-shopping-plan.md section 2 lists what each field holds.

export type ShopEngine = "gpt" | "aim";

export type ShopCard = {
  engine: ShopEngine;
  /** Which card row in the answer (1 = first). An answer can hold more than one. */
  block: number;
  /** Place in its row, 1 = first. */
  position: number;
  title: string;
  /** Store as the card names it ("Target", "Brooks Running"). */
  seller: string | null;
  /** The store's web address, without www. Null when the card names no store link. */
  domain: string | null;
  /** The card's link with tracking tags removed. AI Mode links go to Google's product page. */
  url: string | null;
  price: number | null;
  /** Price before a sale, when shown. */
  regular: number | null;
  currency: string | null;
  priceText: string | null;
  priceRange: boolean;
  rating: { value: number; votes: number | null; max: number } | null;
  /** Google's product ID, the same across runs and sellers (AI Mode). */
  gid: string | null;
  /** The engine's own product ID: Google Shopping's catalog ID (AI Mode), or the store's ID (ChatGPT). */
  productId: string | null;
  /** Shopify's product ID when the store runs on Shopify (ChatGPT). */
  shopifyId: string | null;
  /** Google's merchant ID for the main offer (AI Mode). */
  mid: string | null;
  image: string | null;
  /** The engine's label on the card ("Best overall"). */
  tag: string | null;
  /** The AI's own words about the product. */
  text: string | null;
  /** Other stores sell it too ("Target & more"). */
  moreSellers: boolean;
  /** The store sends its products to ChatGPT through OpenAI's product feed. */
  inFeed: boolean;
  /** ChatGPT showed only a name and picture: no store, link or price. */
  nameOnly: boolean;
};

export type ShopRead = { engine: ShopEngine; cards: ShopCard[] };

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : null);
const list = (v: unknown): Obj[] => (Array.isArray(v) ? v.map(obj).filter((x): x is Obj => x !== null) : []);
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : typeof v === "number" ? String(v) : null);
const num = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};

/** The IDs Google packs into a product link's prds= value (gpcid, catalogid, mid, productDocid, headlineOfferDocid). */
export function googleIds(url: string | null | undefined): Record<string, string> {
  if (!url) return {};
  let prds: string | null = null;
  try {
    prds = new URL(url).searchParams.get("prds");
  } catch {
    return {};
  }
  const out: Record<string, string> = {};
  for (const part of (prds ?? "").split(",")) {
    const i = part.indexOf(":");
    if (i > 0) out[part.slice(0, i)] = part.slice(i + 1);
  }
  // rds carries "PC_<gpcid>|PROD_PC_<gpcid>" even when gpcid itself is missing.
  if (!out.gpcid && out.rds) {
    const m = /PC_(\d+)/.exec(decodeURIComponent(out.rds));
    if (m) out.gpcid = m[1];
  }
  return out;
}

/** A card link without the tags stores add for tracking (utm_*, gclid and the like). */
export function cleanLink(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    for (const k of [...u.searchParams.keys()]) if (/^(utm_|gclid$|fbclid$|srsltid$|cmp_|ved$|sa$)/i.test(k)) u.searchParams.delete(k);
    return u.toString();
  } catch {
    return null;
  }
}

const host = (d: string | null) => (d ? d.toLowerCase().replace(/^www\./, "") : null);

function rating(v: unknown): ShopCard["rating"] {
  const r = obj(v);
  const value = num(r?.value);
  if (!r || value === null) return null;
  return { value, votes: num(r.votes_count), max: num(r.rating_max) ?? 5 };
}

function chatGpt(items: Obj[]): ShopCard[] {
  const cards: ShopCard[] = [];
  let block = 0;
  for (const row of items.filter((i) => i.type === "chat_gpt_products")) {
    block++;
    list(row.items)
      .filter((e) => e.type === "chat_gpt_products_element" && str(e.title))
      .forEach((e, i) => {
        const raw = str(e.url);
        const id = str(e.product_id);
        const shopify = id?.startsWith("gid://shopify/") ? id.split("/").pop() ?? null : null;
        const price = num(e.price);
        const seller = str(e.merchants);
        const domain = host(str(e.domain));
        let inFeed = false;
        try {
          inFeed = raw ? new URL(raw).searchParams.get("utm_campaign") === "openai_catalog" : false;
        } catch {}
        cards.push({
          engine: "gpt",
          block,
          position: i + 1,
          title: str(e.title)!,
          seller,
          domain,
          url: cleanLink(raw),
          price,
          regular: null,
          currency: str(e.currency),
          priceText: null,
          priceRange: false,
          rating: rating(e.rating),
          gid: null,
          productId: id,
          shopifyId: shopify,
          mid: null,
          image: Array.isArray(e.images) ? str(e.images[0]) : null,
          tag: str(e.tag),
          text: null,
          moreSellers: false,
          inFeed,
          nameOnly: !raw && !seller && price === null,
        });
      });
  }
  return cards;
}

function aiMode(items: Obj[]): ShopCard[] {
  const cards: ShopCard[] = [];
  let block = 0;
  // Shopping rows sit inside the AI answer (ai_overview), next to its text blocks.
  const rows = items.flatMap((i) => (i.type === "ai_overview_shopping" ? [i] : i.type === "ai_overview" ? list(i.items).filter((b) => b.type === "ai_overview_shopping") : []));
  for (const row of rows) {
    block++;
    list(row.items)
      .filter((e) => e.type === "ai_overview_shopping_element" && str(e.title))
      .forEach((e, i) => {
        const url = str(e.url);
        const ids = googleIds(url);
        const p = obj(e.price);
        const seller = str(e.seller);
        const snippet = str(e.snippet);
        const market = host(str(e.marketplace));
        cards.push({
          engine: "aim",
          block,
          position: i + 1,
          title: str(e.title)!,
          seller,
          domain: market,
          url,
          price: num(p?.current),
          regular: num(p?.regular),
          currency: str(p?.currency),
          priceText: str(p?.displayed_price),
          priceRange: p?.is_price_range === true,
          rating: rating(e.rating),
          gid: str(e.gid) ?? ids.gpcid ?? null,
          productId: str(e.product_id) ?? ids.catalogid ?? null,
          shopifyId: null,
          mid: ids.mid ?? null,
          image: str(e.image_url),
          tag: null,
          text: str(e.text),
          moreSellers: Boolean(snippet && /&\s*more$/i.test(snippet)),
          inFeed: false,
          nameOnly: false,
        });
      });
  }
  return cards;
}

/** Every product card in one task result. Ads (ai_overview_paid) are not cards and are left out. */
export function readCards(engine: ShopEngine, result: unknown): ShopRead {
  const items = list(obj(result)?.items);
  return { engine, cards: engine === "gpt" ? chatGpt(items) : aiMode(items) };
}
