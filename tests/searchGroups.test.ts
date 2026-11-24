import { test } from "node:test";
import assert from "node:assert/strict";
import { groupSearches, offSearchHeadings, searchKey, sharedByTopPages } from "../src/lib/searchGroups.ts";

test("searches that ask the same thing share a group, and their volumes add up", () => {
  const groups = groupSearches([
    { keyword: "what are ai agent", volume: 6600 },
    { keyword: "how to build an ai agent", volume: 3600 },
    { keyword: "what is ai agent", volume: 2900 },
    { keyword: "how to create an ai agent", volume: 2400 },
    { keyword: "what is an agent in ai", volume: 1900 },
    { keyword: "how does ai agent work", volume: 880 },
    { keyword: "how does ai agent works", volume: 880 },
    { keyword: "What is AI agent", volume: null },
  ]);
  assert.deepEqual(
    groups.map((g) => [g.top, g.volume, g.searches.length]),
    [
      ["what are ai agent", 11400, 3],
      ["how to build an ai agent", 6000, 2],
      ["how does ai agent work", 1760, 2],
    ],
  );
  assert.equal(searchKey("How to make an AI agent?"), searchKey("how to build ai agents"));
});

test("an H2 passes when it answers searches, is shared by two top pages, or is the brand's last section", () => {
  const pages = [["What are AI agents?", "Benefits of using AI agents"], ["Key features of an AI agent", "Benefits of AI agents"], ["Pricing"]];
  assert.ok(sharedByTopPages("Benefits of AI agents", pages, "ai agent"));
  assert.ok(!sharedByTopPages("Key features of AI agents", pages, "ai agent"), "one page is not enough");
  const off = offSearchHeadings(
    [
      { h2: "What is an AI agent?", searches: ["what is ai agent"] },
      { h2: "Benefits of AI agents", searches: [] },
      { h2: "The parts inside an agentic system", searches: [] },
      { h2: "How Momos uses AI agents", searches: [] },
    ],
    pages,
    "Momos",
    "ai agent",
  );
  assert.deepEqual(off, ["The parts inside an agentic system"]);
});
