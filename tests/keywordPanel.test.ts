import assert from "node:assert/strict";
import { test } from "node:test";
import { closeVariations, exactKeyword, rankSentence } from "../src/lib/keywordPanel.ts";
import type { Keyword } from "../src/lib/research.ts";

const kw = (keyword: string, volume: number | null, kd: number | null = 20) => ({ keyword, volume, kd, cpc: null, intent: null, trend: [] }) as unknown as Keyword;

test("the keyword's own numbers come from the exact lookup or the same words", () => {
  const rows = [kw("seo", 7480000, 100), kw("ai seo tools", 2400)];
  assert.equal(exactKeyword("AI SEO tools?", rows)?.volume, 2400);
  assert.equal(exactKeyword("ai seo tools", rows, kw("ai seo tools", 2900))?.volume, 2900);
});

test("another keyword's numbers are never borrowed", () => {
  const rows = [kw("seo", 7480000, 100), kw("seo tools", 90000)];
  assert.equal(exactKeyword("arrowsterr ai seo", rows), null);
  assert.equal(exactKeyword("arrowsterr ai seo", rows, kw("seo", 7480000)), null);
  assert.equal(exactKeyword("x", null), null);
});

test("close variations hold every main word, by searches", () => {
  const rows = [kw("seo", 7480000), kw("best ai seo tool", 900), kw("ai seo tools", 2400), kw("ai writing", 50000), kw("free ai seo tools", null), kw("ai seo tools free", 1300)];
  assert.deepEqual(
    closeVariations("ai seo tools", rows).map((r) => r.keyword),
    ["ai seo tools free", "best ai seo tool", "free ai seo tools"],
  );
  assert.deepEqual(
    closeVariations("ai seo tools", rows, 1).map((r) => r.keyword),
    ["ai seo tools free"],
  );
  assert.deepEqual(closeVariations("x", null), []);
});

test("rank sentence says top 3 only when it is", () => {
  assert.equal(rankSentence({ position: 2.4, impressions: 1200, clicks: 140, days: 28, top3Ctr: 0.1 }), "You rank #2, in the top 3, with 1,200 impressions and 140 clicks.");
  assert.equal(rankSentence({ position: 87, impressions: 5, clicks: 0, days: 28, top3Ctr: 0.1 }), "You rank #87 with 5 impressions.");
  assert.equal(rankSentence({ position: 1, impressions: 1, clicks: 1, days: 28, top3Ctr: 0.1 }), "You rank #1, in the top 3, with 1 impression and 1 click.");
  assert.equal(rankSentence({ position: null, impressions: 5, clicks: 0, days: 28, top3Ctr: 0.1 }), null);
});

test("clicks estimate shows only when it is worth reading", () => {
  assert.equal(
    rankSentence({ position: 8, impressions: 3000, clicks: 30, days: 30, top3Ctr: 0.1 }),
    "You rank #8 with 3,000 impressions and 30 clicks. Moving into the top 3 could add about 270 clicks a month.",
  );
  // Far down the results: no estimate, however many impressions.
  assert.equal(rankSentence({ position: 45, impressions: 3000, clicks: 0, days: 30, top3Ctr: 0.1 }), "You rank #45 with 3,000 impressions.");
  // Too few impressions to matter.
  assert.equal(rankSentence({ position: 6, impressions: 20, clicks: 0, days: 30, top3Ctr: 0.1 }), "You rank #6 with 20 impressions.");
});
