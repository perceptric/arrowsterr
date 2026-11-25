import { test } from "node:test";
import assert from "node:assert/strict";
import { imageSketch, moduleSketch, numbersIn, shortLabel, stepLabel } from "../src/lib/visualSketch.ts";

test("a steps image takes its steps from its description, else from the section's subheadings", () => {
  assert.deepEqual(
    imageSketch({
      kind: "steps",
      shows: "Collect the answers, sort them into groups, then subtract",
    }),
    {
      kind: "steps",
      steps: ["Collect", "Sort", "Subtract"],
    },
  );
  assert.deepEqual(imageSketch({ kind: "steps", shows: "The 3 steps to calculate NPS" }, ["Step 1: Collect your responses", "Step 2: Sort them", "Step 3: Subtract Detractors"]), {
    kind: "steps",
    steps: ["Collect", "Sort", "Subtract Detractors"],
  });
  assert.deepEqual(imageSketch({ kind: "steps", shows: "How it works" }).kind === "steps" && imageSketch({ kind: "steps", shows: "How it works" }), {
    kind: "steps",
    steps: ["Step 1", "Step 2", "Step 3"],
  });
});

test("a chart draws its numbers, a screenshot its page, and a checklist its items", () => {
  assert.deepEqual(
    imageSketch({
      kind: "chart",
      shows: "Groups",
      numbers: "Promoters: 60; Passives: 25; Detractors: 15",
    }),
    {
      kind: "bars",
      bars: [
        { label: "Promoters", value: 60 },
        { label: "Passives", value: 25 },
        { label: "Detractors", value: 15 },
      ],
    },
  );
  assert.deepEqual(
    imageSketch({
      kind: "screenshot",
      shows: "Zendesk pricing",
      url: "https://www.zendesk.com/pricing/",
    }),
    { kind: "browser", url: "zendesk.com/pricing" },
  );
  assert.deepEqual(
    imageSketch({
      kind: "checklist",
      shows: "Read every field; check the owner; save the reason",
    }).kind,
    "checks",
  );
});

test("a calculator shows its inputs and result; a table its columns and rows", () => {
  assert.deepEqual(
    moduleSketch({
      type: "calculator",
      title: "NPS calculator",
      inputs: ["Number of promoters", "Number of passives", "Number of detractors"],
      outputs: ["Your NPS score"],
    }),
    {
      kind: "form",
      inputs: ["Number of promoters", "Number of passives", "Number of detractors"],
      output: "Your NPS score",
    },
  );
  assert.deepEqual(
    moduleSketch({
      type: "table",
      title: "Compared",
      data: "Option | Best for | Starting price\nZendesk | Large teams | $19\nFront | Shared inboxes | $19",
    }),
    {
      kind: "grid",
      cols: ["Best for", "Starting price"],
      rows: ["Zendesk", "Front"],
    },
  );
  assert.equal(moduleSketch({ type: "picker", title: "Pick", inputs: [], outputs: [] }).kind, "form");
});

test("labels are short and numbers are read from plain text", () => {
  assert.equal(shortLabel("Step 2: Sort them into Promoters, Passives and Detractors"), "Sort them into");
  assert.equal(stepLabel("Step 2: Sort them into Promoters"), "Sort");
  assert.equal(stepLabel("Step 1: Collect responses"), "Collect responses");
  assert.deepEqual(numbersIn("Free 0, Pro $49, Team 150"), [
    { label: "Free", value: 0 },
    { label: "Pro", value: 49 },
    { label: "Team", value: 150 },
  ]);
});
