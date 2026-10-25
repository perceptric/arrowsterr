import { test } from "node:test";
import assert from "node:assert/strict";
import { competitorFinding, promptFinding } from "../src/lib/findings.ts";

test("promptFinding: counts prompts no model names, skipping prompts with no answers", () => {
  const now = [
    { prompt: "a", visibility: 0 },
    { prompt: "b", visibility: 50 },
    { prompt: "c", visibility: 0 },
    { prompt: "d", visibility: null },
  ];
  assert.equal(promptFinding(now), "2 of 3 prompts aren't named by any model.");
  assert.equal(promptFinding([{ prompt: "a", visibility: 0 }, { prompt: "b", visibility: 10 }]), "1 of 2 prompts isn't named by any model.");
});

test("promptFinding: the biggest drop when every prompt is named", () => {
  const now = [
    { prompt: "a", visibility: 40 },
    { prompt: "b", visibility: 20 },
    { prompt: "new", visibility: 10 },
  ];
  const before = [
    { prompt: "a", visibility: 50 },
    { prompt: "b", visibility: 45 },
  ];
  assert.equal(promptFinding(now, before), 'Every prompt is named. The biggest drop: "b", 45% to 20%.');
});

test("promptFinding: no drop, no data", () => {
  assert.equal(promptFinding([{ prompt: "a", visibility: 40 }], [{ prompt: "a", visibility: 40.2 }]), "Your 1 prompt is named by at least one model.");
  assert.equal(promptFinding([{ prompt: "a", visibility: null }]), null);
  assert.equal(promptFinding([]), null);
});

test("competitorFinding: the top rival, you, and topics it leads", () => {
  const stats = [
    { name: "HubSpot", isYou: false, visibility: 41.2 },
    { name: "Acme", isYou: true, visibility: 23 },
    { name: "Pipedrive", isYou: false, visibility: 30 },
  ];
  const topics = [{ leader: "HubSpot" }, { leader: "hubspot" }, { leader: "Acme" }, { leader: null }];
  assert.equal(competitorFinding(stats, topics), "HubSpot is named in 41% of answers, you in 23%; it leads on 2 of 3 topics.");
  assert.equal(competitorFinding(stats, []), "HubSpot is named in 41% of answers, you in 23%.");
  assert.equal(competitorFinding([{ name: "Acme", isYou: true, visibility: 10 }], topics), null);
});
