import { test } from "node:test";
import assert from "node:assert/strict";
import { replyText, requestBody, thinkingFix, thinkingOffFor, withoutThinking } from "../src/lib/claudeRequest.ts";

test("a JSON request turns thinking off and keeps the schema, the cache marks and the token limit", () => {
  const b = requestBody("Write the brief.", { schema: { type: "object" }, prefix: "brand and research", system: "editor", maxTokens: 12000 }, "claude-sonnet-5-5");
  assert.deepEqual(b.thinking, { type: "between_tools" });
  assert.deepEqual(requestBody("x", { schema: {} }, "claude-haiku-5-5", "disabled").thinking, { type: "disabled" });
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

test("the API's own error says how this model turns thinking off, and only a real change is taken", () => {
  // The error the Phase 0 baseline run got from Sonnet 5.5.
  const sonnet = '400 {"type":"error","error":{"type":"invalid_request_error","message":"To turn thinking off on this model, send \\"thinking\\": {\\"type\\": \\"between_tools\\"} instead of {\\"type\\": \\"disabled\\"}. The model does not think before responding."}}';
  assert.equal(thinkingFix(sonnet, "disabled"), "between_tools");
  assert.equal(thinkingFix(sonnet, "between_tools"), null); // already sent: no loop
  assert.equal(thinkingFix('To turn thinking off on this model, send "thinking": {"type": "disabled"} instead.', "between_tools"), "disabled");
  assert.equal(thinkingFix("max_tokens: must be at most 64000", "between_tools"), null);
});

test("each model starts with the thinking-off it takes, and Haiku's refusal of between_tools falls back to disabled", () => {
  assert.equal(thinkingOffFor("claude-sonnet-5-5"), "between_tools");
  assert.equal(thinkingOffFor("claude-haiku-5-5"), "disabled");
  assert.equal(thinkingOffFor("claude-opus-5-5"), "omit");
  assert.deepEqual(requestBody("x", { schema: {} }, "claude-haiku-5-5").thinking, { type: "disabled" });
  assert.equal("thinking" in requestBody("x", { schema: {} }, "claude-opus-5-5"), false);
  // The error onboarding got from Haiku 5.5, November 2026.
  const haiku = '400 {"type":"error","error":{"type":"invalid_request_error","message":"\\"thinking.type.between_tools\\" is not supported for this model."},"request_id":"req_011ChKJoBkoAX7f2g3hxCvXV"}';
  assert.equal(thinkingFix(haiku, "between_tools"), "disabled");
  assert.equal(thinkingFix(haiku, "disabled"), null);
  assert.equal(thinkingFix('"thinking.type.disabled" is not supported for this model.', "disabled"), "omit");
  assert.equal(thinkingFix('"thinking.type.disabled" is not supported for this model.', "omit"), null);
});

test("withoutThinking drops old thinking blocks so a changed system prompt can't break a chat", () => {
  const turns = [
    { role: "user" as const, content: "Suggest what to write" },
    { role: "assistant" as const, content: [{ type: "thinking", thinking: "x", signature: "s" }, { type: "text", text: "Here are 5" }] },
    { role: "assistant" as const, content: [{ type: "redacted_thinking", data: "d" }] },
    { role: "user" as const, content: [{ type: "tool_result", tool_use_id: "t", content: "ok" }] },
  ];
  const out = withoutThinking(turns);
  assert.deepEqual(out[1].content, [{ type: "text", text: "Here are 5" }]);
  assert.deepEqual(out[2].content, [{ type: "text", text: "(no reply)" }]);
  assert.equal(out[0], turns[0]);
  assert.equal(out[3], turns[3]);
});
