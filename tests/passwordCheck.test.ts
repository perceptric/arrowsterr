// The password meter (src/lib/passwordCheck.ts). It proves: strength goes by length, and only short, well-known or
// one-character passwords are too weak, so long passwords with repeats or sequences inside still read as Strong.
import { test } from "node:test";
import assert from "node:assert/strict";
import { strength } from "../src/lib/passwordCheck.ts";

test("strength goes by length; only short, well-known or one-character passwords are too weak", () => {
  for (const p of ["password1", "arrowsterr123", "12345678", "aaaaaaaa", "short"]) assert.equal(strength(p).score, 1, p);
  assert.equal(strength("").score, 0);
  assert.deepEqual(strength("tulip-moon"), { score: 2, label: "Okay" });
  assert.deepEqual(strength("abcd1234efgh"), { score: 3, label: "Good" });
  assert.deepEqual(strength("Plum-Harbor-Window-42"), { score: 4, label: "Strong" });
  assert.deepEqual(strength("hoanghy2032002hoanghy2032002abc"), { score: 4, label: "Strong" });
  assert.deepEqual(strength("passwordsarelongnow"), { score: 4, label: "Strong" });
});
