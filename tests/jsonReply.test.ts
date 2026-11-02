import { test } from "node:test";
import assert from "node:assert/strict";
import { isGrammarError, schemaPrompt } from "../src/lib/jsonReply.ts";

test("spots the API's grammar too large error", () => {
  const msg = '400 {"type":"error","error":{"type":"invalid_request_error","message":"The compiled grammar is too large, which would cause performance issues. Simplify your tool schemas or reduce the number of strict tools."}}';
  assert.equal(isGrammarError(Object.assign(new Error(msg), { status: 400 })), true);
  assert.equal(isGrammarError(new Error(msg)), true);
});

test("leaves other errors alone", () => {
  assert.equal(isGrammarError(Object.assign(new Error("429 rate limited"), { status: 429 })), false);
  assert.equal(isGrammarError(Object.assign(new Error("400 max_tokens is too large"), { status: 400 })), false);
  assert.equal(isGrammarError(Object.assign(new Error("compiled grammar is too large"), { status: 500 })), false);
  assert.equal(isGrammarError(null), false);
});

test("writes the schema into the prompt", () => {
  const p = schemaPrompt("Build the kit.", { type: "object", required: ["name"] });
  assert.ok(p.startsWith("Build the kit."));
  assert.ok(p.includes('{"type":"object","required":["name"]}'));
});
