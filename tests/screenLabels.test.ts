import { test } from "node:test";
import assert from "node:assert/strict";
import { statusLabel } from "../src/lib/changeStatus.ts";
import { tabOf } from "../src/lib/tabs.ts";

test("statusLabel: known states read as words", () => {
  assert.equal(statusLabel("ready"), "Waiting");
  assert.equal(statusLabel("partly"), "Partly live");
  assert.equal(statusLabel("rejected"), "Skipped");
});

test("statusLabel: other words get sentence case, missing prints a dash", () => {
  assert.equal(statusLabel("high"), "High");
  assert.equal(statusLabel("needs_review"), "Needs review");
  assert.equal(statusLabel(""), "–");
  assert.equal(statusLabel(null), "–");
});

test("tabOf: the address's tab, or the first one", () => {
  const tabs = ["files", "schedules", "links"] as const;
  assert.equal(tabOf("links", tabs, "files"), "links");
  assert.equal(tabOf(undefined, tabs, "files"), "files");
  assert.equal(tabOf("nope", tabs, "files"), "files");
});
