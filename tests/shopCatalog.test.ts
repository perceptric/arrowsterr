import assert from "node:assert/strict";
import { test } from "node:test";
import { csvRows, fold, fromCsv, fromMerchant, gtin14, priceOf, pullMerchant, pullShopify, type ShopifyPage } from "../src/lib/shopCatalog.ts";

test("GTINs become 14 digits and a wrong check digit is refused", () => {
  assert.equal(gtin14("012345678905"), "00012345678905"); // UPC-A
  assert.equal(gtin14("4006381333931"), "04006381333931"); // EAN-13
  assert.equal(gtin14("9780306406157"), "09780306406157"); // ISBN-13
  assert.equal(gtin14("96385074"), "00000096385074"); // EAN-8
  assert.equal(gtin14("012345678906"), null);
  assert.equal(gtin14("0000000000000"), null);
  assert.equal(gtin14("SKU-123"), null);
  assert.equal(gtin14(null), null);
});

test("prices read every common way of writing them", () => {
  assert.equal(priceOf("$1,299.00"), 1299);
  assert.equal(priceOf("149.95 USD"), 149.95);
  assert.equal(priceOf("99,95 €"), 99.95);
  assert.equal(priceOf("1.299,95"), 1299.95);
  assert.equal(priceOf(119), 119);
  assert.equal(priceOf("free"), null);
  assert.equal(priceOf(-3), null);
});

// A Shopify store with 42 products over two pages, the way the Admin GraphQL API returns them.
function store(): ShopifyPage[] {
  const node = (i: number) => ({
    id: `gid://shopify/Product/${1000 + i}`,
    title: `Stride Product ${i}`,
    vendor: "Stride",
    productType: i % 2 ? "Shoes" : "Apparel",
    handle: `stride-product-${i}`,
    onlineStoreUrl: i === 3 ? null : `https://stride.com/products/stride-product-${i}`,
    featuredMedia: { preview: { image: { url: `https://cdn.shopify.com/${i}.jpg` } } },
    variants: {
      nodes: Array.from({ length: 1 + (i % 7) }, (_, v) => ({
        sku: `ST-${i}-${v}`,
        barcode: v === 0 && i === 1 ? "012345678905" : null,
        price: String(100 + v * 10),
        availableForSale: v !== 0,
      })),
    },
  });
  const shop = { currencyCode: "USD", primaryDomain: { url: "https://stride.com" } };
  return [
    { shop, products: { pageInfo: { hasNextPage: true, endCursor: "c25" }, nodes: Array.from({ length: 25 }, (_, i) => node(i + 1)) } },
    { shop, products: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: Array.from({ length: 17 }, (_, i) => node(i + 26)) } },
  ];
}

test("a Shopify store's 42 products load over two pages with variants folded in", async () => {
  const pages = store();
  const asked: (string | null)[] = [];
  const rows = fold(await pullShopify(async (after) => (asked.push(after), pages[after ? 1 : 0])));
  assert.deepEqual(asked, [null, "c25"]);
  assert.equal(rows.length, 42);
  const p1 = rows.find((r) => r.external_id === "1001")!;
  assert.equal(p1.variants, 2);
  assert.deepEqual(p1.skus, ["ST-1-0", "ST-1-1"]);
  assert.deepEqual(p1.gtins, ["00012345678905"]);
  assert.equal(p1.price_min, 100);
  assert.equal(p1.price_max, 110);
  assert.equal(p1.currency, "USD");
  assert.equal(p1.in_stock, true, "one variant for sale means in stock");
  assert.equal(p1.handle, "stride-product-1");
  assert.equal(p1.image, "https://cdn.shopify.com/1.jpg");
  assert.equal(rows.find((r) => r.external_id === "1003")!.url, "https://stride.com/products/stride-product-3", "no store URL falls back to the domain and handle");
  const lone = rows.find((r) => r.external_id === "1007")!;
  assert.equal(lone.variants, 1);
  assert.equal(lone.in_stock, false);
});

test("Merchant Center variants with one item group become one product", async () => {
  const item = (offer: string, group: string | undefined, gtin: string, micros: number, sale?: number) => ({
    name: `accounts/1/products/online~en~US~${offer}`,
    offerId: offer,
    productAttributes: { title: "Stride Glide 3", brand: "Stride", link: "https://stride.com/products/glide-3", imageLink: "https://x/1.jpg", gtins: [gtin], itemGroupId: group, price: { amountMicros: String(micros), currencyCode: "USD" }, salePrice: sale ? { amountMicros: String(sale), currencyCode: "USD" } : undefined, availability: offer.endsWith("9") ? "OUT_OF_STOCK" : "IN_STOCK" },
  });
  const pages = [{ products: [item("G3-8", "G3", "012345678905", 119_000_000), item("G3-9", "G3", "4006381333931", 119_000_000, 99_000_000)], nextPageToken: "p2" }, { products: [item("T1", undefined, "96385074", 139_990_000)] }];
  const rows = fold(await pullMerchant(async (t) => pages[t ? 1 : 0]));
  assert.equal(rows.length, 2);
  const g3 = rows.find((r) => r.external_id === "G3")!;
  assert.equal(g3.variants, 2);
  assert.deepEqual(g3.skus, ["G3-8", "G3-9"]);
  assert.equal(g3.price_min, 99, "the sale price is what shoppers see");
  assert.equal(g3.price_max, 119);
  assert.equal(g3.in_stock, true);
  assert.equal(rows.find((r) => r.external_id === "T1")!.price_min, 139.99);
  // The older v1beta field name still reads.
  assert.equal(fromMerchant([{ offerId: "A", attributes: { title: "Old", price: { amountMicros: "5000000", currencyCode: "USD" } } }])[0].variants[0].price, 5);
});

test("CSV rows: quotes, commas, semicolons and line breaks", () => {
  assert.deepEqual(csvRows('title,price\n"Glide 3, Wide",119\n"Say ""hi""",5\r\n'), [["title", "price"], ["Glide 3, Wide", "119"], ['Say "hi"', "5"]]);
  assert.deepEqual(csvRows("name;price\nTee;9,99\n"), [["name", "price"], ["Tee", "9,99"]]);
  assert.deepEqual(csvRows('title,notes\n"Two\nlines",x'), [["title", "notes"], ["Two\nlines", "x"]]);
});

test("a CSV catalog folds sizes into one product and reads common column names", () => {
  const csv = ["Handle,Title,Vendor,Variant SKU,Variant Barcode,Variant Price,URL", "glide-3,Stride Glide 3,Stride,G3-8,012345678905,$119.00,https://stride.com/products/glide-3", "glide-3,Stride Glide 3,Stride,G3-9,,$119.00,https://stride.com/products/glide-3", ",,,,,,", "tempo,Stride Tempo,Stride,T-1,,99,https://stride.com/products/tempo"].join("\n");
  const r = fromCsv(csv);
  assert.equal(r.skipped, 0);
  const rows = fold(r.products);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0].skus, ["G3-8", "G3-9"]);
  assert.equal(rows[0].brand, "Stride");
  assert.equal(rows[0].currency, "USD");
  assert.equal(rows[1].price_min, 99);
  assert.deepEqual(fromCsv("sku,price\nA,1\n").missing, ["title"]);
  assert.equal(fromCsv("title,price\n,5\nTee,5\n").skipped, 1);
});

test("rows with no title or ID are dropped, and repeats merge", () => {
  const rows = fold([
    { externalId: "1", title: "A", variants: [{ price: 5 }] },
    { externalId: "1", title: "A", variants: [{ price: 7 }] },
    { externalId: "", title: "B", variants: [] },
    { externalId: "3", title: "  ", variants: [] },
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].price_max, 7);
  assert.equal(rows[0].in_stock, null);
});
