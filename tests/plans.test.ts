import assert from "node:assert/strict";
import { test } from "node:test";
import { dailyAnswers, LADDER, limitsFor, METRICS, nextPlan, PARTNER_BRANDS, PLANS, periodOf } from "../src/lib/plans.ts";

test("every sold plan costs more and gives more prompts, more often checks or more SEO than the one before", () => {
  for (let i = 1; i < LADDER.length; i++) {
    const a = PLANS[LADDER[i - 1]];
    const b = PLANS[LADDER[i]];
    assert.ok(b.price > a.price, `${b.name} should cost more than ${a.name}`);
    assert.ok(b.prompts >= a.prompts && b.seats >= a.seats, `${b.name} should never give less than ${a.name}`);
    assert.ok(b.prompts > a.prompts || b.checkEvery < a.checkEvery || b.researchPerMonth > a.researchPerMonth, `${b.name} should give more than ${a.name}`);
  }
});

test("every plan opens both toolsets unless one was picked; more tasks up the ladder; trials and cancels go read-only", async () => {
  const { TASK_PACKS, effectivePlan, access } = await import("../src/lib/plans.ts");
  assert.equal(LADDER[0], "foundation", "no Free plan on the ladder");
  assert.equal(LADDER.includes("free"), false);
  for (const id of LADDER) assert.deepEqual(access(id), { visibility: true, seo: true }, id);
  assert.deepEqual(access("scale", "seo"), { visibility: false, seo: true });
  assert.deepEqual(access("trial", "seo"), { visibility: true, seo: true }, "only paid plans can be one toolset");
  assert.deepEqual(access("foundation", "seo"), { visibility: false, seo: true });
  assert.deepEqual(access("foundation", "visibility"), { visibility: true, seo: false });
  const v6 = limitsFor("foundation");
  assert.deepEqual([v6.prompts, v6.tasksPerMonth, v6.articlesPerMonth, v6.mcp], [50, 2000, 3, true]);
  const vis = limitsFor("foundation", { track: "visibility", limitsFrom: "v5" });
  const seo = limitsFor("foundation", { track: "seo", limitsFrom: "v5" });
  assert.deepEqual([vis.prompts, vis.tasksPerMonth], [50, 300]);
  assert.deepEqual([seo.prompts, seo.tasksPerMonth], [0, 3000]);
  assert.equal(dailyAnswers(seo), 0);
  for (let i = 1; i < LADDER.length; i++) assert.ok(PLANS[LADDER[i]].tasksPerMonth > PLANS[LADDER[i - 1]].tasksPerMonth, LADDER[i]);
  for (let i = 1; i < TASK_PACKS.length; i++) assert.ok(TASK_PACKS[i].price / TASK_PACKS[i].tasks < TASK_PACKS[i - 1].price / TASK_PACKS[i - 1].tasks);
  assert.deepEqual(effectivePlan("trial", "trialing", "2020-01-01T00:00:00Z"), { plan: "trial", status: "read_only" });
  assert.deepEqual(effectivePlan("trial", "trialing", "2999-01-01T00:00:00Z"), { plan: "trial", status: "trialing" });
  assert.deepEqual(effectivePlan("scale", "canceled", null), { plan: "scale", status: "read_only" });
  assert.deepEqual(effectivePlan("scale", "past_due", null), { plan: "scale", status: "past_due" });
  assert.deepEqual(effectivePlan("free", "active", "2020-01-01T00:00:00Z"), { plan: "free", status: "active" }, "workspaces already on Free keep it");
});

test("pricing v7: tick one toolset for a lower price, with that toolset's limits", async () => {
  const { priceOf, MIXES } = await import("../src/lib/plans.ts");
  const prices = (mix: "both" | "visibility" | "seo") => ["foundation", "scale", "agency"].map((id) => [priceOf(id as "scale", mix, "month"), priceOf(id as "scale", mix, "year")]);
  assert.deepEqual(prices("both"), [[49, 42], [199, 169], [599, 509]]);
  assert.deepEqual(prices("seo"), [[29, 25], [129, 110], [349, 297]]);
  assert.deepEqual(prices("visibility"), [[29, 25], [99, 84], [299, 254]]);
  for (const id of ["foundation", "scale", "agency"] as const) {
    assert.equal(priceOf(id, "both", "month"), PLANS[id].price, `${id} both matches PLANS`);
    assert.equal(priceOf(id, "both", "year"), PLANS[id].annual);
    for (const mix of MIXES) assert.ok(Math.abs(priceOf(id, mix, "year") - priceOf(id, mix, "month") * 0.85) <= 1, `${id} ${mix} yearly is 15% off`);
    assert.ok(priceOf(id, "seo", "month") + priceOf(id, "visibility", "month") > priceOf(id, "both", "month"), `${id}: both costs less than the two apart`);
  }
  // SEO Research only: no prompts tracked, so nothing checked a day.
  const seo = limitsFor("scale", { track: "seo" });
  assert.deepEqual([seo.prompts, seo.checkNowPerDay, dailyAnswers(seo), seo.tasksPerMonth, seo.articlesPerMonth, seo.writer], [0, 0, 0, 8000, 20, "full"]);
  // AI Visibility only: no Writer or Content Plan, and fewer tasks.
  const vis = (id: "foundation" | "scale" | "agency") => limitsFor(id, { track: "visibility" });
  assert.deepEqual(["foundation", "scale", "agency"].map((id) => vis(id as "scale").tasksPerMonth), [500, 1500, 4000]);
  assert.deepEqual([vis("scale").prompts, vis("scale").writer, vis("scale").articlesPerMonth, vis("scale").plansPerMonth], [150, "none", 0, 0]);
  // A v5 Starter keeps its own split, not the v7 one.
  assert.equal(limitsFor("foundation", { track: "visibility", limitsFrom: "v5" }).tasksPerMonth, 300);
});

test("extra tasks add 1,000 a month per step, on top of the plan and its mix", async () => {
  const { TASK_STEP, stepPrice } = await import("../src/lib/plans.ts");
  assert.deepEqual([TASK_STEP.tasks, TASK_STEP.price, TASK_STEP.annual], [1000, 10, 8.5]);
  assert.equal(limitsFor("scale", { tasks: 2 }).tasksPerMonth, 10_000);
  assert.equal(limitsFor("agency", { track: "visibility", tasks: 3 }).tasksPerMonth, 7_000);
  assert.equal(limitsFor("scale", { tasks: -4 }).tasksPerMonth, 8_000, "never below the plan");
  assert.deepEqual([stepPrice(2, "month"), stepPrice(2, "year")], [20, 17]);
});

test("v7 Stripe keys carry the mix, and older keys still map", async () => {
  const { planOfLookup, lookupKey, tasksLookupKey, isTasksLookup } = await import("../src/lib/plans.ts");
  assert.equal(lookupKey("scale", "month"), "arrowsterr_v7_scale_both_month");
  assert.equal(lookupKey("agency", "year", "seo"), "arrowsterr_v7_agency_seo_year");
  assert.deepEqual(planOfLookup("arrowsterr_v7_foundation_visibility_month"), { plan: "foundation", interval: "month", version: 7, mix: "visibility" });
  assert.deepEqual(planOfLookup("arrowsterr_v6_scale_year"), { plan: "scale", interval: "year", version: 6, mix: "both" });
  assert.equal(planOfLookup(tasksLookupKey("month")), null, "the extra-tasks price is not a plan");
  assert.equal(tasksLookupKey("year"), "arrowsterr_v7_tasks_year");
  assert.ok(isTasksLookup("arrowsterr_v7_tasks_month"));
  assert.equal(isTasksLookup("arrowsterr_v7_scale_both_month"), false);
});

test("Free, kept by the workspaces already on it: 15 weekly prompts on 2 AIs, 200 tasks, 1 article to try, no Content Plan or MCP", () => {
  const f = PLANS.free;
  assert.equal(f.price, 0);
  assert.equal(f.prompts, 15);
  assert.equal(f.checkEvery, 7);
  assert.deepEqual(f.engines, ["ChatGPT", "AI Overview"]);
  assert.equal(f.tasksPerMonth, 200);
  assert.equal(f.brands, 1);
  assert.equal(f.plansPerMonth, 0);
  assert.deepEqual([f.articlesPerMonth, f.articlesOnce, f.mcp], [1, true, false]);
  assert.equal(dailyAnswers(f), 30);
  for (const id of LADDER) assert.equal(PLANS[id].engines, null, id);
  assert.equal(nextPlan("free"), "foundation");
});

test("pricing v7 plans with both toolsets, and v5 subscribers keep v5 limits", async () => {
  const { draftQuota } = await import("../src/lib/plans.ts");
  assert.deepEqual(
    LADDER.map((id) => [PLANS[id].price, PLANS[id].annual]),
    [
      [49, 42],
      [199, 169],
      [599, 509],
      [1500, 1500],
    ],
  );
  assert.deepEqual(LADDER.map((id) => PLANS[id].prompts), [50, 150, 500, 1500]);
  assert.deepEqual(LADDER.map((id) => PLANS[id].tasksPerMonth), [2000, 8000, 20000, 50000]);
  assert.deepEqual(LADDER.map((id) => PLANS[id].articlesPerMonth), [3, 20, 60, 150]);
  assert.deepEqual([PLANS.foundation.brands, PLANS.scale.brands, PLANS.agency.brands], [2, 5, 25]);
  assert.deepEqual([PLANS.foundation.seats, PLANS.scale.seats, PLANS.agency.seats], [3, 5, 15]);
  assert.deepEqual(LADDER.map((id) => PLANS[id].mcp), [true, true, true, true]);
  assert.deepEqual(LADDER.map((id) => PLANS[id].alerts), [false, true, true, true]);
  for (const id of LADDER) assert.equal(PLANS[id].writer, "full", id);
  const extra = limitsFor("foundation", { brands: 2 });
  assert.equal(extra.brands, 4);
  // v5 subscribers
  const pro5 = limitsFor("scale", { limitsFrom: "v5" });
  assert.deepEqual([pro5.brands, pro5.draftsPerBrand, pro5.articlesPerMonth], [10, 10, 0]);
  assert.ok(limitsFor("agency", { limitsFrom: "v5" }).brands >= 1000);
  assert.equal(limitsFor("foundation", { limitsFrom: "v5" }).writer, "none");
  // how drafts count
  assert.deepEqual(draftQuota(PLANS.scale, "2026-11-01"), { limit: 20, period: "2026-11-01", scope: "workspace" });
  assert.deepEqual(draftQuota(PLANS.free, "2026-11-01"), { limit: 1, period: "once", scope: "workspace" });
  assert.deepEqual(draftQuota(pro5, "2026-11-01"), { limit: 10, period: "2026-11-01", scope: "brand" });
  assert.deepEqual(draftQuota(PLANS.trial, "2026-11-01"), { limit: 3, period: "2026-11-01", scope: "brand" });
});

test("weekly plans check each brand once every 7 days", async () => {
  const { checkDue } = await import("../src/lib/plans.ts");
  const days = Array.from({ length: 14 }, (_, d) => checkDue(3, 7, 20000 + d)).filter(Boolean).length;
  assert.equal(days, 2);
  assert.ok(checkDue(3, 1, 20000));
});

test("white label is only on Agency and Enterprise", () => {
  for (const id of LADDER) assert.equal(PLANS[id].reports === "whitelabel", id === "agency" || id === "enterprise", id);
});

test("extras add to the plan, and the daily extra overrides the schedule", () => {
  const l = limitsFor("foundation", { prompts: 10, seats: 1, daily: true });
  assert.equal(l.prompts, 60);
  assert.equal(l.seats, 4);
  assert.equal(l.checkEvery, 1);
  assert.equal(limitsFor("trial").checkEvery, 1);
});

test("daily AI answers cover every prompt on every AI plus on-demand checks", () => {
  assert.equal(dailyAnswers(PLANS.foundation), (50 + 3) * 6);
  assert.equal(dailyAnswers(PLANS.trial), 180); // matches the database default for new workspaces (020_leaner_plans.sql)
});

test("boost goes one step up and never to Enterprise", () => {
  assert.equal(nextPlan("foundation"), "scale");
  assert.equal(nextPlan("trial"), "scale");
  assert.equal(nextPlan("thrive"), "agency");
  assert.equal(nextPlan("agency"), null);
  assert.equal(nextPlan("free"), "foundation");
});

test("monthly allowances count by month, daily ones by day", () => {
  const at = new Date("2026-10-09T12:00:00Z");
  assert.equal(periodOf("tasks", at), "2026-10");
  assert.equal(periodOf("checknow", at), "2026-10-09");
  for (const m of Object.keys(METRICS) as (keyof typeof METRICS)[]) assert.ok(METRICS[m].limit(PLANS.scale) >= 1, m);
});

test("billing months start on the plan's day, and short months use their last day", async () => {
  const { cycleStart, cycleEnd, periodOf, planOfLookup, lookupKey } = await import("../src/lib/plans.ts");
  const anchor = new Date("2026-01-31T10:00:00Z");
  assert.equal(cycleStart(anchor, new Date("2026-03-05T00:00:00Z")).toISOString().slice(0, 10), "2026-02-28");
  assert.equal(cycleEnd(anchor, new Date("2026-03-05T00:00:00Z")).toISOString().slice(0, 10), "2026-03-31");
  assert.equal(cycleStart(new Date("2026-10-14T00:00:00Z"), new Date("2026-10-13T23:00:00Z")).toISOString().slice(0, 10), "2026-09-14");
  assert.equal(periodOf("tasks", new Date("2026-10-20T00:00:00Z"), "2026-10-14T08:00:00Z"), "2026-10-14");
  assert.equal(periodOf("tasks", new Date("2026-10-20T00:00:00Z")), "2026-10");
  assert.deepEqual(planOfLookup(lookupKey("scale", "year")), { plan: "scale", interval: "year", version: 7, mix: "both" });
  assert.deepEqual(planOfLookup("arrowsterr_thrive_year"), { plan: "thrive", interval: "year", version: 0, mix: "both" });
  assert.deepEqual(planOfLookup("arrowsterr_v3_scale_month"), { plan: "scale", interval: "month", version: 3, mix: "both" });
  assert.equal(lookupKey("agency", "month"), "arrowsterr_v7_agency_both_month");
  assert.deepEqual(planOfLookup("arrowsterr_v5_foundation_year"), { plan: "foundation", interval: "year", version: 5, mix: "both" });
  assert.equal(planOfLookup("arrowsterr_enterprise_month"), null);
});

test("after a downgrade, prompts past the plan are paused in the order brands were added", async () => {
  const { promptAllowance } = await import("../src/lib/plans.ts");
  const brands = [
    { id: "a", prompts: Array(15).fill("p") },
    { id: "b", prompts: Array(10).fill("p") },
    { id: "c", prompts: Array(5).fill("p") },
  ];
  const m = promptAllowance(brands, { brands: 2, prompts: 20 });
  assert.deepEqual([m.get("a"), m.get("b"), m.get("c")], [15, 5, 0]);
});

test("report limits grow up the ladder, and only Agency and up get white label", async () => {
  const { reportLimits } = await import("../src/lib/plans.ts");
  let last = 0;
  let lastSchedules = 0;
  for (const id of LADDER) {
    const r = reportLimits(id);
    assert.ok(r.saved >= last, `${id} should keep at least as many reports`);
    assert.ok(r.schedules >= lastSchedules, `${id} should keep at least as many schedules`);
    last = r.saved;
    lastSchedules = r.schedules;
    assert.equal(r.whiteLabel, id === "agency" || id === "enterprise");
  }
  assert.deepEqual(reportLimits("free"), { saved: 1, live: false, secure: false, whiteLabel: false, schedules: 0 });
  assert.equal(reportLimits("foundation").secure, false);
  assert.equal(reportLimits("scale").secure, true);
  // Schedules: Free 0, Starter 2, Pro 10, Agency unlimited (docs/reports.md, section 32.4).
  assert.deepEqual(["free", "foundation", "scale", "agency"].map((id) => reportLimits(id as "free").schedules), [0, 2, 10, 1000]);
});

test("a partner workspace (extras.partner, set by hand) has the partner API and no brand cap", () => {
  for (const id of Object.keys(PLANS) as (keyof typeof PLANS)[]) assert.equal(limitsFor(id).partner, false, id);
  const p = limitsFor("agency", { partner: true, prompts: 1000 });
  assert.equal(p.partner, true);
  assert.equal(p.brands, PARTNER_BRANDS);
  assert.ok(PARTNER_BRANDS < 2 ** 31, "fits the database's int");
  assert.equal(p.prompts, PLANS.agency.prompts + 1000);
  assert.equal(limitsFor("agency", { brands: 5 }).brands, PLANS.agency.brands + 5);
});
