import { test } from "node:test";
import assert from "node:assert/strict";
import { errorText, friendly, httpError, readable, splitRef } from "../src/lib/errors.ts";

const THINKING =
  '400 {"type":"error","error":{"type":"invalid_request_error","message":"messages.1.content.0: Invalid `signature` in `thinking` block. The block is bound to a different conversation. Remove the block, or set `thinking.block_binding.prefix_mismatch_behavior` to \\"drop_block\\". That setting requires the `thinking-binding-controls-2026-08-01` value in the `anthropic-beta` header. The `system` prompt differs from the one this block was created with."},"request_id":"req_011ChT9EtgjWuwyj93BqsV5u"}';

const clean = (m: string) => {
  assert.doesNotMatch(m, /[{}<>`]|req_|request_id|invalid_request|anthropic|supabase|\b[45]\d\d\b|https?:/i, m);
  assert.ok(m.length <= 160, m);
};

test("the 400 thinking-block error from a Zippie chat becomes plain words with a ref", () => {
  const f = friendly(new Error(THINKING));
  assert.equal(f.message, "Zippie hit a problem with this chat. Try again, or start a new chat.");
  assert.ok(f.ref && /^[A-Z0-9]{5}$/.test(f.ref));
  assert.equal(f.retry, true);
  clean(errorText(new Error(THINKING)).replace(/\(Ref [A-Z0-9]+\)/, ""));
});

test("a busy model, a lost connection and a timeout say what to do", () => {
  assert.equal(friendly(Object.assign(new Error('529 {"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}'), { status: 529 })).message, "Zippie is busy right now. Try again in a minute.");
  assert.equal(friendly(new TypeError("fetch failed")).message, "The connection dropped. Check your internet and try again.");
  assert.equal(friendly(new TypeError("Failed to fetch")).retry, true);
  assert.equal(friendly(Object.assign(new Error("The operation timed out."), { name: "TimeoutError" })).message, "This took too long. Try again in a moment.");
});

test("Google: an expired sign-in and an API that is off point to Settings", () => {
  assert.match(friendly(new Error('Google sign-in failed: invalid_grant')).message, /Connect Google again in Settings → Integrations/);
  assert.match(friendly(new Error("Google Analytics Admin API has not been used in project 935070191288 before or it is disabled.")).message, /Settings → Integrations/);
});

test("database errors never show SQL", () => {
  const f = friendly({ message: 'relation "public.writer_runs" does not exist', code: "42P01" });
  clean(f.message);
  assert.ok(f.ref);
  assert.equal(friendly({ message: 'duplicate key value violates unique constraint "brands_pkey"', code: "23505" }).message, "That already exists.");
});

test("Stripe keeps its own card words; a site's sign-in names the site", () => {
  assert.equal(friendly({ type: "StripeCardError", message: "Your card has insufficient funds." }).message, "Your card has insufficient funds.");
  assert.match(friendly(new Error("WordPress said no: 401 rest_forbidden")).message, /^WordPress stopped accepting/);
});

test("an unknown error gets the generic words and a ref; our own sentences pass through", () => {
  const f = friendly(new Error("Cannot read properties of undefined (reading 'map')"));
  assert.equal(f.message, "Something went wrong. Try again.");
  assert.ok(f.ref);
  assert.equal(friendly(new Error("Set up the brand's website in Research first.")).message, "Set up the brand's website in Research first.");
  assert.equal(friendly(new Error("Run supabase/050_agentic_writer.sql in Supabase.")).message, "Something went wrong. Try again.");
  assert.equal(friendly("x", "Couldn't save the draft.").message, "Couldn't save the draft. Try again.");
  assert.equal(readable("The server returned 500."), false);
});

test("statuses: signed out, no access, not found, too large", () => {
  assert.equal(friendly({ message: "", status: 401 }).message, "Your session ended. Sign in again to keep going.");
  assert.equal(friendly({ message: "Only admins can change billing.", status: 403 }).message, "Only admins can change billing.");
  assert.match(friendly({ message: "not found", status: 404 }).message, /couldn't find that/);
  assert.match(friendly({ message: "", status: 413 }).message, /too large/);
});

test("httpError keeps the route's words and ref, and splitRef reads it back", () => {
  const e = httpError(500, { error: "Something went wrong. Try again.", ref: "7KQ2M" });
  assert.equal(e.message, "Something went wrong. Try again.");
  assert.equal(errorText(e), "Something went wrong. Try again. (Ref 7KQ2M)");
  assert.deepEqual(splitRef(errorText(e)), { words: "Something went wrong. Try again.", ref: "7KQ2M" });
  assert.equal(httpError(402, { error: "You've used this month's drafts.", limit: true }).limit, true);
  assert.equal(errorText(errorText(e)), "Something went wrong. Try again. (Ref 7KQ2M)");
});
