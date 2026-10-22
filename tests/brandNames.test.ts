import assert from "node:assert/strict";
import { test } from "node:test";
import { cleanMentions, confirmedNames, notBrand, rankedNames } from "../src/lib/brandNames.ts";

test("questions, steps, tips and headings from an answer's lists are never brands", () => {
  for (const n of [
    "Can you show revenue impact from past clients?",
    "Do you create and publish the content yourselves",
    "Can you win bottom-of-funnel keywords",
    "How do you measure success",
    "Who will do the work?",
    "What is your pricing?",
    "Pricing",
    "Key Features",
    "Pros and cons",
    "Step 3",
    "Option 2: managed service",
    "Ask for case studies",
    "Look for B2B SaaS experience",
    "Check their reporting cadence",
    "revenue-focused content strategy",
    "content that ranks",
    "They focus on SaaS. Great results",
    "A specialist agency that focuses only on B2B software companies and nothing else",
    "",
    "123",
  ]) assert.ok(notBrand(n), `kept: ${n}`);
});

test("real brand names pass, including short, odd and lowercase ones", () => {
  for (const n of ["Grow and Convert", "growandconvert.com", "HubSpot", "Omniscient Digital", "monday.com", "Close", "Siege Media", "SimpleTiger", "Ahrefs", "3M", "What If Media", "Who What Wear", "Ask.com", "semrush", "Kalungi", "Directive Consulting"]) {
    assert.equal(notBrand(n), null, n);
  }
});

test("cleaning renumbers what's left, keeps the tracked brand and changes nothing when all are brands", () => {
  const list = [
    { name: "Who will do the work?", position: 1, sentiment: 50 },
    { name: "Grow and Convert", position: 2, sentiment: 80 },
    { name: "How do you measure success", position: 3, sentiment: 50 },
    { name: "Ask for case studies", position: 4, sentiment: 50 },
    { name: "Perceptric", position: 5, sentiment: 70 },
  ];
  assert.deepEqual(cleanMentions(list, ["Ask for case studies"]).map((m) => [m.name, m.position]), [["Grow and Convert", 1], ["Ask for case studies", 2], ["Perceptric", 3]]);
  const clean = [{ name: "HubSpot", position: 2 }, { name: "Zoho", position: 5 }];
  assert.equal(cleanMentions(clean), clean, "nothing removed keeps the same list and positions");
  assert.deepEqual(cleanMentions([]), []);
});

// The case behind the bug: an AI app answered in its own words, numbering the questions to ask an agency.
const APP_ANSWER = `Here are the best SEO agencies for B2B SaaS:

1. **Grow and Convert** - focuses on bottom-of-funnel content.
2. **Omniscient Digital** - strong SaaS track record.

Before you hire one, ask them:

1. **Can you show revenue impact from past clients?**
2. **Do you create and publish the content yourselves?**
3. **Who will do the work?**`;

test("an answer without the shared layout gives no list names, so Claude reads the whole answer", () => {
  assert.deepEqual(rankedNames(APP_ANSWER, "Perceptric", ["perceptric", "perceptric.com"]), []);
});

test("in the shared layout, a stray question or heading is dropped and the tracked brand keeps its own name", () => {
  const md = `## Recommendations\n1. **Grow and Convert** - great.\n2. **How do you measure success?** - ask this.\n3. **perceptric.com** - good.\n4. **Grow and Convert** - again.\n5. **Pricing** - varies.\n\n## Summary\nPick one.`;
  assert.deepEqual(rankedNames(md, "Perceptric", ["perceptric", "perceptric.com"]), ["Grow and Convert", "Perceptric"]);
});

test("names Claude marks as not a brand go, unanswered ones stay, and the tracked brand always stays", () => {
  const checks = new Map<string, { brand?: unknown }>([["grow and convert", { brand: true }], ["revenue playbooks", { brand: false }], ["perceptric", { brand: false }]]);
  assert.deepEqual(confirmedNames(["Grow and Convert", "Revenue Playbooks", "Siege Media", "Perceptric"], checks, "Perceptric"), ["Grow and Convert", "Siege Media", "Perceptric"]);
});
