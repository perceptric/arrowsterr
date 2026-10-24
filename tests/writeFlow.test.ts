import { test } from "node:test";
import assert from "node:assert/strict";
import { isBusy, libraryGroup, stepLabel, writeState } from "../src/lib/writeFlow.ts";

const item = { status: "planned", url: null };
const brief = (status: "generating" | "ready" | "approved" | "failed", step = "done", error: string | null = null) => ({ id: "b1", status, step, error });
const draft = (status: "generating" | "ready" | "failed", step = "done", doc_id: string | null = "d1", error: string | null = null) => ({ id: "dr1", brief_id: "b1", doc_id, status, step, error });

test("a piece with nothing yet offers Write outline", () => {
  assert.deepEqual(writeState({ item, brief: null, draft: null }), { kind: "outline" });
});

test("an outline being made shows its step", () => {
  assert.deepEqual(writeState({ item, brief: brief("generating", "research"), draft: null }), { kind: "busy", label: "Researching" });
  assert.deepEqual(writeState({ item, brief: brief("generating", "writing"), draft: null }), { kind: "busy", label: "Outlining" });
  assert.equal(isBusy(writeState({ item, brief: brief("generating", "research"), draft: null })), true);
});

test("a ready or approved outline with no draft offers Write draft", () => {
  assert.deepEqual(writeState({ item, brief: brief("ready"), draft: null }), { kind: "draft", briefId: "b1" });
  assert.deepEqual(writeState({ item, brief: brief("approved"), draft: null }), { kind: "draft", briefId: "b1" });
});

test("a failed outline offers Try again with the reason", () => {
  assert.deepEqual(writeState({ item, brief: brief("failed", "research", "No pages"), draft: null }), { kind: "retry", target: "outline", error: "No pages", briefId: "b1" });
  const blank = writeState({ item, brief: brief("failed"), draft: null });
  assert.equal(blank.kind === "retry" && blank.error.length > 0, true);
});

test("a draft being made shows each step", () => {
  const steps: [string, string][] = [
    ["sections", "Writing"],
    ["style", "Reviewing"],
    ["check", "Checking"],
    ["images", "Images"],
    ["modules", "Building modules"],
    ["save", "Saving"],
  ];
  for (const [step, label] of steps) assert.deepEqual(writeState({ item, brief: brief("approved"), draft: draft("generating", step) }), { kind: "busy", label });
  assert.equal(stepLabel("draft", "something new"), "Writing");
});

test("a ready draft offers Publish content and opens its doc", () => {
  assert.deepEqual(writeState({ item, brief: brief("approved"), draft: draft("ready") }), { kind: "publish", docId: "d1", draftId: "dr1", briefId: "b1" });
});

test("a ready draft whose doc is not saved yet stays busy", () => {
  assert.deepEqual(writeState({ item, brief: brief("approved"), draft: draft("ready", "done", null) }), { kind: "busy", label: "Saving" });
});

test("a failed draft over a ready or approved outline is Try again on the draft", () => {
  for (const s of ["ready", "approved"] as const)
    assert.deepEqual(writeState({ item, brief: brief(s), draft: draft("failed", "check", null, "Claude timed out") }), { kind: "retry", target: "draft", error: "Claude timed out", briefId: "b1" });
});

test("a regenerated outline under a failed draft still shows the draft's Try again", () => {
  assert.equal(writeState({ item, brief: brief("generating", "writing"), draft: draft("failed") }).kind, "retry");
});

test("a published piece with its link offers View post, whatever the writer holds", () => {
  const live = { status: "published", url: "https://example.com/post" };
  assert.deepEqual(writeState({ item: live, brief: brief("approved"), draft: draft("ready") }), { kind: "view", url: "https://example.com/post", docId: "d1" });
  assert.deepEqual(writeState({ item: live, brief: null, draft: null }), { kind: "view", url: "https://example.com/post", docId: null });
  assert.deepEqual(writeState({ item: live, brief: brief("generating"), draft: draft("failed") }), { kind: "view", url: "https://example.com/post", docId: "d1" });
});

test("published without a link falls back to the writer's state", () => {
  assert.equal(writeState({ item: { status: "published", url: null }, brief: brief("approved"), draft: draft("ready") }).kind, "publish");
});

test("the Library filter groups each state", () => {
  assert.equal(libraryGroup({ kind: "outline" }), "none");
  assert.equal(libraryGroup({ kind: "busy", label: "Researching" }), "outlines");
  assert.equal(libraryGroup({ kind: "busy", label: "Reviewing" }), "drafts");
  assert.equal(libraryGroup({ kind: "draft", briefId: "b" }), "outlines");
  assert.equal(libraryGroup({ kind: "publish", docId: "d", draftId: "x", briefId: "b" }), "drafts");
  assert.equal(libraryGroup({ kind: "retry", target: "draft", error: "e", briefId: "b" }), "drafts");
  assert.equal(libraryGroup({ kind: "retry", target: "outline", error: "e", briefId: "b" }), "outlines");
  assert.equal(libraryGroup({ kind: "view", url: "u", docId: null }), "published");
});
