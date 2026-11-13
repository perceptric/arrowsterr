import { test } from "node:test";
import assert from "node:assert/strict";
import { allowedTerms, houseLint } from "../src/lib/houseLint.ts";
import { lintText } from "../src/lib/houseRules.ts";
import { dropAdverb, splitParagraph, straighten, tidy } from "../src/lib/tidy.ts";
import { factAudit, values } from "../src/lib/factAudit.ts";

const p = (text: string) => ({ type: "p", text, items: [] as string[], rows: [] as string[][] });

// ─────────────── house lint (the Perceptric lint.py port) ───────────────

test("the house lint flags lint.py's banned words, phrases and structures", () => {
  const whys = (t: string) => houseLint(t).map((h) => h.why);
  assert.deepEqual(whys("This comprehensive guide will help you leverage the landscape."), ['"comprehensive"', '"leverage"', '"landscape"']);
  assert.ok(whys("In order to grow, plan ahead.").includes('"in order to"'));
  assert.ok(whys("It plays a crucial role in sales.").some((w) => w.includes("plays a crucial role")));
  assert.ok(whys("It's not a tool, it's a team.").some((w) => w.includes("contrast")));
  assert.ok(whys("Not fast. Not cheap.").some((w) => w.includes("stacked")));
  assert.ok(whys("Ship it -- today").includes("a double hyphen"));
  assert.deepEqual(whys("We plan posts with our team every week."), []);
});

test("the house lint never flags a word from the article's own topic, and keeps the house's feeling adverbs", () => {
  const allow = allowedTerms(["customer journey mapping"]);
  assert.deepEqual(houseLint("A customer journey map shows each step.", allow), []);
  assert.ok(houseLint("A customer journey map shows each step.").length > 0);
  assert.deepEqual(houseLint("Honestly, most teams start here."), []);
});

test("lintText adds the port's findings once and flags a sentence over 35 words", () => {
  const dash = lintText("We plan — and then we write the post for the team today.");
  assert.equal(dash.filter((f) => f.rule === "dashes").length, 1);
  const long = lintText(Array.from({ length: 40 }, (_, i) => `word${i}`).join(" ") + ".");
  assert.ok(long.some((f) => f.why === "a sentence over 35 words"));
});

// ─────────────── tidy: fixes code makes without touching a fact ───────────────

test("tidy straightens quotes, drops a repeated feeling adverb and splits long paragraphs", () => {
  assert.equal(straighten("“Fast” isn’t [it](https://x.com/“a”)"), '"Fast" isn\'t [it](https://x.com/“a”)');
  assert.equal(dropAdverb("Honestly, most teams start here."), "Most teams start here.");
  assert.equal(dropAdverb("Most teams start here."), "Most teams start here.");
  const long = "One two three four five. Six seven eight nine ten. Eleven twelve thirteen fourteen. Fifteen sixteen seventeen. Eighteen nineteen twenty.";
  assert.deepEqual(splitParagraph(long), ["One two three four five. Six seven eight nine ten. Eleven twelve thirteen fourteen.", "Fifteen sixteen seventeen. Eighteen nineteen twenty."]);
  assert.deepEqual(splitParagraph('He said "go." Then we went.'), ['He said "go." Then we went.']);
  const out = tidy([
    { key: "intro", h2: "", blocks: [p("Honestly, we like lists. They help.")] },
    { key: "a", h2: "A", blocks: [p("Honestly, you will too. “Yes,” they said.")] },
  ]);
  assert.equal(out.sections[1].blocks[0].text, 'You will too. "Yes," they said.');
  assert.equal(out.sections[0].blocks[0].text, "Honestly, we like lists. They help.");
  assert.ok(out.notes.some((n) => n.includes("second time")));
});

test("splitting a paragraph keeps every word and closing quote", () => {
  const text = 'Pick a tool. "It works," she said. We agree. You will too. Most teams do. That is fine.';
  const parts = splitParagraph(text);
  assert.equal(parts.join(" "), text);
  assert.ok(parts.length >= 2);
});

// ─────────────── fact audit (post_edit_audit.py port) ───────────────

test("the fact audit blocks a copyedit that turns 500 to 800 km into about 600 km", () => {
  const a = factAudit("Most shoes last 500 to 800 km.", "Most shoes last about 600 km.");
  assert.equal(a.status, "BLOCK");
  assert.ok(a.reasons.some((r) => r.includes("lost number 500")));
  assert.ok(a.reasons.some((r) => r.includes("added number 600")));
});

test("the fact audit blocks a rewrite that drops likely, and allows one that keeps it", () => {
  assert.equal(factAudit("Prices will likely rise next year.", "Prices will rise next year.").status, "BLOCK");
  assert.equal(factAudit("Prices will likely rise next year.", "Next year, prices will likely rise.").status, "OK");
  assert.equal(factAudit("Many runners replace shoes often.", "Runners replace shoes.").status, "BLOCK");
  // "about" hedges only before a number.
  assert.equal(factAudit("We talk about pricing here.", "We cover pricing here.").status, "OK");
  assert.equal(factAudit("It costs about $130.", "It costs $130.").status, "BLOCK");
});

test("the fact audit checks links, names, quotes, dates, chat formulas and word loss", () => {
  assert.equal(factAudit("See [the guide](https://a.com/x).", "See the guide.").status, "BLOCK");
  assert.equal(factAudit("See [the guide](https://a.com/x).", "Read [this guide](https://a.com/x/).").status, "OK");
  assert.equal(factAudit("Tavola answers guests.", "The app answers guests.", { names: ["Tavola"] }).status, "BLOCK");
  assert.equal(factAudit('She called it "the best shoe".', 'She called it "a great shoe".').status, "BLOCK");
  assert.equal(factAudit("It launched on March 3, 2026.", "It launched on 3 March 2026.").status, "OK");
  assert.equal(factAudit("It launched on March 3, 2026.", "It launched on March 4, 2026.").status, "BLOCK");
  assert.equal(factAudit("Plan your posts well.", "Here's how: plan your posts well.").status, "BLOCK");
  const long = "Plan each post around one question a buyer asks, then answer it with steps, examples and a clear next action for the reader.";
  assert.equal(factAudit(long, "Plan each post around one question.").status, "BLOCK");
  assert.deepEqual(values("It costs $1,200, or 15%, on Jan 5, 2026."), ["date 2026-01-05", "number 1200", "number 15"]);
});

// ─────────────── Phase 2b: one sentence splitter, safe long-sentence splits ───────────────

test("the sentence splitter keeps initials, abbreviations and closing quotes inside their sentence", async () => {
  const { splitSentences } = await import("../src/lib/sentences.ts");
  assert.deepEqual(splitSentences("A.O. Smith makes water heaters. They last 10 years."), ["A.O. Smith makes water heaters.", "They last 10 years."]);
  assert.deepEqual(splitSentences("Prices rose in the U.S. Prices fell in Canada."), ["Prices rose in the U.S. Prices fell in Canada."]);
  assert.deepEqual(splitSentences("Pick a tool, e.g. Asana. Then plan."), ["Pick a tool, e.g. Asana.", "Then plan."]);
  assert.deepEqual(splitSentences('She said "go." Then we went! Did it work? Yes.'), ['She said "go."', "Then we went!", "Did it work?", "Yes."]);
  assert.deepEqual(splitSentences("[A.O. Smith](https://x.com) splits the cost. It helps."), ["[A.O. Smith](https://x.com) splits the cost.", "It helps."]);
  const text = "It costs $3.50 a day. J. Smith agrees. Inc. names stay whole.";
  assert.equal(splitSentences(text).join(" "), text);
});

test("tidy splits a long sentence only where both halves stand alone", async () => {
  const { splitLong } = await import("../src/lib/tidy.ts");
  const long = "If your goal is lead generation, lead magnets such as white papers and industry reports fit very well for most teams, and you can track the number of leads each one brings in every single month.";
  assert.deepEqual(splitLong(long), ["If your goal is lead generation, lead magnets such as white papers and industry reports fit very well for most teams.", "You can track the number of leads each one brings in every single month."]);
  const semi = "The tank heats a full load of water and keeps it hot all day long for the whole house; the tankless unit heats water only when a tap opens and it needs no storage at all in the home.";
  assert.equal(splitLong(semi).length, 2);
  // A list ("..., and the ...") or a half under 10 words stays as it is.
  const list = "We compared the price, the warranty, the install time, the yearly running cost, the noise level, the size of the unit, the brand's service network, and the reviews from owners in cold places.";
  assert.deepEqual(splitLong(list), [list]);
  assert.deepEqual(splitLong("Short one, and you know it."), ["Short one, and you know it."]);
});

test("a short line with a link is a call to action, and the lint leaves it alone", () => {
  assert.ok(!lintText("See our [SEO services](https://x.com/seo).").some((f) => f.why === "a short sentence"));
  assert.ok(lintText("Fuel matters too.").some((f) => f.why === "a short sentence"));
});
