import { test } from "node:test";
import assert from "node:assert/strict";
import { applyEdits, wordsIn } from "../src/lib/draftEdits.ts";

const doc = {
  type: "doc",
  content: [
    { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "What is unreasonable hospitality?" }] },
    { type: "paragraph", content: [{ type: "text", text: "It is a way of serving guests that goes past what they expect. " }, { type: "text", text: "Danny Meyer", marks: [{ type: "bold" }] }, { type: "text", text: " made it famous." }] },
    { type: "paragraph", content: [{ type: "text", text: "Guests remember it. Guests come back." }] },
  ],
};

test("an edit applies only when its text is found exactly once, in one run", () => {
  const out = applyEdits(doc, [
    { find: "goes past what they expect", replace: "surprises them" },
    { find: "Guests", replace: "People" },
    { find: "expect. Danny", replace: "x" },
    { find: "not in the draft", replace: "x" },
    { find: " made it famous.", replace: "" },
  ]);
  assert.deepEqual(out.applied, [0, 4]);
  assert.deepEqual(out.missed.map((m) => m.index), [1, 2, 3]);
  assert.match(out.missed[0].why, /more than once/);
  assert.match(out.missed[1].why, /split|not found/);
  const p = (out.doc.content as { content: { text: string }[] }[])[1].content;
  assert.equal(p[0].text, "It is a way of serving guests that surprises them. ");
  assert.equal(p.length, 2, "a run left empty is taken out");
  assert.equal((doc.content[1].content as { text: string }[])[0].text.includes("goes past"), true, "the original is left alone");
});

test("words are counted across every run", () => {
  assert.equal(wordsIn(doc), 28);
});
