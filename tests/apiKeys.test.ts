import assert from "node:assert/strict";
import { test } from "node:test";
import { hashKey, KEY_PREFIX, keyKind, keyOf, makeKey, rowProblem } from "../src/lib/apiKeys.ts";

test("keys: each kind has its own prefix, and only the hash is kept", () => {
  for (const kind of ["live", "partner", "brand"] as const) {
    const k = makeKey(kind);
    assert.ok(k.key.startsWith(KEY_PREFIX[kind]), kind);
    assert.equal(k.prefix, k.key.slice(0, KEY_PREFIX[kind].length + 6));
    assert.equal(k.hash, hashKey(k.key));
    assert.notEqual(k.hash, k.key);
    assert.ok(k.key.length >= KEY_PREFIX[kind].length + 32);
    assert.equal(keyKind(k.key), kind);
  }
  assert.deepEqual(KEY_PREFIX, { live: "aw_live_", partner: "aw_partner_", brand: "aw_brand_" });
  assert.notEqual(makeKey("brand").key, makeKey("brand").key);
});

test("keys: anything else is not a key", () => {
  for (const k of ["", null, undefined, "aw_live_", "aw_brand_", "aw_partner_", "cb_partner_abc", "aw_other_abc", "Bearer aw_live_x", " aw_live_x"]) assert.equal(keyKind(k), null, String(k));
});

test("keys: read from X-API-Key or a Bearer token", () => {
  assert.equal(keyOf(new Request("https://x", { headers: { "x-api-key": " aw_brand_abc " } })), "aw_brand_abc");
  assert.equal(keyOf(new Request("https://x", { headers: { authorization: "Bearer aw_partner_abc" } })), "aw_partner_abc");
  assert.equal(keyOf(new Request("https://x", { headers: { authorization: "bearer aw_live_abc" } })), "aw_live_abc");
  assert.equal(keyOf(new Request("https://x")), "");
});

test("keys: the saved row must agree with the prefix", () => {
  const row = { id: "k", workspace_id: "w" };
  assert.equal(rowProblem("live", row), null);
  assert.equal(rowProblem("live", { ...row, partner: true }), "invalid");
  assert.equal(rowProblem("live", { ...row, brand_id: "b" }), "invalid");
  assert.equal(rowProblem("partner", { ...row, partner: true }), null);
  assert.equal(rowProblem("partner", row), "invalid");
  assert.equal(rowProblem("brand", { ...row, brand_id: "b" }), null);
  assert.equal(rowProblem("brand", row), "invalid");
  assert.equal(rowProblem("brand", { ...row, brand_id: "b", revoked_at: "2026-01-01" }), "invalid");
  assert.equal(rowProblem("live", { ...row, expires_at: "2000-01-01" }), "expired");
  assert.equal(rowProblem("live", null), "invalid");
});
