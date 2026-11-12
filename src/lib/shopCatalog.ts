// AI Shopping: the brand's catalog (docs/ai-shopping-plan.md, section 3). Pure, no network, so tests run it.
// Shopify, Google Merchant Center and CSV files all become the same product rows, with variants folded in.

export type CatalogSource = "shopify" | "merchant" | "csv";

/** One sellable version of a product (a size or color), as a source gives it. */
export type SourceVariant = { sku?: string | null; gtin?: string | null; mpn?: string | null; price?: number | null; currency?: string | null; inStock?: boolean | null };

/** One product as a source gives it, before folding. */
export type SourceProduct = {
  externalId: string;
  title: string;
  brand?: string | null;
  url?: string | null;
  handle?: string | null;
  image?: string | null;
  type?: string | null;
  variants: SourceVariant[];
};

/** One row of shop_catalog. */
export type CatalogRow = {
  external_id: string;
  title: string;
  brand: string | null;
  url: string | null;
  handle: string | null;
  image: string | null;
  product_type: string | null;
  skus: string[];
  gtins: string[];
  mpns: string[];
  price_min: number | null;
  price_max: number | null;
  currency: string | null;
  in_stock: boolean | null;
  variants: number;
};

const clean = (s: unknown): string | null => {
  if (typeof s !== "string" && typeof s !== "number") return null;
  const t = String(s).replace(/\s+/g, " ").trim();
  return t ? t : null;
};

/** A GTIN (UPC, EAN, ISBN-13) as 14 digits, or null when it isn't a valid one. The check digit must add up. */
export function gtin14(raw: unknown): string | null {
  const d = String(raw ?? "").replace(/[\s-]/g, "");
  if (!/^\d{8}$|^\d{12,14}$/.test(d)) return null;
  const g = d.padStart(14, "0");
  if (/^0+$/.test(g)) return null;
  let sum = 0;
  for (let i = 0; i < 13; i++) sum += Number(g[i]) * (i % 2 === 0 ? 3 : 1);
  return (10 - (sum % 10)) % 10 === Number(g[13]) ? g : null;
}

/** A price as a number: "$1,299.00", "149.95 USD", 99 or "99,95" (comma decimal). Null when it isn't a price. */
export function priceOf(raw: unknown): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) && raw >= 0 ? Math.round(raw * 100) / 100 : null;
  if (typeof raw !== "string") return null;
  let s = raw.replace(/[^\d.,]/g, "");
  if (!s) return null;
  // "1.299,95" and "99,95" use a comma for cents; "1,299.95" and "1,299" use it for thousands.
  if (/,\d{1,2}$/.test(s)) s = s.replace(/\./g, "").replace(",", ".");
  else s = s.replace(/,/g, "");
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
}

const uniq = (list: (string | null | undefined)[]) => [...new Set(list.filter((x): x is string => Boolean(x)))];

/** Fold a source's products into catalog rows. Products with the same ID are merged; ones with no title are dropped. */
export function fold(products: SourceProduct[]): CatalogRow[] {
  const byId = new Map<string, SourceProduct>();
  for (const p of products) {
    const id = clean(p.externalId);
    const title = clean(p.title);
    if (!id || !title) continue;
    const had = byId.get(id);
    if (had) had.variants.push(...p.variants);
    else byId.set(id, { ...p, externalId: id, title, variants: [...p.variants] });
  }
  return [...byId.values()].map((p) => {
    const prices = p.variants.map((v) => v.price).filter((x): x is number => typeof x === "number" && x > 0);
    const stock = p.variants.map((v) => v.inStock).filter((x): x is boolean => typeof x === "boolean");
    return {
      external_id: p.externalId,
      title: p.title,
      brand: clean(p.brand),
      url: clean(p.url),
      handle: clean(p.handle),
      image: clean(p.image),
      product_type: clean(p.type),
      skus: uniq(p.variants.map((v) => clean(v.sku))),
      gtins: uniq(p.variants.map((v) => gtin14(v.gtin))),
      mpns: uniq(p.variants.map((v) => clean(v.mpn))),
      price_min: prices.length ? Math.min(...prices) : null,
      price_max: prices.length ? Math.max(...prices) : null,
      currency: clean(p.variants.find((v) => v.currency)?.currency)?.toUpperCase() ?? null,
      in_stock: stock.length ? stock.some(Boolean) : null,
      variants: Math.max(1, p.variants.length),
    };
  });
}

// ─────────────── Shopify ───────────────

/** The Admin GraphQL query for one page of products. 25 products × 30 variants keeps each page under Shopify's cost limit. */
export const SHOPIFY_PRODUCTS = `query Products($after: String) {
  shop { currencyCode primaryDomain { url } }
  products(first: 25, after: $after, query: "status:active") {
    pageInfo { hasNextPage endCursor }
    nodes {
      id title vendor productType handle onlineStoreUrl
      featuredMedia { preview { image { url } } }
      variants(first: 30) { pageInfo { hasNextPage } nodes { sku barcode price availableForSale } }
    }
  }
}`;

type ShopifyNode = {
  id: string;
  title: string;
  vendor?: string | null;
  productType?: string | null;
  handle: string;
  onlineStoreUrl?: string | null;
  featuredMedia?: { preview?: { image?: { url?: string } | null } | null } | null;
  variants?: { nodes?: { sku?: string | null; barcode?: string | null; price?: string | number | { amount?: string } | null; availableForSale?: boolean | null }[] };
};
export type ShopifyPage = {
  shop?: { currencyCode?: string; primaryDomain?: { url?: string } };
  products: { pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: ShopifyNode[] };
};

export function fromShopify(page: ShopifyPage): SourceProduct[] {
  const currency = page.shop?.currencyCode ?? null;
  const origin = page.shop?.primaryDomain?.url?.replace(/\/$/, "") ?? null;
  return page.products.nodes.map((n) => ({
    externalId: n.id.split("/").pop() ?? n.id,
    title: n.title,
    brand: n.vendor ?? null,
    url: n.onlineStoreUrl ?? (origin ? `${origin}/products/${n.handle}` : null),
    handle: n.handle,
    image: n.featuredMedia?.preview?.image?.url ?? null,
    type: n.productType ?? null,
    variants: (n.variants?.nodes ?? []).map((v) => ({
      sku: v.sku,
      gtin: v.barcode,
      price: priceOf(typeof v.price === "object" && v.price ? v.price.amount : v.price),
      currency,
      inStock: v.availableForSale ?? null,
    })),
  }));
}

// ─────────────── Google Merchant Center (Merchant API, products v1) ───────────────

type Money = { amountMicros?: string | number; currencyCode?: string } | null | undefined;
type MerchantAttrs = {
  title?: string;
  brand?: string;
  link?: string;
  imageLink?: string;
  gtins?: string[];
  gtin?: string[] | string;
  mpn?: string;
  price?: Money;
  salePrice?: Money;
  availability?: string;
  itemGroupId?: string;
  productTypes?: string[];
};
export type MerchantProduct = { name?: string; offerId?: string; productAttributes?: MerchantAttrs; attributes?: MerchantAttrs };

const money = (m: Money) => (m?.amountMicros !== undefined ? Math.round(Number(m.amountMicros) / 10_000) / 100 : null);

/** Merchant Center lists every variant as its own product; ones that share an item group become one product. */
export function fromMerchant(items: MerchantProduct[]): SourceProduct[] {
  return items.map((it) => {
    // v1 names the field productAttributes; the older v1beta named it attributes.
    const a = it.productAttributes ?? it.attributes ?? {};
    const offer = it.offerId ?? it.name?.split("/").pop() ?? "";
    const sale = money(a.salePrice);
    const gtins = a.gtins ?? (Array.isArray(a.gtin) ? a.gtin : a.gtin ? [a.gtin] : []);
    return {
      externalId: a.itemGroupId || offer,
      title: a.title ?? "",
      brand: a.brand ?? null,
      url: a.link ?? null,
      handle: null,
      image: a.imageLink ?? null,
      type: a.productTypes?.[0] ?? null,
      variants: (gtins.length ? gtins : [null]).map((g) => ({
        sku: offer || null,
        gtin: g,
        mpn: a.mpn ?? null,
        price: sale ?? money(a.price),
        currency: a.price?.currencyCode ?? null,
        inStock: a.availability ? /^in[_ ]?stock$/i.test(a.availability) || /^(preorder|backorder)$/i.test(a.availability) : null,
      })),
    };
  });
}

// ─────────────── CSV ───────────────

/** Split CSV text into rows. Handles quoted fields, "" inside quotes, commas or semicolons, and \r\n. */
export function csvRows(text: string): string[][] {
  const body = text.replace(/^﻿/, "");
  const firstLine = body.split(/\r?\n/, 1)[0] ?? "";
  const sep = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : (firstLine.match(/\t/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? "\t" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (quoted) {
      if (ch === '"' && body[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell === "") quoted = true;
    else if (ch === sep) {
      row.push(cell);
      cell = "";
    }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && body[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some((c) => c.trim())) rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim())) rows.push(row);
  return rows;
}

const HEADS: Record<keyof Omit<SourceProduct, "variants" | "externalId"> | "id" | "group" | "sku" | "gtin" | "mpn" | "price" | "currency" | "stock", RegExp> = {
  id: /^(id|product[ _]?id|offer[ _]?id)$/i,
  group: /^(item[ _]?group[ _]?id|parent[ _]?(id|sku)|handle)$/i,
  title: /^(title|name|product[ _]?(name|title))$/i,
  brand: /^(brand|vendor|manufacturer)$/i,
  url: /^(url|link|product[ _]?(url|link)|page)$/i,
  handle: /^$/,
  image: /^(image|image[ _]?(url|link|src)|picture)$/i,
  type: /^(type|product[ _]?type|category)$/i,
  sku: /^(sku|variant[ _]?sku|item[ _]?sku)$/i,
  gtin: /^(gtin|barcode|upc|ean|isbn|variant[ _]?barcode)$/i,
  mpn: /^(mpn|model|model[ _]?number)$/i,
  price: /^(price|variant[ _]?price|sale[ _]?price|current[ _]?price)$/i,
  currency: /^(currency|currency[ _]?code)$/i,
  stock: /^(availability|in[ _]?stock|stock|available)$/i,
};

export type CsvResult = { products: SourceProduct[]; rows: number; skipped: number; missing: string[] };

/** Read a catalog CSV. Needs a title column; rows of one product (same group, URL or title) fold into its variants. */
export function fromCsv(text: string): CsvResult {
  const rows = csvRows(text);
  const head = (rows.shift() ?? []).map((h) => h.trim());
  const col = Object.fromEntries(Object.entries(HEADS).map(([k, re]) => [k, head.findIndex((h) => re.test(h))])) as Record<keyof typeof HEADS, number>;
  if (col.title < 0) return { products: [], rows: rows.length, skipped: rows.length, missing: ["title"] };
  const get = (r: string[], k: keyof typeof HEADS) => (col[k] >= 0 ? (r[col[k]] ?? "").trim() || null : null);
  let skipped = 0;
  const products: SourceProduct[] = [];
  for (const r of rows) {
    const title = get(r, "title");
    if (!title) {
      skipped++;
      continue;
    }
    const url = get(r, "url");
    const stock = get(r, "stock");
    products.push({
      externalId: get(r, "group") ?? url ?? get(r, "id") ?? title.toLowerCase(),
      title,
      brand: get(r, "brand"),
      url: url && /^https?:\/\//i.test(url) ? url : null,
      image: get(r, "image"),
      type: get(r, "type"),
      variants: [
        {
          sku: get(r, "sku") ?? get(r, "id"),
          gtin: get(r, "gtin"),
          mpn: get(r, "mpn"),
          price: priceOf(get(r, "price")),
          currency: get(r, "currency") ?? (/€/.test(get(r, "price") ?? "") ? "EUR" : /£/.test(get(r, "price") ?? "") ? "GBP" : /\$/.test(get(r, "price") ?? "") ? "USD" : null),
          inStock: stock === null ? null : /^(1|y|yes|true|in[ _]?stock|available|preorder|backorder)$/i.test(stock),
        },
      ],
    });
  }
  return { products, rows: rows.length, skipped, missing: [] };
}

// ─────────────── Paging (the server passes the real API calls in, tests pass fakes) ───────────────

/** Every active product in a Shopify store, page by page. Stops at 200 pages (5,000 products). */
export async function pullShopify(gql: (after: string | null) => Promise<ShopifyPage>): Promise<SourceProduct[]> {
  const out: SourceProduct[] = [];
  let after: string | null = null;
  for (let i = 0; i < 200; i++) {
    const page = await gql(after);
    out.push(...fromShopify(page));
    if (!page.products.pageInfo.hasNextPage || !page.products.pageInfo.endCursor) break;
    after = page.products.pageInfo.endCursor;
  }
  return out;
}

export type MerchantPage = { products?: MerchantProduct[]; nextPageToken?: string };

/** Every product in a Merchant Center account, page by page (up to 1,000 a page). Stops at 50 pages. */
export async function pullMerchant(list: (pageToken: string | null) => Promise<MerchantPage>): Promise<SourceProduct[]> {
  const out: SourceProduct[] = [];
  let token: string | null = null;
  for (let i = 0; i < 50; i++) {
    const page = await list(token);
    out.push(...fromMerchant(page.products ?? []));
    if (!page.nextPageToken) break;
    token = page.nextPageToken;
  }
  return out;
}
