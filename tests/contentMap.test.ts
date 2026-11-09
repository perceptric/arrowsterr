import assert from "node:assert/strict";
import { test } from "node:test";
import { aiNamed, buildTopics, fallbackPillars, hubOf, layout, linkedFrom, mapStats, pillarsFrom, similar, type Topic } from "../src/lib/contentMap.ts";

const kw = (keyword: string, url: string | null, rank: number, volume: number, etv = 0) => ({ keyword, url, rank, volume, etv });

test("a brand with no pages yet gets only missing topics from rivals and the plan", () => {
  const t = buildTopics([], [{ rival: "rival.com", kws: [kw("crm for startups", "https://rival.com/crm-startups", 2, 900)] }], [{ keyword: "crm pricing", status: "planned" }]);
  assert.deepEqual(t.map((x) => [x.name, x.status]), [["crm pricing", "missing"], ["crm for startups", "missing"]]);
  assert.equal(t[0].planned, true);
  assert.deepEqual(buildTopics([], [], []), []);
});

test("keywords group by the page that ranks, named by the keyword with the most searches", () => {
  const t = buildTopics([kw("crm software", "https://acme.com/crm", 4, 5000, 300), kw("best crm software", "https://www.acme.com/crm/", 6, 2000, 90), kw("acme login", "https://acme.com/login", 1, 400, 380), kw("crm tips", "https://acme.com/tips", 45, 900)], [], []);
  assert.deepEqual(t.map((x) => x.name), ["crm software", "acme login"]);
  assert.equal(t[0].traffic, 390);
  assert.equal(t[0].status, "covered");
});

test("two pages ranking for the same topic become one competing topic with both pages", () => {
  const t = buildTopics([kw("crm for startups", "https://acme.com/crm-startups", 5, 900), kw("startup crm", "https://acme.com/blog/startup-crm-guide", 9, 700)], [], []);
  assert.equal(t.length, 1);
  assert.equal(t[0].status, "overlap");
  assert.equal(t[0].urls.length, 2);
});

test("rival topics the brand already ranks for aren't missing; the rival is noted on the brand's topic", () => {
  const brand = [kw("crm software", "https://acme.com/crm", 3, 5000)];
  const rivals = [{ rival: "rival.com", kws: [kw("crm software", "https://rival.com/crm", 1, 5000), kw("crm reporting", "https://rival.com/reports", 3, 800), kw("tiny niche", "https://rival.com/n", 2, 10)] }];
  const t = buildTopics(brand, rivals, []);
  assert.deepEqual(t.map((x) => [x.name, x.status]), [["crm software", "covered"], ["crm reporting", "missing"]]);
});

test("the plan moves missing topics to in progress, and published plan pieces count as covered", () => {
  const rivals = [{ rival: "rival.com", kws: [kw("crm reporting", "https://rival.com/reports", 3, 800)] }];
  const t = buildTopics([], rivals, [{ keyword: "CRM reporting", status: "writing" }, { keyword: "crm onboarding", status: "published", url: "https://acme.com/onboarding" }]);
  assert.equal(t.find((x) => x.name === "crm reporting")!.status, "progress");
  assert.equal(t.find((x) => x.name === "crm onboarding")!.status, "covered");
});

test("similar names count as one topic, different ones don't", () => {
  assert.ok(similar("best crm for startups", "crm startups best") >= 0.6);
  assert.ok(similar("crm pricing", "email marketing tools") < 0.2);
});

test("pillars: Claude's grouping when it covers every topic once, else shared words", () => {
  const topics = [{ id: "t1", name: "crm software", keywords: [] }, { id: "t2", name: "crm pricing", keywords: [] }, { id: "t3", name: "email templates", keywords: [] }, { id: "t4", name: "email subject lines", keywords: [] }, { id: "t5", name: "zebra", keywords: [] }];
  const good = pillarsFrom(topics, { pillars: [{ name: "CRM", topics: ["t1", "t2"] }, { name: "Email", topics: ["t3", "t4", "t5"] }] });
  assert.equal(good.get("t5"), "Email");
  const bad = pillarsFrom(topics, { pillars: [{ name: "CRM", topics: ["t1"] }] });
  assert.equal(bad.get("t1"), "Crm");
  assert.equal(bad.get("t3"), "Email");
  assert.equal(bad.get("t5"), "Other");
  assert.equal(fallbackPillars([]).size, 0);
});

test("AI names a topic when a prompt with mostly its words named the brand", () => {
  const t = { name: "crm for startups", keywords: [] };
  assert.equal(aiNamed(t, [{ prompt: "What is the best CRM for startups?", named: true }]), true);
  assert.equal(aiNamed(t, [{ prompt: "What is the best CRM for startups?", named: false }]), false);
  assert.equal(aiNamed(t, [{ prompt: "Best email tools", named: true }]), false);
});

const topic = (o: Partial<Topic>): Topic => ({ id: "x", name: "x", keywords: [], volume: 0, traffic: 0, status: "covered", urls: [], rivals: [], planned: false, ai: false, pillar: "P", linked: null, ...o });

test("the hub is the pillar's covered page with the most visits, and links match with or without www or slash", () => {
  const ts = [topic({ id: "a", urls: ["https://acme.com/a"], traffic: 10 }), topic({ id: "b", urls: ["https://acme.com/b"], traffic: 90 }), topic({ id: "c", status: "missing", traffic: 999 })];
  assert.equal(hubOf(ts, "P")?.id, "b");
  assert.equal(hubOf(ts, "Q"), null);
  const linked = linkedFrom(["https://www.acme.com/a/", "https://acme.com/z"], ["https://acme.com/a", "https://acme.com/c"]);
  assert.deepEqual([...linked], ["https://acme.com/a"]);
});

test("the layout keeps every bubble inside the drawing, and stats count each status", () => {
  const topics = Array.from({ length: 30 }, (_, i) => topic({ id: `t${i}`, name: `topic ${i}`, pillar: i < 21 ? "Big" : "Small", volume: i * 400, status: i % 3 === 0 ? "missing" : "covered" }));
  const { w, h, nodes } = layout({ pillars: [{ name: "Big", hub: null }, { name: "Small", hub: null }], topics });
  for (const n of nodes) {
    assert.ok(n.x - n.r >= 0 && n.x + n.r <= w, `x of ${n.id}`);
    assert.ok(n.y - n.r >= 0 && n.y + n.r <= h, `y of ${n.id}`);
  }
  assert.equal(nodes.filter((n) => !n.pillar).length, 30);
  assert.deepEqual(mapStats(topics), { topics: 30, covered: 20, overlap: 0, progress: 0, missing: 10, ai: 0, unlinked: 0 });
});
