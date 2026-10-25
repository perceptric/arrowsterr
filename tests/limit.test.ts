import assert from "node:assert/strict";
import { test } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { limitKey, limitMissing, underLimit } from "../src/lib/limit.ts";

test("limit keys keep the scope and never hold the raw value", () => {
  const k = limitKey("unlock-ip", "203.0.113.7");
  assert.match(k, /^unlock-ip:[a-f0-9]{32}$/);
  assert.ok(!k.includes("203.0.113.7"));
  assert.equal(k, limitKey("unlock-ip", "203.0.113.7"), "the same value gives the same key");
  assert.notEqual(limitKey("unlock-ip", "203.0.113.7"), limitKey("oauth-register", "203.0.113.7"), "scopes never share a count");
  assert.notEqual(limitKey("mcp", "aw_live_a"), limitKey("mcp", "aw_live_b"));
});

const fake = (res: { data?: unknown; error?: { code?: string; message: string } | null }) => ({ rpc: async () => ({ data: res.data ?? null, error: res.error ?? null }) }) as unknown as SupabaseClient;

test("only a missing hit_limit lets calls through; other errors block", async () => {
  assert.equal(limitMissing({ code: "PGRST202", message: "Could not find the function public.hit_limit(p_key, p_max, p_window_seconds) in the schema cache" }), true);
  assert.equal(limitMissing({ code: "42883", message: "function public.hit_limit(text, integer, integer) does not exist" }), true);
  assert.equal(limitMissing({ code: "42501", message: "permission denied for function hit_limit" }), false);
  assert.equal(limitMissing({ code: "57014", message: "canceling statement due to statement timeout" }), false);

  const warn = console.warn;
  const err = console.error;
  console.warn = () => {};
  console.error = () => {};
  try {
    assert.equal(await underLimit(fake({ data: true }), "k", 10, 60), true);
    assert.equal(await underLimit(fake({ data: false }), "k", 10, 60), false);
    assert.equal(await underLimit(fake({ error: { code: "PGRST202", message: "Could not find the function public.hit_limit in the schema cache" } }), "k", 10, 60), true);
    assert.equal(await underLimit(fake({ error: { code: "57014", message: "timeout" } }), "k", 10, 60), false);
  } finally {
    console.warn = warn;
    console.error = err;
  }
});
