import { test } from "node:test";
import assert from "node:assert/strict";
import { autopilotDue, cleanAutopilot, hourLabel, localClock, rankPicks, type PickInput } from "../src/lib/contentPicks.ts";

const item = (over: Partial<PickInput>): PickInput => ({ id: "x", keyword: "kw", volume: 1000, difficulty: 40, stage: "tofu", due_date: null, status: "planned", written: false, ...over });

test("picks skip written and published pieces, and rank easy, big, buyer pieces due soon first", () => {
  const picks = rankPicks(
    [
      item({ id: "hard", keyword: "what is agentic ai", volume: 35300, difficulty: 57 }),
      item({ id: "easy", keyword: "unreasonable hospitality", volume: 27100, difficulty: 18, due_date: "2026-12-01" }),
      item({ id: "buyer", keyword: "review management software", volume: 900, difficulty: 30, stage: "bofu" }),
      item({ id: "done", keyword: "written already", volume: 90000, difficulty: 5, written: true }),
      item({ id: "live", keyword: "published already", volume: 90000, difficulty: 5, status: "published" }),
    ],
    "2026-11-24",
    3,
  );
  assert.deepEqual(picks.map((p) => p.item_id), ["easy", "buyer", "hard"], "an easy buyer keyword beats a hard one with more searches");
  assert.equal(picks[0].why, "Easy to rank, 27,100 searches a month, due Dec 1");
  assert.match(picks[1].why, /brings buyers/);
});

test("a piece with no numbers still gets a reason, and n stays between 1 and 10", () => {
  const picks = rankPicks([item({ volume: null, difficulty: null, stage: null })], "2026-11-24", 0);
  assert.equal(picks.length, 1);
  assert.equal(picks[0].why, "On your Calendar");
});

test("Autopilot runs once a day after its hour, in the workspace's time zone, and skips weekends on weekdays", () => {
  const a = cleanAutopilot({ on: true, cadence: "weekdays", hour: 8, by: "u1" });
  // 01:30 UTC on Tue 24 Nov is 08:30 in Saigon (UTC+7).
  const tue = new Date("2026-11-24T01:30:00Z");
  assert.deepEqual(localClock(tue, "Asia/Saigon"), { day: "2026-11-24", hour: 8, weekday: 2 });
  assert.equal(autopilotDue(a, tue, "Asia/Saigon").due, true);
  assert.equal(autopilotDue({ ...a, lastRun: "2026-11-24" }, tue, "Asia/Saigon").due, false, "once a day");
  assert.equal(autopilotDue(a, new Date("2026-11-23T23:30:00Z"), "Asia/Saigon").due, false, "before 8:00 local");
  assert.equal(autopilotDue(a, new Date("2026-11-28T03:00:00Z"), "Asia/Saigon").due, false, "Saturday");
  assert.equal(autopilotDue({ ...a, cadence: "daily" }, new Date("2026-11-28T03:00:00Z"), "Asia/Saigon").due, true);
  assert.equal(autopilotDue({ ...a, on: false }, tue, "Asia/Saigon").due, false);
  assert.equal(autopilotDue({ ...a, by: null }, tue, "Asia/Saigon").due, false, "needs the person who turned it on");
  assert.equal(localClock(tue, "Not/AZone").day, "2026-11-24", "an unknown zone falls back to UTC");
});

test("a saved Autopilot is checked field by field", () => {
  assert.deepEqual(cleanAutopilot({ on: true, hour: 99, count: 9, stop: "x", cadence: "y" }), { on: true, cadence: "daily", hour: 8, count: 1, stop: "draft", by: null, lastRun: null, threadId: null });
  assert.equal(hourLabel(0), "12:00 AM");
  assert.equal(hourLabel(8), "8:00 AM");
  assert.equal(hourLabel(15), "3:00 PM");
});
