import assert from "node:assert/strict";
import { test } from "node:test";
import { readyCheck } from "../src/lib/readyCheck.ts";

test("a failed check is tried again after the wait", async () => {
  let t = 0;
  let calls = 0;
  const answers = [false, true];
  const ready = readyCheck(async () => answers[calls++], 60_000, () => t);

  assert.equal(await ready(), false, "the database blinked at boot");
  t = 30_000;
  assert.equal(await ready(), false, "still inside the wait");
  assert.equal(calls, 1, "no second probe inside the wait");
  t = 61_000;
  assert.equal(await ready(), true, "the queue comes back without a redeploy");
  assert.equal(calls, 2);
});

test("a passing check is remembered", async () => {
  let calls = 0;
  const ready = readyCheck(async () => (calls++, true));
  assert.equal(await ready(), true);
  assert.equal(await ready(), true);
  assert.equal(calls, 1);
});

test("a probe that throws counts as not ready", async () => {
  const ready = readyCheck(async () => {
    throw new Error("connection reset");
  });
  assert.equal(await ready(), false);
});
