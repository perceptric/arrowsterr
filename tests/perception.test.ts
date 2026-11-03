import assert from "node:assert/strict";
import { test } from "node:test";
import { biggestGap, brandMatch, cleanCategories, cleanCategory, headlineGap, seenAs, checkWords, cleanWordList, radarOrder, scoresFromSummary, scoresOf, splitAnswer, unknownInSummary, unknownTo, verdict, type PerceptionRead, type PerceptionWord, type SummaryRow } from "../src/lib/perception.ts";

const B = [brandMatch("HubSpot", ["hubspot.com"]), brandMatch("Jobber"), brandMatch("Zoho CRM"), brandMatch("Zoho One"), brandMatch("Pipedrive")];
const owners = (text: string, find: RegExp) => splitAnswer(text, B).find((s) => find.test(s.text))?.brands.map((b) => b.name) ?? [];

const WORDS: PerceptionWord[] = [
  { word: "Affordable", good: true, definition: "" },
  { word: "Simple", good: true, definition: "" },
  { word: "Integrated", good: true, definition: "" },
  { word: "Reliable", good: true, definition: "" },
  { word: "Fast", good: true, definition: "" },
  { word: "Flexible", good: true, definition: "" },
  { word: "Complete", good: true, definition: "" },
  { word: "Complicated", good: false, definition: "" },
  { word: "Expensive", good: false, definition: "" },
  { word: "Limited", good: false, definition: "" },
];

// These layouts come from real ChatGPT, Gemini and AI Overview answers. Each one broke an earlier version.
test("a bold numbered heading owns the lines under it", () => {
  const text = "## Top 7 CRM platforms\n\n**1. HubSpot CRM**\n\n(Best overall)\n\n- Free entry-level CRM.\n- Contact and lead management.\n\nBest for: Small businesses wanting an easy system that can grow.";
  assert.deepEqual(owners(text, /entry-level/), ["HubSpot"]);
  assert.deepEqual(owners(text, /easy system/), ["HubSpot"]);
});

test("a heading with the brand after a label owns the lines under it", () => {
  const text = "#### 1. Best Overall for Simplicity & Value: **HubSpot**\n* **Standout Feature:** Extremely intuitive contact timelines.\n* **Keep in Mind:** Pricing scales up quickly.";
  assert.deepEqual(owners(text, /intuitive contact/), ["HubSpot"]);
  assert.deepEqual(owners(text, /scales up quickly/), ["HubSpot"]);
});

test("a comparison heading owns nothing", () => {
  const text = "## Cheaper HubSpot alternatives\n\nThese tools cost less and cover the basics well.";
  assert.deepEqual(owners(text, /cost less/), []);
});

test("a bold subtitle under a brand heading keeps the brand", () => {
  const text = "**7. HubSpot**\n**Best for traditional CRM and marketing**\n\n- Lead tracking and sales pipelines.\n\nLimitation: Not designed for technician dispatch.";
  assert.deepEqual(owners(text, /technician dispatch/), ["HubSpot"]);
});

test("a list item written as label then brand owns its sub-items", () => {
  const text = "- **Best Inexpensive Option for Small Teams:** **[Jobber](https://getjobber.com/)**\n\t- *Pricing:* Generally more affordable for small teams.";
  assert.deepEqual(owners(text, /more affordable/), ["Jobber"]);
});

test("a sentence names its brands even under another brand's heading", () => {
  const text = "### ActiveCampaign\nIt provides automation that is often much cheaper than HubSpot.";
  assert.deepEqual(owners(text, /much cheaper/), ["HubSpot"]);
});

test("glued citations don't merge two sentences", () => {
  const s = splitAnswer("HubSpot is famous for its free CRM. doublescale.ioIf Jobber felt clunky, try it.", B);
  assert.equal(s.length, 2);
  assert.deepEqual(s[1].brands.map((b) => b.name), ["Jobber"]);
});

test("Zoho CRM and Zoho One are different brands", () => {
  assert.deepEqual(owners("Zoho One bundles 40 apps.", /40 apps/), ["Zoho One"]);
  assert.ok(brandMatch("HubSpot", ["hubspot.com"]).re.test("see hubspot.com for prices"));
  assert.ok(!brandMatch("Jobber").re.test("Jobbers are great"));
});

const answer = "## Best CRMs\n\n**1. HubSpot**\n- Free plan for small teams.\n- Pricing can climb quickly as you add seats.\n\n**2. Zoho CRM**\n- Zoho CRM costs much less than HubSpot and is easy to set up.";
const base = { text: answer, prompt: "best CRM for local businesses", source: "buyer" as const, brands: B, words: WORDS };

test("a word stays when its quote is in a sentence about the brand", () => {
  const r = checkWords({ ...base, brand: "HubSpot" }, [{ word: "Affordable", quote: "Free plan for small teams" }, { word: "expensive", quote: "Pricing can climb quickly as you add seats" }]);
  assert.deepEqual(r.kept.map((k) => k.word), ["Affordable", "Expensive"]);
  assert.equal(r.dropped.length, 0);
});

test("made-up quotes, words off the list and repeats are dropped", () => {
  const r = checkWords({ ...base, brand: "HubSpot" }, [
    { word: "Affordable", quote: "HubSpot is the cheapest CRM on earth" },
    { word: "Powerful", quote: "Free plan for small teams" },
    { word: "Affordable", quote: "Free plan for small teams" },
    { word: "Affordable", quote: "Free plan for small teams" },
  ]);
  assert.deepEqual(r.kept.map((k) => k.word), ["Affordable"]);
  assert.deepEqual(r.dropped.map((d) => d.why), ["Quote isn't in the answer", "Not on the word list"]);
});

test("a quote about another brand is dropped", () => {
  const r = checkWords({ ...base, brand: "Jobber" }, [{ word: "Affordable", quote: "Free plan for small teams" }]);
  assert.equal(r.kept.length, 0);
  assert.equal(r.dropped[0].why, "Quote is about another brand");
});

test("on a prompt about leaving a brand, a bad word from a comparison is held back", () => {
  const quote = [{ word: "Expensive", quote: "Zoho CRM costs much less than HubSpot" }];
  const leaving = checkWords({ ...base, brand: "HubSpot", prompt: "cheaper alternatives to HubSpot" }, quote);
  assert.equal(leaving.kept.length, 0);
  assert.equal(leaving.dropped[0].why, "Bad word in a comparison, on a prompt about leaving this brand");
  // The same sentence on a neutral prompt still names HubSpot, so the word stays.
  assert.equal(checkWords({ ...base, brand: "HubSpot" }, quote).kept.length, 1);
});

test("direct answers are about one brand, so any real quote counts", () => {
  const r = checkWords({ ...base, source: "direct", text: "It is easy to use but gets expensive as you grow.", brand: "Pipedrive" }, [{ word: "Expensive", quote: "gets expensive as you grow" }]);
  assert.equal(r.kept.length, 1);
});

test("the word list needs exactly 7 good and 3 bad single words", () => {
  const ok = cleanWordList({ words: WORDS.map((w) => ({ ...w, word: w.word.toLowerCase() })) });
  assert.equal(ok?.length, 10);
  assert.equal(ok?.[0].word, "Affordable");
  assert.equal(cleanWordList({ words: WORDS.slice(0, 9) }), null);
  assert.equal(cleanWordList({ words: [...WORDS, { word: "affordable", good: true, definition: "" }] })?.length, 10);
});

const read = (named: string, engine: string, words: string[], extra: Partial<PerceptionRead> = {}): PerceptionRead => ({ source: "buyer", engine, prompt: "p", named, words: words.map((word) => ({ word, quote: "q" })), at: "2026-11-01", ...extra });

test("scores are the share of answers, each answer once per word", () => {
  const reads = [read("HubSpot", "ChatGPT", ["Affordable", "Affordable"]), read("HubSpot", "Gemini", []), read("HubSpot", "Claude", ["Expensive"]), read("HubSpot", "Perplexity", ["Affordable"])];
  const s = scoresOf(reads, "HubSpot", WORDS);
  assert.equal(s.n, 4);
  assert.equal(s.share.Affordable, 0.5);
  assert.equal(s.share.Expensive, 0.25);
  assert.equal(scoresOf(reads, "Jobber", WORDS).n, 0);
});

test("the radar puts bad words across the bottom", () => {
  const order = radarOrder(WORDS);
  assert.deepEqual(order.slice(4, 7).map((w) => w.good), [false, false, false]);
  assert.equal(order.length, 10);
});

test("the verdict leads with praise, then the strongest warning", () => {
  const you = scoresOf([read("A", "x", ["Affordable", "Expensive"]), read("A", "y", ["Affordable", "Expensive"]), read("A", "z", ["Simple"])], "A", WORDS);
  const rival = scoresOf([read("B", "x", ["Integrated"]), read("B", "y", ["Integrated"]), read("B", "z", ["Integrated"])], "B", WORDS);
  assert.deepEqual(verdict("A", you, [{ brand: "B", scores: rival }], WORDS, false), ["AI sees A as Affordable and Simple.", "Watch Expensive."]);
  assert.equal(biggestGap(you, [{ brand: "B", scores: rival }], WORDS)?.word, "Integrated");
  const none = scoresOf([], "C", WORDS);
  assert.deepEqual(verdict("C", none, [{ brand: "B", scores: rival }], WORDS, true), ["AI doesn't know C yet.", "B is seen as Integrated."]);
});

test("a brand is unknown when most describe answers say so", () => {
  const reads = [read("U", "Claude", [], { source: "direct", kind: "describe", unknown: true }), read("U", "ChatGPT", [], { source: "direct", kind: "describe", unknown: true }), read("U", "Gemini", ["Simple"], { source: "direct", kind: "describe" })];
  assert.equal(unknownTo(reads, "U"), true);
  assert.equal(unknownTo(reads.slice(2), "U"), false);
});

test("summary rows give the same scores as the answers they sum up", () => {
  const rows: SummaryRow[] = [
    { source: "buyer", kind: null, named: "HubSpot", engine: "ChatGPT", prompt: "a", word: null, n: 3, unknown: 0 },
    { source: "buyer", kind: null, named: "HubSpot", engine: "ChatGPT", prompt: "a", word: "Affordable", n: 2, unknown: 0 },
    { source: "buyer", kind: null, named: "HubSpot", engine: "Gemini", prompt: "b", word: null, n: 1, unknown: 0 },
    { source: "buyer", kind: null, named: "HubSpot", engine: "Gemini", prompt: "b", word: "Affordable", n: 1, unknown: 0 },
    { source: "direct", kind: "describe", named: "HubSpot", engine: "Claude", prompt: "d", word: null, n: 2, unknown: 2 },
  ];
  const all = scoresFromSummary(rows, "HubSpot", WORDS, (r) => r.source === "buyer");
  assert.equal(all.n, 4);
  assert.equal(all.share.Affordable, 0.75);
  assert.equal(scoresFromSummary(rows, "HubSpot", WORDS, (r) => r.source === "buyer" && r.engine === "Gemini").share.Affordable, 1);
  assert.equal(unknownInSummary(rows, "HubSpot"), true);
});

test("the verdict never says a rival wins on a word you're praised for", () => {
  const you = scoresOf([read("A", "x", ["Affordable", "Simple"]), read("A", "y", ["Affordable"]), read("A", "z", ["Affordable"])], "A", WORDS);
  const rival = scoresOf([read("B", "x", ["Simple", "Fast"]), read("B", "y", ["Simple"]), read("B", "z", ["Simple"])], "B", WORDS);
  assert.deepEqual(verdict("A", you, [{ brand: "B", scores: rival }], WORDS, false), ["AI sees A as Affordable and Simple.", "B wins on Fast."]);
  assert.equal(biggestGap(you, [{ brand: "B", scores: rival }], WORDS)?.word, "Simple");
  assert.equal(headlineGap(you, [{ brand: "B", scores: rival }], WORDS)?.word, "Fast");
});

test("the category list is 4 to 10 short kinds of product, with the expected one on it", () => {
  const ok = cleanCategories({ categories: ["CRM", "crm", "Field service software", "All-in-one business suite", "POS system", "Marketing automation"], expected: "all-in-one business suite" });
  assert.deepEqual(ok, { categories: ["CRM", "Field service software", "All-in-one business suite", "POS system", "Marketing automation"], expected: "All-in-one business suite" });
  assert.equal(cleanCategories({ categories: ["CRM", "POS system", "Invoicing software", "Booking software"], expected: "Accounting software" }), null);
  assert.equal(cleanCategories({ categories: ["CRM", "POS system"], expected: "CRM" }), null);
  // A long phrase is an opinion or a feature list, never a category.
  assert.equal(cleanCategories({ categories: ["CRM", "POS system", "Invoicing software", "Booking software", "Powerful CRM for growing sales teams"], expected: "CRM" })?.categories.length, 4);
});

test("a category off the list counts as not said", () => {
  const list = ["CRM", "Field service software"];
  assert.equal(cleanCategory("crm", list), "CRM");
  assert.equal(cleanCategory("Office CRM", list), null);
  assert.equal(cleanCategory("", list), null);
});

test("seen as is each category's share of the answers that say one", () => {
  const rows: SummaryRow[] = [
    { source: "buyer", kind: null, named: "Jobber", engine: "ChatGPT", prompt: "a", word: null, n: 4, unknown: 0 },
    { source: "buyer", kind: null, named: "Jobber", engine: "ChatGPT", prompt: "a", word: null, category: "Field service software", n: 3, unknown: 0 },
    { source: "buyer", kind: null, named: "Jobber", engine: "Gemini", prompt: "b", word: null, category: "CRM", n: 1, unknown: 0 },
    { source: "direct", kind: "objections", named: "Jobber", engine: "Claude", prompt: "o", word: null, category: "CRM", n: 2, unknown: 0 },
  ];
  const s = seenAs(rows, "Jobber", (r) => r.source === "buyer" || r.kind === "describe");
  assert.equal(s.n, 4);
  assert.deepEqual(s.shares[0], { category: "Field service software", share: 0.75 });
  // Category rows never count as answers in the word scores.
  assert.equal(scoresFromSummary(rows, "Jobber", WORDS, (r) => r.source === "buyer").n, 4);
});
