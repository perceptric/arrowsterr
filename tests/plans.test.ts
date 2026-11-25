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
  const v8 = limitsFor("foundation");
  assert.deepEqual([v8.prompts, v8.tasksPerMonth, v8.articleTasks, v8.mcp], [25, 1200, 200, true]);
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

test("pricing v8: tick one toolset for a lower price, with that toolset's limits", async () => {
  const { priceOf, MIXES } = await import("../src/lib/plans.ts");
  const prices = (mix: "both" | "visibility" | "seo") => ["foundation", "scale", "agency"].map((id) => [priceOf(id as "scale", mix, "month"), priceOf(id as "scale", mix, "year")]);
  assert.deepEqual(prices("both"), [[29, 25], [89, 76], [249, 212]]);
  assert.deepEqual(prices("seo"), [[19, 16], [59, 50], [159, 135]]);
  assert.deepEqual(prices("visibility"), [[19, 16], [59, 50], [169, 144]]);
  for (const id of ["foundation", "scale", "agency"] as const) {
    assert.equal(priceOf(id, "both", "month"), PLANS[id].price, `${id} both matches PLANS`);
    assert.equal(priceOf(id, "both", "year"), PLANS[id].annual);
    for (const mix of MIXES) assert.equal(priceOf(id, mix, "year"), Math.round(priceOf(id, mix, "month") * 0.85), `${id} ${mix} yearly is 15% off, rounded`);
    assert.ok(priceOf(id, "seo", "month") + priceOf(id, "visibility", "month") > priceOf(id, "both", "month"), `${id}: both costs less than the two apart`);
  }
  // SEO Research only: no prompts tracked, so nothing checked a day.
  const seo = limitsFor("scale", { track: "seo" });
  assert.deepEqual([seo.prompts, seo.checkNowPerDay, dailyAnswers(seo), seo.tasksPerMonth, seo.articleTasks, seo.writer], [0, 0, 0, 4000, 200, "full"]);
  // AI Visibility only: no Writer or Content Plan, and fewer tasks.
  const vis = (id: "foundation" | "scale" | "agency") => limitsFor(id, { track: "visibility" });
  assert.deepEqual(["foundation", "scale", "agency"].map((id) => vis(id as "scale").tasksPerMonth), [300, 1000, 3000]);
  assert.deepEqual([vis("scale").prompts, vis("scale").writer, vis("scale").plansPerMonth], [75, "none", 0]);
  // A v5 Starter keeps its own split, and a v7 one-toolset plan keeps the v7 split.
  assert.equal(limitsFor("foundation", { track: "visibility", limitsFrom: "v5" }).tasksPerMonth, 300);
  assert.equal(limitsFor("scale", { track: "visibility", limitsFrom: "v7" }).tasksPerMonth, 1500);
  assert.equal(limitsFor("agency", { track: "seo", limitsFrom: "v7" }).tasksPerMonth, 20_000);
});

test("extra tasks add 1,000 a month per step, on top of the plan and its mix", async () => {
  const { TASK_STEP, stepPrice } = await import("../src/lib/plans.ts");
  assert.deepEqual([TASK_STEP.tasks, TASK_STEP.price, TASK_STEP.annual], [1000, 10, 8.5]);
  assert.equal(limitsFor("scale", { tasks: 2 }).tasksPerMonth, 6_000);
  assert.equal(limitsFor("agency", { track: "visibility", tasks: 3 }).tasksPerMonth, 6_000);
  assert.equal(limitsFor("scale", { tasks: -4 }).tasksPerMonth, 4_000, "never below the plan");
  assert.deepEqual([stepPrice(2, "month"), stepPrice(2, "year")], [20, 17]);
});

test("extra prompts add 25 a day per step; the card price adds prompts (not on SEO Research only) and tasks", async () => {
  const { PROMPT_STEP, promptStepPrice, cardPrice } = await import("../src/lib/plans.ts");
  assert.deepEqual([PROMPT_STEP.prompts, PROMPT_STEP.price, PROMPT_STEP.annual], [25, 15, 12.75]);
  assert.equal(limitsFor("scale", { prompts: 2 * PROMPT_STEP.prompts }).prompts, 125);
  assert.equal(limitsFor("scale", { track: "seo", prompts: 50 }).prompts, 50, "extras still add on top of a one-toolset plan");
  assert.deepEqual([promptStepPrice(2, "month"), promptStepPrice(2, "year")], [30, 25.5]);
  assert.equal(cardPrice("scale", "both", "month", 2, 2), 89 + 30 + 20);
  assert.equal(cardPrice("scale", "seo", "month", 2, 2), 59 + 20, "SEO Research only buys no prompts");
  assert.equal(cardPrice("foundation", "both", "year", 1, 1), 25 + 12.75 + 8.5);
});

test("pricing v8: an article takes 200 tasks, and older plans keep counting articles", async () => {
  const { draftQuota, TASK_COST, ARTICLE_TASKS } = await import("../src/lib/plans.ts");
  assert.equal(ARTICLE_TASKS, 200);
  assert.equal(TASK_COST.article, 200);
  for (const id of ["foundation", "scale", "agency"] as const) {
    const q = draftQuota(PLANS[id], "2026-11-01");
    assert.equal(q.tasks, 200, id);
    assert.ok(q.limit >= 10_000, `${id}: no monthly article cap`);
    assert.equal(q.scope, "workspace");
  }
  assert.equal(draftQuota(limitsFor("scale", { track: "visibility" }), "2026-11-01").limit, 0, "no Writer on AI Visibility only");
  const v7 = limitsFor("scale", { limitsFrom: "v7" });
  assert.deepEqual(draftQuota(v7, "2026-11-01"), { limit: 20, period: "2026-11-01", scope: "workspace" });
  assert.equal(v7.prompts, 150);
});

test("v8 Stripe keys carry the mix, the add-ons are not plans, and v7 and older keys still map", async () => {
  const { planOfLookup, lookupKey, tasksLookupKey, promptsLookupKey, isTasksLookup, isPromptsLookup, isAddonLookup } = await import("../src/lib/plans.ts");
  assert.equal(lookupKey("scale", "month"), "arrowsterr_v8_scale_both_month");
  assert.equal(lookupKey("agency", "year", "seo"), "arrowsterr_v8_agency_seo_year");
  assert.deepEqual(planOfLookup("arrowsterr_v8_foundation_visibility_month"), { plan: "foundation", interval: "month", version: 8, mix: "visibility" });
  assert.deepEqual(planOfLookup("arrowsterr_v7_foundation_visibility_month"), { plan: "foundation", interval: "month", version: 7, mix: "visibility" });
  assert.deepEqual(planOfLookup("arrowsterr_v6_scale_year"), { plan: "scale", interval: "year", version: 6, mix: "both" });
  assert.equal(planOfLookup(tasksLookupKey("month")), null, "the extra-tasks price is not a plan");
  assert.equal(planOfLookup(promptsLookupKey("month")), null, "the extra-prompts price is not a plan");
  assert.equal(tasksLookupKey("year"), "arrowsterr_v8_tasks_year");
  assert.equal(promptsLookupKey("month"), "arrowsterr_v8_prompts_month");
  assert.ok(isTasksLookup("arrowsterr_v7_tasks_month"));
  assert.ok(isPromptsLookup("arrowsterr_v8_prompts_year"));
  assert.ok(isAddonLookup("arrowsterr_v8_prompts_month") && isAddonLookup("arrowsterr_v8_tasks_month"));
  assert.equal(isAddonLookup("arrowsterr_v8_scale_both_month"), false);
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

test("pricing v8 plans with both toolsets, and v5 and v7 subscribers keep their limits", async () => {
  const { draftQuota } = await import("../src/lib/plans.ts");
  assert.deepEqual(
    LADDER.map((id) => [PLANS[id].price, PLANS[id].annual]),
    [
      [29, 25],
      [89, 76],
      [249, 212],
      [1500, 1500],
    ],
  );
  assert.deepEqual(LADDER.map((id) => PLANS[id].prompts), [25, 75, 200, 1500]);
  assert.deepEqual(LADDER.map((id) => PLANS[id].tasksPerMonth), [1200, 4000, 12000, 50000]);
  assert.deepEqual(LADDER.map((id) => PLANS[id].articleTasks), [200, 200, 200, 0]);
  assert.deepEqual([PLANS.foundation.brands, PLANS.scale.brands, PLANS.agency.brands], [2, 5, 25]);
  assert.deepEqual([PLANS.foundation.seats, PLANS.scale.seats, PLANS.agency.seats], [2, 5, 15]);
  assert.deepEqual([PLANS.foundation.competitors, PLANS.scale.competitors, PLANS.agency.competitors], [10, 15, 25]);
  assert.deepEqual([PLANS.foundation.historyDays, PLANS.scale.historyDays, PLANS.agency.historyDays], [180, 365, 730]);
  assert.deepEqual(LADDER.map((id) => PLANS[id].mcp), [true, true, true, true]);
  assert.deepEqual(LADDER.map((id) => PLANS[id].alerts), [false, true, true, true]);
  for (const id of LADDER) assert.equal(PLANS[id].writer, "full", id);
  const extra = limitsFor("foundation", { brands: 2 });
  assert.equal(extra.brands, 4);
  // v7 subscribers (v6 and v7 prices)
  const pro7 = limitsFor("scale", { limitsFrom: "v7" });
  assert.deepEqual([pro7.prompts, pro7.tasksPerMonth, pro7.articlesPerMonth, pro7.articleTasks], [150, 8000, 20, 0]);
  // v5 subscribers
  const pro5 = limitsFor("scale", { limitsFrom: "v5" });
  assert.deepEqual([pro5.brands, pro5.draftsPerBrand, pro5.articlesPerMonth], [10, 10, 0]);
  assert.ok(limitsFor("agency", { limitsFrom: "v5" }).brands >= 1000);
  assert.equal(limitsFor("foundation", { limitsFrom: "v5" }).writer, "none");
  // how drafts count
  assert.deepEqual(draftQuota(PLANS.enterprise, "2026-11-01"), { limit: 150, period: "2026-11-01", scope: "workspace" });
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
  assert.equal(l.prompts, 35);
  assert.equal(l.seats, 3);
  assert.equal(l.checkEvery, 1);
  assert.equal(limitsFor("trial").checkEvery, 1);
});

test("daily AI answers cover every prompt on every AI plus on-demand checks", () => {
  assert.equal(dailyAnswers(PLANS.foundation), (25 + 3) * 6);
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
  assert.deepEqual(planOfLookup(lookupKey("scale", "year")), { plan: "scale", interval: "year", version: 8, mix: "both" });
  assert.deepEqual(planOfLookup("arrowsterr_thrive_year"), { plan: "thrive", interval: "year", version: 0, mix: "both" });
  assert.deepEqual(planOfLookup("arrowsterr_v3_scale_month"), { plan: "scale", interval: "month", version: 3, mix: "both" });
  assert.equal(lookupKey("agency", "month"), "arrowsterr_v8_agency_both_month");
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
