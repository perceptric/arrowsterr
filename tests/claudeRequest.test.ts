import { test } from "node:test";
import assert from "node:assert/strict";
import { replyText, requestBody } from "../src/lib/claudeRequest.ts";

test("a JSON request turns thinking off and keeps the schema, the cache marks and the token limit", () => {
  const b = requestBody("Write the brief.", { schema: { type: "object" }, prefix: "brand and research", system: "editor", maxTokens: 12000 }, "claude-sonnet-5-5");
  assert.deepEqual(b.thinking, { type: "disabled" });
  assert.deepEqual(b.output_config, { format: { type: "json_schema", schema: { type: "object" } } });
  assert.equal(b.max_tokens, 12000);
  assert.equal(b.system?.[0].cache_control?.type, "ephemeral");
  const content = b.messages[0].content as { text: string; cache_control?: unknown }[];
  assert.equal(content[0].text, "brand and research");
  assert.ok(content[0].cache_control);
  assert.equal(content[1].text, "Write the brief.");
});

test("a plain request leaves thinking to the model and can search", () => {
  const b = requestBody("Who ranks for this?", { searches: 3 }, "claude-sonnet-5-5");
  assert.equal("thinking" in b, false);
  assert.equal("output_config" in b, false);
  assert.equal(b.messages[0].content, "Who ranks for this?");
  assert.equal(b.tools?.[0].max_uses, 3);
});

test("a reply that spent every token thinking fails with a clear reason; a normal reply returns its text", () => {
  // What the Phase 0 baseline run got back from a brief call.
  assert.throws(() => replyText({ content: [{ type: "thinking" }], stop_reason: "max_tokens", usage: { output_tokens: 12000 } }), /used all 12000 reply tokens before writing an answer \(thinking\)/);
  assert.equal(replyText({ content: [{ type: "thinking" }, { type: "text", text: '{"a":1}' }], stop_reason: "end_turn" }), '{"a":1}');
  assert.equal(replyText({ content: [{ type: "text", text: "" }], stop_reason: "end_turn" }), "");
});
