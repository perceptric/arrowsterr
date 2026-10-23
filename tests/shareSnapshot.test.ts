import assert from "node:assert/strict";
import { test } from "node:test";
import type { Chat, Run } from "../src/lib/chats.ts";
import { answered, brandStats, promptRows, topicRows } from "../src/lib/metrics.ts";
import { viewOf } from "../src/lib/pdf/pages.ts";
import { answersSince, competitorsSnapshot, fitSnapshot, promptsSnapshot, shareProblem } from "../src/lib/shareSnapshot.ts";

const NOW = Date.parse("2026-10-23T12:00:00Z");
const day = (n: number) => new Date(NOW - n * 864e5).toISOString();
// Saved chats drop their text and keep answered (chats.ts), so the share fetches texts separately.
const chat = (engine: string, prompt: string, brands: [string, number][], sources: string[] = [], error: string | null = null): Chat => ({
  engine,
  prompt,
  text: "",
  answered: !error,
  error,
  brands: brands.map(([name, position]) => ({ name, position, sentiment: 70 })),
  sources: sources.map((url) => ({ url, title: null, domain: new URL(url).hostname.replace(/^www\./, "") })),
});
const brand = { name: "Acme", domain: "acme.com", logo: null };
const topics = [
  { name: "CRM", prompts: ["best crm", "crm for startups"] },
  { name: "Email", prompts: ["email tool"] },
];
const runs: Run[] = [
  { at: day(10), engines: ["ChatGPT"], chats: [chat("ChatGPT", "best crm", [["Rival", 1]])] },
  {
    at: day(3),
    engines: ["ChatGPT", "Gemini"],
    chats: [
      chat("ChatGPT", "best crm", [["Acme", 1], ["Rival", 2]], ["https://acme.com/crm", "https://g2.com/crm"]),
      chat("Gemini", "best crm", [], [], "timeout"), // a failed answer never shows as a deep dive
      chat("ChatGPT", "email tool", [["Mailo", 1]], ["https://reddit.com/r/email"]),
    ],
  },
  { at: day(1), engines: ["ChatGPT"], chats: [chat("ChatGPT", "crm for startups", [["Acme", 2], ["Rival", 1]], ["https://acme.com/start"])] },
];
const all = { days: 7, topic: null, model: null };
const view = (p = all, r = runs) => viewOf(brand, r, topics, ["ChatGPT", "Gemini"], p, NOW);
const answers = [
  { prompt: "best crm", engine: "ChatGPT", text: "Newest: Acme is the best CRM." },
  { prompt: "best crm", engine: "ChatGPT", text: "Older answer." },
];

test("share: the Prompts snapshot has the page's numbers and the shape PromptsDoc reads", () => {
  const v = view();
  const s = promptsSnapshot(v, answers, NOW);
  const chats = answered(v.current, v.filter);
  const me = brandStats(chats, { name: "Acme", domain: "acme.com" }).find((x) => x.isYou)!;
  assert.equal(s.kind, "prompts");
  assert.equal(s.at, new Date(NOW).toISOString());
  assert.deepEqual(s.brand, { name: "Acme", domain: "acme.com" }, "no logo key when the brand has none");
  assert.deepEqual(s.engines, ["ChatGPT", "Gemini"]);
  assert.equal(s.scores!.visibility, me.visibility);
  assert.equal(s.scores!.position, me.position);
  assert.deepEqual(
    s.topics.map((t) => [t.name, t.visibility]),
    topicRows(chats, v.topics, v.engines, "Acme").map((t) => [t.topic, t.visibility]),
  );
  const rows = promptRows(v.current, v.topics, v.engines, "Acme", v.filter, "acme.com");
  assert.deepEqual(
    s.topics.flatMap((t) => t.prompts.map((p) => [p.prompt, p.visibility])),
    rows.map((r) => [r.prompt, r.visibility]),
  );
  const best = s.topics[0].prompts.find((p) => p.prompt === "best crm")!;
  assert.deepEqual(best.ranks, { ChatGPT: 1, Gemini: null });
  assert.deepEqual(best.detail!.map((d) => d.engine), ["ChatGPT"], "only answered models get a deep dive");
  assert.equal(best.detail![0].text, "Newest: Acme is the best CRM.", "the newest text wins");
  const start = s.topics[0].prompts.find((p) => p.prompt === "crm for startups")!;
  assert.equal(start.detail![0].text, "", "a missing text is empty, never an error");
  assert.deepEqual(JSON.parse(JSON.stringify(s)), s, "it survives the trip to the database");
});

test("share: model and topic filters carry into the Prompts snapshot", () => {
  const s = promptsSnapshot(view({ days: 7, topic: "CRM", model: "ChatGPT" }), [], NOW);
  assert.deepEqual(s.engines, ["ChatGPT"]);
  assert.deepEqual(s.topics.map((t) => t.name), ["CRM"]);
  assert.ok(s.topics[0].prompts.every((p) => Object.keys(p.ranks).every((e) => e === "ChatGPT")));
});

test("share: no answers in the period still makes a snapshot, with no scores", () => {
  const v = view(all, []);
  const s = promptsSnapshot(v, [], NOW);
  assert.equal(s.scores, null);
  assert.deepEqual(s.topics.map((t) => t.name), ["CRM", "Email"]);
  assert.equal(answersSince(v), undefined);
  assert.equal(shareProblem(s), null);
  assert.deepEqual(competitorsSnapshot(v, 10, NOW).rows.map((r) => [r.name, r.visibility, r.position]), [["Acme", 0, null]], "just you, at zero");
});

test("share: answer texts are fetched from a day before the period's first run", () => {
  assert.equal(answersSince(view()), new Date(Date.parse(day(3)) - 864e5).toISOString());
});

test("share: the Competitors snapshot keeps you, then as many rivals as the plan tracks", () => {
  const v = view();
  const s = competitorsSnapshot(v, undefined, NOW);
  assert.equal(s.kind, "competitors");
  assert.deepEqual(s.rows.map((r) => r.name).sort(), ["Acme", "Mailo", "Rival"]);
  assert.deepEqual(Object.keys(s.rows[0]).sort(), ["domain", "isYou", "mentions", "name", "position", "visibility"]);
  const one = competitorsSnapshot(v, 1, NOW).rows;
  assert.equal(one.length, 2);
  assert.ok(one.some((r) => r.isYou), "you stay even past the limit");
  assert.deepEqual(competitorsSnapshot(v, 0, NOW).rows.map((r) => r.name), ["Acme"]);
  assert.equal(shareProblem(s), null);
});

test("share: a big Prompts snapshot loses answer text first and keeps every number", () => {
  const long = [{ prompt: "best crm", engine: "ChatGPT", text: "x".repeat(8000) }];
  const s = promptsSnapshot(view(), long, NOW);
  const size = JSON.stringify(s).length;
  const fit = fitSnapshot(s, size - 1000);
  assert.ok(JSON.stringify(fit).length <= size - 1000);
  assert.equal(fit.topics[0].prompts[0].detail![0].text.length, 2000);
  assert.deepEqual(
    fit.topics.map((t) => t.prompts.map((p) => [p.prompt, p.visibility, p.ranks])),
    s.topics.map((t) => t.prompts.map((p) => [p.prompt, p.visibility, p.ranks])),
  );
  assert.equal(fitSnapshot(s, 10).topics[0].prompts[0].detail![0].text, "", "texts go entirely when nothing else fits");
  assert.equal(fitSnapshot(s), s, "a small snapshot is untouched");
  const c = competitorsSnapshot(view(), undefined, NOW);
  assert.equal(fitSnapshot(c, 10), c, "Competitors has no text to cut");
});

test("share: the route only saves Prompts and Competitors snapshots it can draw", () => {
  const ok = promptsSnapshot(view(), [], NOW);
  assert.equal(shareProblem(null), "Nothing to share.");
  assert.equal(shareProblem([]), "Nothing to share.");
  assert.equal(shareProblem("prompts"), "Nothing to share.");
  assert.match(shareProblem({ ...ok, kind: "client" })!, /Only the Prompts and Competitors/);
  assert.match(shareProblem({ ...ok, kind: undefined })!, /Only the Prompts and Competitors/);
  assert.equal(shareProblem({ ...ok, brand: {} }), "Nothing to share.");
  assert.equal(shareProblem({ ...ok, topics: undefined }), "Nothing to share.");
  assert.equal(shareProblem({ kind: "competitors", brand: { name: "Acme" }, days: 7, at: day(0) }), "Nothing to share.");
  assert.match(shareProblem(ok, 100)!, /too large/);
});
