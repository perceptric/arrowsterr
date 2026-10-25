import { test } from "node:test";
import assert from "node:assert/strict";
import { rankCommands, scoreCommand, type Command } from "../src/lib/commands.ts";

const LIST: Command[] = [
  { id: "prompts", label: "Prompts", group: "Screens", words: "ai visibility" },
  { id: "domain", label: "Domain Research", group: "Screens", words: "organic research" },
  { id: "calendar", label: "Editorial Calendar", group: "Screens", words: "content" },
  { id: "add", label: "Add prompts", group: "Actions" },
  { id: "billing", label: "Plans and billing", group: "Settings" },
  { id: "acme", label: "Acme", group: "Brands", hint: "acme.com" },
  { id: "p1", label: "best crm for startups", group: "Prompts", hint: "CRM", searchOnly: true },
  { id: "k1", label: "crm pricing", group: "Editorial Calendar", searchOnly: true },
];
const ids = (q: string) => rankCommands(LIST, q).map((c) => c.id);

test("commands: an empty query shows everything but search-only rows, actions first", () => {
  assert.deepEqual(ids(""), ["add", "prompts", "domain", "calendar", "acme", "billing"]);
});

test("commands: the label's start beats a word's start, which beats anywhere", () => {
  assert.deepEqual(ids("pro").slice(0, 2), ["prompts", "add"]);
  assert.equal(ids("research")[0], "domain");
  assert.ok(scoreCommand(LIST[1], "domain") > scoreCommand(LIST[1], "search"));
});

test("commands: every word must match, in the label or its other words", () => {
  assert.deepEqual(ids("crm"), ["k1", "p1"]);
  assert.deepEqual(ids("crm startups"), ["p1"]);
  assert.deepEqual(ids("visibility"), ["prompts"]);
  assert.deepEqual(ids("acme.com"), ["acme"]);
  assert.deepEqual(ids("zzz"), []);
});

test("commands: letters in order find a screen, but only from 3 letters", () => {
  assert.deepEqual(ids("edcal"), ["calendar"]);
  assert.equal(scoreCommand(LIST[2], "ec"), 0);
});

test("commands: case and spaces don't matter, and the limit holds", () => {
  assert.deepEqual(ids("  DOMAIN   research "), ["domain"]);
  assert.equal(rankCommands(LIST, "", 2).length, 2);
});
