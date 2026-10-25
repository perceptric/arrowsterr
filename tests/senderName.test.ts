import { test } from "node:test";
import assert from "node:assert/strict";
import { senderName } from "../src/lib/senderName.ts";

test("a white-label sender name says it came through Arrowsterr", () => {
  assert.equal(senderName("Acme Agency"), "Acme Agency via Arrowsterr");
  assert.equal(senderName("Arrowsterr"), "Arrowsterr");
  assert.equal(senderName("arrowsterr"), "Arrowsterr");
  assert.equal(senderName(""), "Arrowsterr");
  assert.equal(senderName(null), "Arrowsterr");
  assert.equal(senderName("Acme via Arrowsterr"), "Acme via Arrowsterr");
  assert.equal(senderName('Bank "Support" <x@y.z>\r\nBcc: a'), "Bank Support x@y.z Bcc: a via Arrowsterr");
  assert.ok(senderName("x".repeat(200)).endsWith(" via Arrowsterr"));
  assert.ok(senderName("x".repeat(200)).length <= 80);
});
