import assert from "node:assert/strict";
import { test } from "node:test";
import { plainError } from "../src/lib/authErrors.ts";

test("Supabase sign-in and sign-up errors read as plain lines", () => {
  assert.equal(plainError("Invalid login credentials"), "Wrong email or password.");
  assert.equal(plainError("Email rate limit exceeded"), "Too many tries. Wait a minute and try again.");
  assert.equal(plainError("For security purposes, you can only request this after 42 seconds."), "Too many tries. Wait a minute and try again.");
  assert.equal(plainError("User already registered"), "This email already has an account.");
  assert.equal(plainError("Password should be at least 8 characters."), "Use a password with at least 8 characters.");
  assert.equal(plainError("Signups not allowed for this instance"), "New accounts are closed right now.");
  assert.equal(plainError("Unable to validate email address: invalid format"), "Enter a valid email address.");
  assert.equal(plainError("Failed to fetch"), "Can't reach Arrowsterr. Check your connection and try again.");
});

test("an error not on the list shows as it came", () => {
  assert.equal(plainError("Something new went wrong"), "Something new went wrong");
});
