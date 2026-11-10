import assert from "node:assert/strict";
import { test } from "node:test";
import { aiGridOf, aiPrompt, aiTasks, aiVsMaps, candidatesOf, citedSites, nameForms, namedIn, readOf, summarizeAi, type AiReads, type Candidate } from "../src/lib/localAi.ts";
import { grid, type Place } from "../src/lib/local.ts";

const place = (o: Partial<Place>): Place => ({ title: "", cid: null, placeId: null, domain: null, address: null, phone: null, category: null, categories: [], rating: null, reviews: null, lat: null, lng: null, rank: 1, ...o });
const CANDS: Candidate[] = [
  { key: "__you", title: "Northside Dental", you: true, cid: "111", domain: "northsidedental.com" },
  { key: "222", title: "Bright Smile Family Dental - Austin", you: false, cid: "222", domain: "brightsmile.com" },
  { key: "333", title: "Capital City Dentistry, PLLC", you: false, cid: "333", domain: null },
  { key: "444", title: "Smile", you: false, cid: "444", domain: null }, // too short to match by name
];

test("the AI grid covers the Maps grid's area with 5 × 5 points", () => {
  const g = aiGridOf({ lat: 30.3, lng: -97.7, spacing: 1, size: 7, shape: "square", center: null });
  assert.equal(g.size, 5);
  assert.equal(g.spacing, 1.5);
  assert.equal(g.points.length, 25);
  const maps = grid(30.3, -97.7, 1, 7);
  // Corners and centre line up.
  assert.deepEqual([g.points[0].lat.toFixed(5), g.points[0].lng.toFixed(5)], [maps[0].lat.toFixed(5), maps[0].lng.toFixed(5)]);
  assert.equal(aiGridOf({ lat: 1, lng: 1, spacing: 0.5, size: 3, shape: "circle", center: { lat: 2, lng: 2 } }).size, 3);
  assert.equal(aiGridOf({ lat: 1, lng: 1, spacing: 1, size: 7, shape: "circle", center: null }).points.length, 21);
  assert.equal(aiTasks(25), 12);
  assert.equal(aiTasks(9), 6);
});

test("the question: best keyword near the point, in the city for ChatGPT and Gemini", () => {
  assert.equal(aiPrompt("dentist"), "best dentist");
  assert.equal(aiPrompt("Best  dentist"), "Best dentist");
  assert.equal(aiPrompt("dentist", "Austin"), "best dentist in Austin");
  assert.equal(aiPrompt("dentist near me", "Austin"), "best dentist near me");
  assert.equal(aiPrompt("austin dentist", "Austin"), "best austin dentist");
});

test("names a business is called, never a common word", () => {
  assert.deepEqual(nameForms("Bright Smile Family Dental - Austin"), ["bright smile family dental austin", "bright smile family dental"]);
  assert.deepEqual(nameForms("Capital City Dentistry, PLLC"), ["capital city dentistry"]);
  assert.deepEqual(nameForms("Smile"), []);
  assert.deepEqual(nameForms("Dentistry"), ["dentistry"]);
});

test("candidates come from the Maps scan, the business first, each once", () => {
  const c = candidatesOf({ title: "Northside Dental", cid: "111", domain: "https://www.northsidedental.com/" }, {
    "0": [place({ title: "Bright Smile", cid: "222", domain: "brightsmile.com", rank: 2 }), place({ title: "Northside Dental", cid: "111", rank: 1 })],
    "1": [place({ title: "Bright Smile", cid: "222", rank: 1 }), place({ title: "Lone Star", cid: "444", domain: "facebook.com", rank: 3 })],
    "2": null,
  });
  assert.deepEqual(c.map((x) => [x.key, x.domain]), [["__you", "northsidedental.com"], ["222", "brightsmile.com"], ["444", null]]);
});

test("an answer names businesses by Maps link, website or name, in order, once each", () => {
  const text = `Here are top options:
1. **Capital City Dentistry** has great reviews.
2. [Bright Smile Family Dental](https://www.google.com/maps?cid=222) offers same day care. Bright Smile Family Dental is open late.
3. Northside Dental ([site](https://northsidedental.com/contact)) is close by.
Smile wide!`;
  const n = namedIn(text, [{ url: "https://brightsmile.com/about" }, { url: "https://yelp.com/biz/x" }], CANDS);
  assert.deepEqual(n.map((x) => [x.key, x.pos, x.how]), [["333", 1, "name"], ["222", 2, "link"], ["__you", 3, "link"]]);
  // A site two businesses share proves neither.
  const shared = CANDS.map((c) => (c.key === "333" ? { ...c, domain: "brightsmile.com" } : c));
  assert.deepEqual(namedIn("See this.", [{ url: "https://brightsmile.com" }], shared), []);
  assert.deepEqual(namedIn("Nothing here about dentists.", [], CANDS), []);
});

test("saved answers keep cited sites without Google, and no answer names nobody", () => {
  assert.deepEqual(citedSites([{ url: "https://www.yelp.com/a" }, { url: "https://yelp.com/b" }, { url: "https://www.google.com/maps" }, { url: "x", domain: "healthgrades.com" }]), ["yelp.com", "healthgrades.com"]);
  const none = readOf({ text: "_Google showed no AI Overview for this search._", sources: [], shown: false }, CANDS);
  assert.deepEqual(none, { named: [], sources: [], shown: false, text: "" });
});

test("a scan sums up over answered points only, with ChatGPT and Gemini beside it", () => {
  const g = aiGridOf({ lat: 30.3, lng: -97.7, spacing: 1, size: 3, shape: "square", center: null });
  const you = { key: "__you", title: "Northside Dental", you: true, how: "link" as const };
  const bright = { key: "222", title: "Bright Smile Family Dental", you: false, how: "name" as const };
  const r = (named: { key: string; title: string; you: boolean; how: "link" | "name" }[], sources: string[] = []) => ({ named: named.map((n, i) => ({ ...n, pos: i + 1 })), sources, shown: true, text: "x" });
  const reads: AiReads = {
    "0": r([bright, you], ["yelp.com", "brightsmile.com"]),
    "1": r([you], ["yelp.com"]),
    "2": r([bright]),
    "3": null, // failed: left out
    "4": { named: [], sources: [], shown: false, text: "" }, // no AI answer: answered, names nobody
    "5": r([bright, you]),
    "6": r([bright]),
    "7": r([bright]),
    "8": r([you, bright], ["northsidedental.com"]),
    ChatGPT: r([bright]),
    Gemini: null,
  };
  const s = summarizeAi("dentist", g, reads, CANDS);
  assert.equal(s.read, 8);
  assert.equal(s.pos[3], undefined);
  assert.equal(s.pos[4], null);
  assert.equal(s.pos[0], 2);
  assert.equal(s.share, 4 / 8);
  assert.equal(s.avgPos, 1.5);
  assert.deepEqual(s.chatgpt, { named: false, pos: null });
  assert.equal(s.gemini, null);
  assert.deepEqual(s.businesses.map((b) => [b.key, b.points, b.chatgpt, b.gemini, b.byName]), [["222", 6, 1, null, true], ["__you", 4, 0, null, false]]);
  assert.deepEqual(s.sources, [{ domain: "yelp.com", n: 2, whose: null }, { domain: "brightsmile.com", n: 1, whose: "rival" }, { domain: "northsidedental.com", n: 1, whose: "you" }]);
  // Never named anywhere: still in the list, at 0.
  const empty = summarizeAi("dentist", g, { "0": r([bright]) }, CANDS);
  assert.deepEqual(empty.businesses.find((b) => b.you), { key: "__you", title: "Northside Dental", you: true, points: 0, share: 0, avgPos: null, byName: false, chatgpt: null, gemini: null });
});

test("AI Mode next to Maps, point by point", () => {
  const ai = aiGridOf({ lat: 30.3, lng: -97.7, spacing: 1, size: 3, shape: "square", center: null });
  const maps = grid(30.3, -97.7, 1, 3);
  const res = aiVsMaps({ pos: [1, null, null, 4, undefined, null, 2, null, null], points: ai.points }, { ranks: [2, 1, 9, 12, 1, null, 3, undefined, 5], points: maps });
  assert.deepEqual(res, { mapsOnly: 1, aiOnly: 1, both: 2 });
});
