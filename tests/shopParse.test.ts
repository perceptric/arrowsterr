import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { cleanLink, googleIds, readCards, type ShopEngine } from "../src/lib/shopParse.ts";

// Real ChatGPT and AI Mode answers, recorded with scripts/shop-record.mjs (40 prompts each).
const DIR = join(import.meta.dirname, "fixtures/shop");
type Fixture = { prompt: string; kind: "shop" | "none"; engine: ShopEngine; result: unknown; file: string };
const load = (eng: ShopEngine): Fixture[] =>
  readdirSync(join(DIR, eng))
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => ({ ...JSON.parse(readFileSync(join(DIR, eng, f), "utf8")), file: f }));
const gpt = load("gpt");
const aim = load("aim");

/** Count the raw elements of a type anywhere in a result, to check the parser drops none. */
function countRaw(node: unknown, type: string): number {
  if (Array.isArray(node)) return node.reduce((n, x) => n + countRaw(x, type), 0);
  if (!node || typeof node !== "object") return 0;
  const o = node as Record<string, unknown>;
  return (o.type === type ? 1 : 0) + Object.values(o).reduce<number>((n, v) => n + countRaw(v, type), 0);
}

test("all 80 recorded answers are there", () => {
  assert.equal(gpt.length, 40);
  assert.equal(aim.length, 40);
});

for (const [eng, set, type] of [["gpt", gpt, "chat_gpt_products_element"], ["aim", aim, "ai_overview_shopping_element"]] as const) {
  test(`${eng}: every card in every answer is read, numbered and complete`, () => {
    let total = 0;
    for (const f of set) {
      const { cards } = readCards(eng, f.result);
      assert.equal(cards.length, countRaw(f.result, type), f.file);
      total += cards.length;
      const blocks = new Set(cards.map((c) => c.block));
      for (const b of blocks) {
        const pos = cards.filter((c) => c.block === b).map((c) => c.position);
        assert.deepEqual(pos, pos.map((_, i) => i + 1), `${f.file} block ${b}`);
      }
      for (const c of cards) {
        assert.ok(c.title.length > 0, f.file);
        if (c.price !== null) assert.ok(c.price > 0 && c.currency === "USD", `${f.file} ${c.title}`);
        if (c.rating) assert.ok(c.rating.value > 0 && c.rating.value <= c.rating.max, `${f.file} ${c.title}`);
        if (c.url) assert.doesNotMatch(c.url, eng === "gpt" ? /utm_/ : /^$/, `${f.file} ${c.title}`);
      }
    }
    assert.ok(total > 50, `${eng} has ${total} cards`);
  });
}

test("prompts that aren't about buying things show no cards", () => {
  for (const f of [...gpt, ...aim].filter((x) => x.kind === "none")) assert.equal(readCards(f.engine, f.result).cards.length, 0, `${f.engine} ${f.prompt}`);
});

test("AI Mode cards carry Google's product IDs, the same as in their links", () => {
  const cards = aim.flatMap((f) => readCards("aim", f.result).cards);
  for (const c of cards) {
    const ids = googleIds(c.url);
    assert.ok(c.gid, `${c.title} has a gid`);
    assert.equal(c.gid, ids.gpcid, c.title);
    assert.match(c.gid!, /^\d{6,}$/);
    assert.ok(c.productId, c.title);
    assert.ok(c.seller, c.title);
    assert.ok(c.price !== null && c.priceText, c.title);
    assert.ok(c.image?.startsWith("https://"), c.title);
    assert.ok(c.text, c.title);
  }
  assert.ok(cards.filter((c) => c.mid).length / cards.length > 0.9, "most cards name the merchant");
  assert.ok(cards.some((c) => c.moreSellers) && cards.some((c) => !c.moreSellers));
});

test("a missing gid is taken from the link's rds value", () => {
  const url = "https://www.google.com/search?ibp=oshop&prds=pvt:hg,pvo:29,headlineOfferDocid:39,productDocid:39,rds:PC_7737188067976392393%7CPROD_PC_7737188067976392393&q=product";
  assert.equal(googleIds(url).gpcid, "7737188067976392393");
  const raw = { items: [{ type: "ai_overview", items: [{ type: "ai_overview_shopping", items: [{ type: "ai_overview_shopping_element", title: "Toleriane", gid: null, product_id: null, url, price: { current: 24.97, currency: "USD" } }] }] }] };
  assert.equal(readCards("aim", raw).cards[0].gid, "7737188067976392393");
});

test("ChatGPT cards: store IDs, Shopify IDs, feed tags and name-only cards", () => {
  const cards = gpt.flatMap((f) => readCards("gpt", f.result).cards);
  assert.ok(cards.every((c) => c.gid === null), "ChatGPT cards carry no Google ID");
  const shopify = cards.filter((c) => c.shopifyId);
  assert.ok(shopify.length > 0 && shopify.every((c) => /^[A-Za-z0-9]+$/.test(c.shopifyId!)));
  assert.ok(cards.some((c) => c.inFeed));
  const nameOnly = cards.filter((c) => c.nameOnly);
  assert.ok(nameOnly.length > 0 && nameOnly.every((c) => !c.url && !c.seller && c.price === null));
  assert.ok(cards.filter((c) => c.domain).every((c) => !c.domain!.startsWith("www.")));
  assert.ok(cards.some((c) => c.tag));
});

test("ChatGPT ads and AI Mode ads are never read as cards", () => {
  const raw = {
    items: [
      { type: "ai_overview", items: [{ type: "ai_overview_paid", items: [{ type: "ai_overview_paid_element", title: "Mattress sale", website_name: "Nectar" }] }] },
      { type: "chat_gpt_ad", items: [{ title: "Sponsored shoe" }] },
    ],
  };
  assert.equal(readCards("aim", raw).cards.length, 0);
  assert.equal(readCards("gpt", raw).cards.length, 0);
});

test("broken or empty results give no cards and no error", () => {
  for (const r of [null, undefined, {}, { items: null }, { items: "x" }, { items: [{ type: "chat_gpt_products", items: [{ type: "chat_gpt_products_element", title: "" }] }] }]) {
    assert.deepEqual(readCards("gpt", r).cards, []);
    assert.deepEqual(readCards("aim", r).cards, []);
  }
});

test("tracking tags come off card links", () => {
  assert.equal(
    cleanLink("https://www.winkbeds.com/products/x?utm_campaign=openai_catalog&utm_content=product_card&variant=33&utm_source=chatgpt.com"),
    "https://www.winkbeds.com/products/x?variant=33",
  );
  assert.equal(cleanLink("not a link"), null);
});
