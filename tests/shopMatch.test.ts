import assert from "node:assert/strict";
import { test } from "node:test";
import { gtin14 } from "../src/lib/shopCatalog.ts";
import { buildIndex, dhash, hamming, idKeys, lookupMatch, matchCard, nameInTitle, pictureNudge, rivalDictionary, rivalName, type MatchIndex, type MatchProduct } from "../src/lib/shopMatch.ts";
import { cards, catalog, labels } from "./shopMatchData.ts";

// ─────────────── 266 real cards against 7 real catalogs, labeled by hand ───────────────

const indexes = new Map<string, MatchIndex>();
for (const [d, b] of Object.entries(labels.brands)) indexes.set(d, buildIndex(catalog(d), { name: b.name, aliases: b.aliases, domains: [d] }));
const all = cards();
const results = all.map((c) => ({ c, r: matchCard(c.card, indexes.get(c.domain)!) }));

test("over 200 real cards are labeled, about 50 of them the brand's own", () => {
  assert.ok(all.length >= 200, `${all.length} cards`);
  const own = all.filter((c) => c.label !== undefined);
  assert.ok(own.length >= 50, `${own.length} brand cards`);
  assert.equal(own.length, Object.keys(labels.cards).length, "every label points at a real card");
});

test("no wrong matches: never another product, never a bundle or either-or card, never another brand", () => {
  const wrong = results
    .filter(({ c, r }) => (c.label === undefined ? r.verdict !== "other" : c.label === null ? r.verdict === "matched" : r.verdict === "matched" && !r.model!.products.includes(c.label)))
    .map(({ c, r }) => `${c.key}: "${c.card.title}" -> ${r.verdict} ${r.model?.title ?? ""}`);
  assert.deepEqual(wrong, []);
});

test("at least 85% of the brand's labeled products match without asking", () => {
  const labeled = results.filter(({ c }) => typeof c.label === "string");
  const matched = labeled.filter(({ r }) => r.verdict === "matched");
  assert.ok(matched.length / labeled.length >= 0.85, `${matched.length} of ${labeled.length}`);
});

test("real catalogs: colors, shades and genders fold into one model; bundles stay apart", () => {
  const away = indexes.get("awaytravel.com")!;
  const medium = away.models.find((m) => m.title === "The Medium")!;
  assert.ok(medium.products.length > 10, "every color of The Medium is one model");
  const allbirds = indexes.get("allbirds.com")!;
  assert.ok(allbirds.models.find((m) => m.title === "Wool Runner" || m.title === "Men's Wool Runner"), "men's and women's are one model");
  const casper = indexes.get("casper.com")!;
  const dream = casper.models.filter((m) => m.tokens.join(" ") === "dream");
  assert.ok(dream.length >= 2 && dream.some((m) => m.markers.includes("bundle")) && dream.some((m) => !m.markers.length), "Dream and Dream Bundle are two models");
  assert.ok(!casper.models.some((m) => m.priceMax === 0), "$0 checkout items are left out");
});

// ─────────────── The hard cases (section 5.6) ───────────────

const stride: MatchProduct[] = [
  { id: "g3", title: "Stride Glide 3 - Black", price_min: 119, price_max: 119, handle: "glide-3", gtins: ["00012345678905"] },
  { id: "g3b", title: "Stride Glide 3 - Blue", price_min: 119, price_max: 119, handle: "glide-3-blue" },
  { id: "g3w", title: "Stride Glide 3 Wide - Black", price_min: 124, price_max: 124, handle: "glide-3-wide" },
  { id: "g2", title: "Stride Glide 2 - Black", price_min: 99, price_max: 99, handle: "glide-2" },
  { id: "tx", title: "Stride Trail X - Green", price_min: 139, price_max: 149, handle: "trail-x" },
  { id: "kd", title: "Stride Kids Dash - Red", price_min: 59, price_max: 59, handle: "kids-dash" },
  { id: "pk", title: "Stride Running Socks 3 Pack", price_min: 18, price_max: 18, handle: "socks-3-pack" },
];
const idx = buildIndex(stride, { name: "Stride", domains: ["stride.com"] });
const m = (title: string, extra: Partial<Parameters<typeof matchCard>[0]> = {}, opts?: Parameters<typeof matchCard>[2]) => matchCard({ title, ...extra }, idx, opts);

test("Glide 3 against Glide 3 Wide and Glide 2", () => {
  assert.deepEqual([m("Stride Glide 3").verdict, m("Stride Glide 3").model?.products], ["matched", ["g3", "g3b"]]);
  assert.deepEqual(m("Stride Glide 3 Wide").model?.products, ["g3w"]);
  assert.deepEqual(m("Stride Glide 2").model?.products, ["g2"]);
  assert.equal(m("Stride Glide").verdict === "matched", false, "no generation: never a guess");
  assert.equal(m("Stride Glide 4").verdict, "brand", "a generation the catalog doesn't have");
});

test("a reseller's long title still matches, a lookalike from another brand doesn't", () => {
  const r = m("Stride Men's Glide 3 Running Shoe - Black/White Size 10 D(M) US", { seller: "eBay", price: 96 });
  assert.equal(r.verdict, "matched");
  assert.deepEqual(r.model?.products, ["g3", "g3b"]);
  assert.equal(m("Northpeak Glide 3", { seller: "Amazon" }).verdict, "other");
  assert.equal(m("Glide 3 Running Shoe").verdict, "other", "no brand: not ours, however close");
});

test("two-packs, refurbished and samples are never the single product", () => {
  assert.notEqual(m("Stride Glide 3 Twin Pack (2 Pairs)", { price: 219 }).verdict, "matched");
  assert.notEqual(m("Stride Glide 3 (Refurbished)", { price: 74 }).verdict, "matched");
  assert.notEqual(m("Stride Glide 3 & Trail X Bundle").verdict, "matched");
  assert.equal(m("Stride Running Socks 3 Pack").verdict, "matched", "a pack matches the pack");
});

test("telling words: Kids and Trail must be on the card", () => {
  assert.deepEqual(m("Stride Kids Dash").model?.products, ["kd"]);
  assert.notEqual(m("Stride Dash").verdict, "matched");
  assert.deepEqual(m("Stride Trail X Running Shoe").model?.products, ["tx"]);
});

test("a price far off turns a match into a question", () => {
  const r = m("Stride Glide 3", { price: 40 });
  assert.equal(r.verdict, "doubt");
  assert.match(r.why, /price/);
});

test("the store's own link decides, and the brand's store counts as the brand", () => {
  const r = m("Glide Three", { url: "https://www.stride.com/products/glide-3-wide?variant=1", domain: "stride.com" });
  assert.deepEqual([r.verdict, r.how, r.model?.products], ["matched", "link", ["g3w"]]);
  assert.equal(m("Glide 3", { domain: "shop.stride.com" }).verdict, "matched");
});

test("remembered IDs: one gid sold by three stores is one product; a rejected one stays not ours", () => {
  for (const seller of ["Walmart", "eBay", "Zappos"]) assert.equal(m("Glide 3 by Stride (Women's)", { seller }, { remembered: "g3w" }).model?.products[0], "g3w");
  const rejected = m("Stride Glide 3", {}, { remembered: null });
  assert.deepEqual([rejected.verdict, rejected.how], ["other", "id"]);
  assert.deepEqual(idKeys({ title: "Stride Glide 3", gid: "123", engine: "aim" }, idx), ["g:123", "t:3 glide"]);
  assert.deepEqual(idKeys({ title: "Glide 3", productId: "SKU-9", domain: "www.walmart.com", url: "https://www.walmart.com/ip/x/9?utm_source=chatgpt.com", engine: "gpt" }, idx), ["s:walmart.com|SKU-9", "u:walmart.com/ip/x/9", "t:3 glide"]);
});

test("pictures nudge the score only a little", () => {
  const a = Array.from({ length: 72 }, (_, i) => (i * 37) % 255);
  const b = a.map((v, i) => (i % 9 === 4 ? 255 - v : v));
  assert.equal(hamming(dhash(a), dhash(a)), 0);
  assert.ok(hamming(dhash(a), dhash(b)) > 0);
  assert.deepEqual([pictureNudge(4), pictureNudge(15), pictureNudge(30), pictureNudge(null)], [0.1, 0, -0.1, 0]);
  assert.equal(m("Stride Glide 3 Wide", {}, { picture: -0.1 }).verdict, "doubt", "a far picture is a reason to ask");
});

test("Google's product page settles a doubt only with the store's own link or a barcode", () => {
  assert.deepEqual(lookupMatch({ sellers: [{ url: "https://stride.com/products/kids-dash" }] }, idx, gtin14)?.products, ["kd"]);
  assert.deepEqual(lookupMatch({ specifications: [{ specification_name: "GTIN", specification_value: "012345678905" }] }, idx, gtin14)?.products, ["g3", "g3b"]);
  assert.equal(lookupMatch({ specifications: [{ specification_name: "Brand", specification_value: "Stride" }], sellers: [{ url: "https://walmart.com/ip/1" }] }, idx, gtin14), null);
});

test("rival names come from the data, and Claude's name must be in the title", () => {
  const titles = ["Northpeak Pacer 5", "Northpeak Air", "Northpeak Trail Pro", "Velora Swift", "Velora Junior", "Velora Ridge", "Kestrel Comfort"];
  const dict = rivalDictionary(titles);
  assert.equal(rivalName({ title: "Northpeak Pacer 5 Wide" }, dict), "Northpeak");
  assert.equal(rivalName({ title: "Kestrel Comfort", seller: "Kestrel" }, dict), "Kestrel");
  assert.equal(rivalName({ title: "Comfort Runner", seller: "Amazon" }, dict), null);
  assert.equal(nameInTitle("Brooklyn Bedding", "Brooklyn Bedding CopperFlex"), true);
  assert.equal(nameInTitle("Nike", "Pegasus 41"), false);
});
