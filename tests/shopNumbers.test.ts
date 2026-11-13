import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { answerSources, readCards } from "../src/lib/shopParse.ts";
import { buildIndex, matchCard, rivalDictionary, rivalName } from "../src/lib/shopMatch.ts";
import { changed, numbers, priceFlags, rate, reasonOk, rollup, storeName, total, weekly, weekOf, type RunInput } from "../src/lib/shopNumbers.ts";
import { catalog, labels } from "./shopMatchData.ts";

// The real answers of 3 brands, each one run, through the whole pipeline: parse, match, roll up, add up.
const DIR = join(import.meta.dirname, "fixtures/shop/match/answers");
function runsFor(domain: string): RunInput[] {
  const b = labels.brands[domain];
  const idx = buildIndex(catalog(domain), { name: b.name, aliases: b.aliases, domains: [domain] });
  const files = readdirSync(DIR).filter((f) => f.startsWith(`${domain.split(".")[0]}--`)).sort();
  const answers = files.map((f) => JSON.parse(readFileSync(join(DIR, f), "utf8")));
  const dict = rivalDictionary(answers.flatMap((a) => readCards(a.engine, a.result).cards.map((c) => c.title)), 2);
  return answers.map((a) => ({
    day: "2026-11-12",
    engine: a.engine,
    promptId: a.prompt,
    sources: answerSources(a.engine, a.result),
    cards: readCards(a.engine, a.result).cards.map((c) => {
      const r = matchCard(c, idx);
      const store = storeName(c.seller, c.domain);
      return { block: c.block, position: c.position, verdict: r.verdict, productId: r.model?.products[0] ?? null, rival: r.verdict === "other" ? rivalName(c, dict) : null, store, own: store?.toLowerCase() === b.name.toLowerCase(), flags: [], links: c.links };
    }),
  }));
}

// Counted by hand from the card lists (scripts: list each run's cards, mark the brand's own by the labels).
test("Allbirds: 11 runs, 6 with cards, 20 cards; yours in 5 runs with 6 cards", () => {
  const t = total(rollup(runsFor("allbirds.com")));
  const n = numbers(t);
  assert.deepEqual([t.runs, t.cardRuns, t.cards, t.you.runs, t.you.cards], [11, 6, 20, 5, 6]);
  assert.equal(n.cardRate?.p, 6 / 11);
  assert.equal(n.productShare, null, "5 of 6 is under 10 runs: Too few runs");
  assert.equal(n.shelfShare?.p, 0.3, "6 of the 20 cards");
  assert.equal(n.avgPosition, 1.2);
  assert.equal(n.visibility, null);
  assert.deepEqual([n.promptsIn, n.prompts, n.productsSeen], [4, 6, 3]);
});

test("Away: 11 runs, 10 with cards, 37 cards; yours in 4 runs at places 1, 2, 1, 2", () => {
  const t = total(rollup(runsFor("awaytravel.com")));
  const n = numbers(t);
  assert.deepEqual([t.runs, t.cardRuns, t.cards, t.you.runs, t.you.cards], [11, 10, 37, 4, 4]);
  assert.equal(n.productShare?.p, 0.4);
  assert.ok(Math.abs(n.productShare!.lo - 0.1682) < 0.001 && Math.abs(n.productShare!.hi - 0.6873) < 0.001, "Wilson 95% for 4 of 10");
  assert.equal(n.shelfShare?.p, 4 / 37);
  assert.equal(n.avgPosition, 1.5);
  assert.ok(Math.abs(n.visibility! - (2 + 2 / Math.log2(3)) / 10) < 1e-9);
  assert.deepEqual([n.promptsIn, n.prompts, n.productsSeen], [4, 6, 3]);
  assert.ok(!t.rivals.has("Away"), "Carl Friedrik's The Carry-On is a rival's");
});

test("Gymshark: 12 runs, 7 with cards, 35 cards; yours in all 6 prompts, at places 2, 2, 5, 2, 2, 1", () => {
  const t = total(rollup(runsFor("gymshark.com")));
  const n = numbers(t);
  assert.deepEqual([t.runs, t.cardRuns, t.cards, t.you.runs, t.you.cards], [12, 7, 35, 6, 6]);
  assert.equal(n.avgPosition, 14 / 6);
  assert.deepEqual([n.promptsIn, n.prompts, n.productsSeen], [6, 6, 3]);
  assert.equal(n.productShare, null);
});

test("Wilson intervals and the change test", () => {
  const r = rate(4, 10)!;
  assert.ok(Math.abs(r.lo - 0.1682) < 0.001 && Math.abs(r.hi - 0.6873) < 0.001);
  assert.equal(rate(3, 9), null, "under 10 runs: Too few runs");
  assert.deepEqual([rate(0, 20)!.lo, rate(20, 20)!.hi], [0, 1]);
  const c = changed(30, 100, 45, 100);
  assert.ok(Math.abs(c.z - 2.191) < 0.01 && Math.abs(c.p - 0.0285) < 0.002 && c.real);
  assert.equal(changed(3, 10, 8, 10).real, false, "fewer than 30 runs a side is never called a change");
  assert.equal(changed(30, 100, 33, 100).real, false);
});

test("weeks start on Monday, and a thin week shows no number", () => {
  assert.equal(weekOf("2026-11-12"), "2026-11-09");
  assert.equal(weekOf("2026-11-09"), "2026-11-09");
  assert.equal(weekOf("2026-11-15"), "2026-11-09");
  const runs = runsFor("awaytravel.com");
  const w = weekly(rollup(runs), []);
  assert.deepEqual(w.map((x) => [x.week, x.you]), [["2026-11-09", 0.4]]);
  assert.equal(weekly(rollup(runsFor("allbirds.com")), [])[0].you, null);
});

test("one name per store", () => {
  assert.equal(storeName("Walmart - DiscountsJungle + others", null), "Walmart");
  assert.equal(storeName("Amazon.com", null), "Amazon");
  assert.equal(storeName(null, "www.amazon.com"), "Amazon");
  assert.equal(storeName("Gymshark US", "us.checkout.gymshark.com"), "Gymshark");
  assert.equal(storeName("Away: Built for modern travel", "awaytravel.com"), "Away");
  assert.equal(storeName(null, "www.scheels.com"), "Scheels");
  assert.equal(storeName("Ulta Beauty", "www.ulta.com"), "Ulta Beauty");
  assert.equal(storeName(null, null), null);
});

test("price checks: your store wrong is flagged, another store is a gap, plus floor, stock and resellers", () => {
  const base = { currency: "USD", catalogMin: 119, catalogMax: 119, catalogCurrency: "USD", inStock: true, floorPct: null, retailer: true, retailersSet: true };
  assert.deepEqual(priceFlags({ ...base, price: 129, own: true }), ["own_price"]);
  assert.deepEqual(priceFlags({ ...base, price: 119.99, own: true }), [], "under $1 off is the same price");
  assert.deepEqual(priceFlags({ ...base, price: 129, own: false }), ["price_gap"]);
  assert.deepEqual(priceFlags({ ...base, price: 80, own: false, floorPct: 80 }), ["price_gap", "below_floor"]);
  assert.deepEqual(priceFlags({ ...base, price: 119, own: false, retailer: false }), ["reseller"]);
  assert.deepEqual(priceFlags({ ...base, price: 119, own: false, retailer: false, retailersSet: false }), [], "no retailer list: nobody is a reseller");
  assert.deepEqual(priceFlags({ ...base, price: 119, own: true, inStock: false }), ["out_of_stock"]);
  assert.deepEqual(priceFlags({ ...base, price: 99, own: true, currency: "EUR" }), [], "other currencies aren't compared");
  assert.deepEqual(priceFlags({ ...base, price: 125, own: false, catalogMin: 110, catalogMax: 130 }), [], "inside the range");
});

test("a reason counts only when its words come from the AI's own text", () => {
  const text = "Price: ~$175\nWhy it works: The Ghost is practically the gold standard for a first running shoe, soft and stable.";
  assert.equal(reasonOk("Gold standard first running shoe, soft and stable", text), true);
  assert.equal(reasonOk("Best value cushioning for marathons", text), false);
  assert.equal(reasonOk("", text), false);
});
