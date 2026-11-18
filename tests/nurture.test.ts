import assert from "node:assert/strict";
import { test } from "node:test";
import { pickStep, promptIdeas, type NurtureState } from "../src/lib/nurturePlan.ts";

const base: NurtureState = { ageHours: 1, plan: "trial", storedPlan: "trial", trialEndedHours: null, brands: 1, prompts: 12, hasAnswers: false, contentPlans: 0, idleDays: 0, localHour: 10, sent: new Set(), sentRecently: false };
const at = (days: number, more: Partial<NurtureState> = {}, sent: string[] = ["welcome"]): NurtureState => ({ ...base, ageHours: days * 24, sent: new Set(sent), ...more });

test("the welcome goes out 15 minutes in, at any hour, and never after 2 days", () => {
  assert.equal(pickStep({ ...base, ageHours: 0.1 }), null);
  assert.equal(pickStep({ ...base, ageHours: 0.3, localHour: 3 }), "welcome");
  assert.equal(pickStep({ ...base, ageHours: 0.3, sentRecently: true }), "welcome");
  assert.equal(pickStep({ ...base, ageHours: 50 }), null);
});

test("later steps wait for working hours and a quiet day", () => {
  assert.equal(pickStep(at(1, { brands: 0, localHour: 7 })), null);
  assert.equal(pickStep(at(1, { brands: 0, localHour: 18 })), null);
  assert.equal(pickStep(at(1, { brands: 0, sentRecently: true })), null);
  assert.equal(pickStep(at(1, { brands: 0 })), "nobrand");
});

test("each setup step is skipped once it's done", () => {
  assert.equal(pickStep(at(1, { brands: 1 })), null);
  assert.equal(pickStep(at(2, { hasAnswers: true })), "firstlook");
  assert.equal(pickStep(at(2, { hasAnswers: false })), null);
  assert.equal(pickStep(at(3, { prompts: 4 }, ["welcome", "firstlook"])), "prompts");
  assert.equal(pickStep(at(3, { prompts: 12 }, ["welcome", "firstlook"])), null);
  assert.equal(pickStep(at(5, {}, ["welcome", "firstlook"])), "plan");
  assert.equal(pickStep(at(5, { contentPlans: 1 }, ["welcome", "firstlook"])), null);
});

test("the trial-over email goes out once, within 3 days of the trial ending", () => {
  const over = { plan: "free" as const, storedPlan: "trial" as const };
  assert.equal(pickStep(at(8, { ...over, trialEndedHours: 20 }, ["welcome", "plan"])), "trialover");
  assert.equal(pickStep(at(11, { ...over, trialEndedHours: 80 }, ["welcome", "plan"])), null);
  assert.equal(pickStep(at(8, { ...over, trialEndedHours: 20 }, ["welcome", "trialover"])), null);
});

test("day 14 on Free: active people get the upgrade, quiet people get an offer of help, never both", () => {
  const free = { plan: "free" as const, storedPlan: "free" as const };
  assert.equal(pickStep(at(14, { ...free, idleDays: 2 })), "upgrade");
  assert.equal(pickStep(at(14, { ...free, idleDays: 9 })), "help");
  assert.equal(pickStep(at(14, { ...free, idleDays: null })), "help");
  assert.equal(pickStep(at(15, { ...free, idleDays: 2 }, ["welcome", "help"])), null);
});

test("win-back needs 21 quiet days and answers to show", () => {
  const free = { plan: "free" as const, storedPlan: "free" as const, hasAnswers: true };
  assert.equal(pickStep(at(30, { ...free, idleDays: 22 }, ["welcome", "upgrade"])), "winback");
  assert.equal(pickStep(at(30, { ...free, idleDays: 10 }, ["welcome", "upgrade"])), null);
  assert.equal(pickStep(at(30, { ...free, idleDays: 22, hasAnswers: false }, ["welcome", "upgrade"])), null);
  assert.equal(pickStep(at(30, { ...free, idleDays: 22 }, ["welcome", "upgrade", "winback"])), null);
});

test("paying workspaces get the setup emails and no sales emails", () => {
  const paid = { plan: "foundation" as const, storedPlan: "foundation" as const };
  assert.equal(pickStep(at(3, { ...paid, prompts: 2 }, ["welcome", "firstlook"])), "prompts");
  assert.equal(pickStep(at(5, paid, ["welcome", "firstlook"])), null);
  assert.equal(pickStep(at(14, { ...paid, idleDays: 30 })), null);
  assert.equal(pickStep(at(30, { ...paid, idleDays: 30, hasAnswers: true })), null);
});

test("prompt ideas come from the brand's topic, buyers and rivals, minus prompts it has", () => {
  const ideas = promptIdeas({ name: "Acme", topics: ["Review management software"], customers: "restaurant groups, hotels", competitors: ["Acme", "Rival"], existing: ["Rival alternatives"], year: 2026 });
  assert.deepEqual(
    ideas.map((i) => i.prompt),
    ["best review management software for restaurant groups", "best review management software in 2026", "Acme vs Rival", "is Acme worth it"],
  );
  assert.equal(promptIdeas({ name: "Acme", topics: [], competitors: [], existing: [], year: 2026 })[0].prompt, "is Acme worth it");
});
