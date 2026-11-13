import assert from "node:assert/strict";
import { test } from "node:test";
import { ctrOf, DAILY_DEPTH, DEEP_DEPTH, deepWeekday, depthFor, featuresOf, findPosition, moveOf, positionLabel, readKeywords, readTarget, samePage, summarize } from "../src/lib/rankTrack.ts";

test("a target is a domain or one page", () => {
  assert.deepEqual(readTarget("https://www.Stride.com/"), { target: "stride.com", scope: "domain" });
  assert.deepEqual(readTarget("stride.com/blog/best-shoes/?utm=x"), { target: "stride.com/blog/best-shoes", scope: "url" });
  assert.equal(readTarget("not a site"), null);
  assert.equal(readTarget(""), null);
});

test("pages match without scheme, www, query or trailing slash", () => {
  assert.equal(samePage("https://www.stride.com/blog/x/?a=1#b"), "stride.com/blog/x");
  assert.equal(samePage("stride.com/blog/x"), "stride.com/blog/x");
});

const SERP = [
  { rank: 1, url: "https://www.rei.com/learn/running-shoes" },
  { rank: 2, url: "https://shop.stride.com/glide-3" },
  { rank: 3, url: "https://stride.com/blog/best-shoes/" },
  { rank: 4, url: "https://notstride.com/blog/best-shoes" },
];

test("a domain counts its subdomains and its best page; look-alike domains never count", () => {
  assert.deepEqual(findPosition(SERP, "stride.com", "domain"), { position: 2, url: "https://shop.stride.com/glide-3" });
  assert.equal(findPosition(SERP, "tride.com", "domain"), null);
});

test("a URL project counts only that page", () => {
  assert.deepEqual(findPosition(SERP, "stride.com/blog/best-shoes", "url"), { position: 3, url: "https://stride.com/blog/best-shoes/" });
  assert.equal(findPosition(SERP, "stride.com/blog/other", "url"), null);
});

test("one deep read a week per project, spread over the week", () => {
  const days = ["2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13", "2026-11-14", "2026-11-15"];
  const deep = days.filter((d) => depthFor("p-123", d) === DEEP_DEPTH);
  assert.equal(deep.length, 1);
  assert.ok(days.filter((d) => depthFor("p-123", d) === DAILY_DEPTH).length === 6);
  const spread = new Set(Array.from({ length: 50 }, (_, i) => deepWeekday(`project-${i}`)));
  assert.ok(spread.size >= 5, "projects land on different days");
});

test("summary: average of ranked keywords, top counts and visibility", () => {
  const s = summarize([1, 3, 8, 15, null, undefined]);
  assert.equal(s.keywords, 6);
  assert.equal(s.checked, 5);
  assert.equal(s.ranked, 4);
  assert.equal(s.avg, 6.8);
  assert.equal(s.top3, 2);
  assert.equal(s.top10, 3);
  assert.equal(s.visibility, Math.round(((31.7 + 18.7 + 3.1 + 1) / (6 * 31.7)) * 1000) / 10);
  assert.equal(summarize([1, 1]).visibility, 100);
  assert.equal(summarize([]).avg, null);
  assert.equal(ctrOf(25), 0);
});

test("moves: up is a smaller number", () => {
  assert.deepEqual(moveOf(3, 7), { kind: "up", by: 4 });
  assert.deepEqual(moveOf(9, 4), { kind: "down", by: 5 });
  assert.deepEqual(moveOf(5, 5), { kind: "same", by: 0 });
  assert.deepEqual(moveOf(5, null), { kind: "new", by: 0 });
  assert.deepEqual(moveOf(null, 5), { kind: "lost", by: 0 });
  assert.deepEqual(moveOf(null, undefined), { kind: "none", by: 0 });
});

test("pasted keywords: one per line or comma, no repeats", () => {
  assert.deepEqual(readKeywords("Best Shoes\nbest shoes, trail  shoes;\n\n" + "x".repeat(90)), ["best shoes", "trail shoes"]);
});

test("features and labels read like people say them", () => {
  assert.deepEqual(featuresOf(["organic", "ai_overview", "people_also_ask", "ai_overview"]), ["AI Overview", "People also ask"]);
  assert.equal(positionLabel(4, 30, true), "4");
  assert.equal(positionLabel(null, 30, true), "30+");
  assert.equal(positionLabel(null, 100, true), "100+");
  assert.equal(positionLabel(null, 30, false), "");
});
