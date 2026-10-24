import assert from "node:assert/strict";
import { test } from "node:test";
import { cleanSchedule, dueWork, nextRun, PDF_WAIT_MS, recipientList, scheduleProblem, sendKey, sendStep, whenLine, zonedTime, type SendRow, type When } from "../src/lib/schedules.ts";

const iso = (t: number | Date) => new Date(t).toISOString();
const weekly = (weekday: number, hour: number, timezone: string): When => ({ cadence: "weekly", weekday, monthday: null, hour, timezone });
const monthly = (monthday: number, hour: number, timezone: string): When => ({ cadence: "monthly", weekday: null, monthday, hour, timezone });

test("a zone's wall clock: London in summer, Kolkata's half hour, and both clock changes in New York", () => {
  assert.equal(iso(zonedTime(2026, 7, 1, 9, "Europe/London")), "2026-07-01T08:00:00.000Z");
  assert.equal(iso(zonedTime(2026, 7, 1, 9, "Asia/Kolkata")), "2026-07-01T03:30:00.000Z");
  // 2:00 never happens on March 8, 2026 in New York: the send goes at 3:00, just after the jump.
  assert.equal(iso(zonedTime(2026, 3, 8, 2, "America/New_York")), "2026-03-08T07:00:00.000Z");
  // 1:00 happens twice on November 1, 2026: the first one.
  assert.equal(iso(zonedTime(2026, 11, 1, 1, "America/New_York")), "2026-11-01T05:00:00.000Z");
});

test("next run: weekly on its weekday, monthly on its day, always after now", () => {
  const fri = Date.parse("2026-10-23T12:00:00Z"); // a Friday
  assert.equal(iso(nextRun(weekly(1, 9, "America/New_York"), fri)), "2026-10-26T13:00:00.000Z", "Monday 9:00 EDT");
  assert.equal(iso(nextRun(weekly(5, 8, "UTC"), fri)), "2026-10-30T08:00:00.000Z", "today's 8:00 has passed, so next Friday");
  assert.equal(iso(nextRun(weekly(5, 13, "UTC"), fri)), "2026-10-23T13:00:00.000Z", "later today");
  assert.equal(iso(nextRun(monthly(1, 9, "Europe/London"), fri)), "2026-11-01T09:00:00.000Z", "GMT after the clocks go back");
  // Exactly on the due time counts as passed: the next one is a month on.
  assert.equal(iso(nextRun(monthly(28, 0, "Asia/Tokyo"), Date.parse("2026-10-27T15:00:00Z"))), "2026-11-27T15:00:00.000Z");
  // A broken zone falls back to UTC instead of failing.
  assert.equal(iso(nextRun(weekly(1, 9, "Not/AZone"), fri)), "2026-10-26T09:00:00.000Z");
});

test("a monthly schedule sends on time, once each, for 3 months in a row (time travel)", () => {
  const s = { id: "s1", active: true, next_run_at: null as string | null, ...monthly(1, 9, "America/New_York") };
  const created = Date.parse("2026-10-23T15:00:00Z");
  s.next_run_at = nextRun(s, created).toISOString();
  const sends = new Map<string, number>(); // one row per schedule per due time, like report_sends' unique key
  const order: string[] = [];
  for (let t = created; t < Date.parse("2027-01-31T00:00:00Z"); t += 10 * 60_000) {
    // Two scheduler ticks run at the same moment and read the same schedule.
    const a = dueWork([s], t);
    const b = dueWork([s], t);
    for (const w of [...a, ...b]) {
      const key = `${w.schedule.id}|${w.dueAt}`;
      if (!sends.has(key)) {
        sends.set(key, t);
        order.push(w.dueAt);
      }
    }
    // Moving the schedule on only works if nobody moved it first (compare and set on next_run_at).
    for (const w of [...a, ...b]) if (s.next_run_at === w.dueAt) s.next_run_at = w.next;
  }
  assert.deepEqual(order.map((d) => iso(Date.parse(d))), ["2026-11-01T14:00:00.000Z", "2026-12-01T14:00:00.000Z", "2027-01-01T14:00:00.000Z"]);
  for (const [key, queuedAt] of sends) assert.ok(queuedAt - Date.parse(key.split("|")[1]) < 10 * 60_000, `${key} was queued within one tick`);
});

test("a schedule that missed several times while the worker was down sends once, then moves past now", () => {
  const s = { id: "s1", active: true, next_run_at: "2026-10-05T09:00:00.000Z", ...weekly(1, 9, "UTC") };
  const now = Date.parse("2026-10-23T12:00:00Z");
  const work = dueWork([s, { ...s, id: "off", active: false }, { ...s, id: "later", next_run_at: "2026-11-01T00:00:00.000Z" }], now);
  assert.deepEqual(work.map((w) => [w.schedule.id, w.dueAt, w.next]), [["s1", "2026-10-05T09:00:00.000Z", "2026-10-26T09:00:00.000Z"]]);
});

const ok = { active: true, allowed: true, email: true };
const send = (p: Partial<SendRow> = {}): SendRow => ({ status: "working", file_ids: [], created_at: "2026-10-26T09:00:00.000Z", ...p });
const NOW = Date.parse("2026-10-26T09:05:00Z");

test("a send makes its files once, waits for the PDFs, then emails", () => {
  assert.deepEqual(sendStep(send(), null, ok, NOW), { do: "make" });
  const two = send({ file_ids: ["a", "b"] });
  assert.deepEqual(sendStep(two, [{ status: "ready", error: null }, { status: "making", error: null }], ok, NOW), { do: "wait" });
  assert.deepEqual(sendStep(two, [{ status: "ready", error: null }, { status: "ready", error: null }], ok, NOW), { do: "email" });
  assert.deepEqual(sendStep(two, [{ status: "ready", error: null }, { status: "making", error: null }], ok, NOW + PDF_WAIT_MS), { do: "fail", error: "The PDFs took too long." });
  assert.deepEqual(sendStep(two, [{ status: "ready", error: null }, { status: "failed", error: "Print page answered 500." }], ok, NOW), { do: "fail", error: "Print page answered 500." });
  assert.deepEqual(sendStep(two, [{ status: "making", error: "Chromium crashed", jobDead: true }, { status: "ready", error: null }], ok, NOW), { do: "fail", error: "Chromium crashed" });
  assert.deepEqual(sendStep(two, [{ status: "ready", error: null }], ok, NOW), { do: "fail", error: "A PDF for this send was deleted." });
});

test("a send stops when the schedule was paused, the plan has no schedules, or email is off", () => {
  assert.equal(sendStep(send(), null, { ...ok, active: false }).do, "fail");
  assert.deepEqual(sendStep(send(), null, { ...ok, allowed: false }), { do: "fail", error: "This plan has no scheduled reports." });
  assert.deepEqual(sendStep(send(), null, { ...ok, email: false }), { do: "fail", error: "Email is not set up on the server." });
});

test("no double sends under forced retries, even when the worker dies right after the email", () => {
  const row = send({ file_ids: ["a"] });
  const files = [{ status: "ready" as const, error: null }];
  const accepted = new Set<string>(); // the provider keeps one email per idempotency key
  let calls = 0;
  const run = (crashAfterEmail: boolean) => {
    const step = sendStep(row, files, ok, NOW);
    if (step.do === "email") {
      calls++;
      accepted.add(sendKey("send-1"));
      if (crashAfterEmail) throw new Error("worker died before saving");
      row.status = "sent";
    }
    return step.do;
  };
  assert.throws(() => run(true));
  assert.equal(run(false), "email", "the retry sends again, with the same key");
  for (let i = 0; i < 5; i++) assert.equal(run(false), "done", "a sent send never emails again");
  assert.equal(calls, 2);
  assert.equal(accepted.size, 1, "the provider delivered it once");
  assert.equal(sendStep({ ...row, status: "failed" }, files, ok, NOW).do, "done");
});

test("schedules are checked before saving: pages, days, hours, zones and addresses", () => {
  const base = { brandId: "b1", pages: ["prompts", "keywords", "sources", "prompts"], cadence: "weekly", weekday: 1, hour: 9, timezone: "Europe/London", recipients: "A@acme.com, b@acme.com\na@acme.com", params: { days: 90, topic: "CRM" } };
  const r = cleanSchedule(base, 30);
  assert.ok("value" in r);
  assert.deepEqual(r.value.pages, ["prompts", "sources"], "research pages are download-only");
  assert.deepEqual(r.value.recipients, ["a@acme.com", "b@acme.com"]);
  assert.deepEqual(r.value.params, { days: 30, topic: null, model: null }, "inside the plan's history, every topic and model");
  assert.equal(r.value.name, "Weekly report");
  assert.equal(r.value.monthday, null);
  const err = (patch: Record<string, unknown>) => {
    const x = cleanSchedule({ ...base, ...patch });
    return "error" in x ? x.error : "";
  };
  assert.equal(err({ brandId: "" }), "Pick a brand.");
  assert.equal(err({ pages: ["keywords"] }), "Pick at least one page.");
  assert.equal(err({ hour: 24 }), "Pick an hour.");
  assert.equal(err({ cadence: "monthly", monthday: 31 }), "Pick a day from 1 to 28.");
  assert.equal(err({ timezone: "Mars/Olympus" }), "Pick a time zone.");
  assert.equal(err({ recipients: "a@acme.com, nope" }), "Check this address: nope.");
  assert.equal(err({ recipients: "" }), "Add at least one email address.");
  assert.equal(err({ recipients: Array.from({ length: 26 }, (_, i) => `p${i}@acme.com`) }), "Up to 25 email addresses.");
});

test("addresses, plan limits and the line that says when", () => {
  assert.deepEqual(recipientList(" x@a.io ;y@b.co  bad@ "), { emails: ["x@a.io", "y@b.co"], bad: ["bad@"] });
  assert.equal(scheduleProblem(0, 0)?.error, "Scheduled reports are on Starter and up.");
  assert.equal(scheduleProblem(2, 2)?.error, "Your plan has 2 active schedules. Pause one, or upgrade.");
  assert.equal(scheduleProblem(1, 2), null);
  assert.equal(whenLine(weekly(1, 9, "UTC")), "Every Monday at 09:00");
  assert.equal(whenLine(monthly(22, 14, "UTC")), "Monthly on the 22nd at 14:00");
  assert.equal(whenLine(monthly(11, 7, "UTC")), "Monthly on the 11th at 07:00");
});
