import { test } from "node:test";
import assert from "node:assert/strict";
import { citations, coverage, promptsFor, relevance, terms } from "../src/lib/promptCoverage.ts";
import type { Chat } from "../src/lib/chats.ts";

test("main words drop stop words and fold plurals", () => {
  assert.deepEqual(terms("How do I calculate NPS scores?"), ["calculate", "nps", "score"]);
  assert.deepEqual(terms("What is the best survey for businesses"), ["survey", "business"]);
  assert.ok(terms("analysis basis").includes("analysis"), "words ending in -is keep their s");
});

test("prompts about the article's topic come first", () => {
  const topic = "How to Calculate NPS: Formula, Example and Calculator. how to calculate nps";
  assert.equal(relevance("how to calculate NPS", topic), 1);
  const list = promptsFor(["best CRM for startups", "how to calculate NPS", "NPS calculator for restaurants"], topic);
  assert.deepEqual(
    list.map((p) => p.prompt),
    ["how to calculate NPS", "NPS calculator for restaurants"],
  );
});

test("coverage counts the prompt's words found in the text", () => {
  const text = "To calculate NPS, subtract the share of detractors from the share of promoters.";
  assert.equal(coverage("how to calculate NPS", text).state, "answered");
  const part = coverage("what is a good NPS score for restaurants", text);
  assert.equal(part.state, "missing");
  assert.deepEqual(part.found, ["nps"]);
});

const chat = (o: Partial<Chat>): Chat => ({ engine: "ChatGPT", prompt: "how to calculate NPS", text: "", sources: [], brands: [], error: null, ...o });

test("citations read the latest run that asked the prompt", () => {
  const runs = [
    { at: "2026-11-01", chats: [chat({ engine: "ChatGPT", sources: [{ url: "https://momos.com/blog/nps", title: null, domain: "momos.com" }] })] },
    {
      at: "2026-11-20",
      chats: [
        chat({ engine: "ChatGPT" }),
        chat({ engine: "Perplexity", sources: [{ url: "https://www.momos.com/x", title: null, domain: "www.momos.com" }] }),
        chat({ engine: "Claude", brands: [{ name: "Momos", position: 2, sentiment: 0 }] }),
        chat({ engine: "Gemini", prompt: "something else", sources: [{ url: "https://momos.com", title: null, domain: "momos.com" }] }),
      ],
    },
  ];
  const out = citations(runs, "How to calculate NPS", { name: "Momos", domain: "https://momos.com" });
  assert.equal(out.at, "2026-11-20");
  assert.deepEqual(out.engines, [
    { engine: "ChatGPT", cited: false, named: false },
    { engine: "Perplexity", cited: true, named: false },
    { engine: "Claude", cited: false, named: true },
  ]);
  assert.deepEqual(citations(runs, "never asked", { name: "Momos", domain: "momos.com" }), { at: null, engines: [] });
});
