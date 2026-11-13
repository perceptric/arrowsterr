import { test } from "node:test";
import assert from "node:assert/strict";
import { checkedNumbers, scoreArticle, sumScores } from "../src/lib/writerScore.ts";
import type { ResearchPack } from "../src/lib/writerBrief.ts";
import type { Section } from "../src/lib/writerDraft.ts";

const pack: ResearchPack = {
  keyword: "how often to replace running shoes",
  pages: [{ url: "https://www.runnersworld.com/gear/a1/", title: "x", domain: "runnersworld.com", kind: "serp", position: 1, words: 900, headings: [], body: "Most shoes last 500 to 800 kilometers, or about 300 to 500 miles. A pair costs $130." }],
  questions: [{ question: "How long do running shoes last?", answer: "About 6 months for 25% of runners." }],
  aiOverview: "",
  answers: [],
};
const p = (text: string) => ({ type: "p" as const, text, items: [], rows: [] });

test("money, percents and big numbers need a source; years and small counts do not", () => {
  assert.deepEqual(checkedNumbers("In 2026, 3 tips: shoes last 1,200 km, cost $95.00 and 40% of people agree."), ["1200", "95", "40"]);
});

test("a number the research has is sourced, a made-up one is not, and stray links are listed", () => {
  const sections: Section[] = [
    { key: "intro", h2: "", blocks: [p("Most shoes last 500 to 800 kilometers [1]. A good pair costs $130, and 25% of runners swap every 6 months.")] },
    { key: "s1", h2: "When to replace them", blocks: [p("About 60% of runners wait too long, per [this study](https://example.org/study). See [our guide](https://striderunning.example/guides/shoe-fit) and [Runner's World](https://runnersworld.com/gear/a1).")] },
  ];
  const s = scoreArticle(sections, pack, { sitemap: ["https://striderunning.example/guides/shoe-fit"], brandDomain: "striderunning.example", images: 2, modules: 1 });
  assert.deepEqual(s.unsourced, ["60"]);
  assert.equal(s.numbers, 5);
  assert.deepEqual(s.strayLinks, ["https://example.org/study"]);
  assert.equal(s.links, 3);
  assert.equal(s.sections, 2);
  assert.ok(s.words > 30);
  const sum = sumScores([s, s]);
  assert.equal(sum.unsourcedNumbers, 2);
  assert.equal(sum.imagesAvg, 2);
});
