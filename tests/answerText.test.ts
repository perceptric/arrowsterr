import assert from "node:assert/strict";
import { test } from "node:test";
import { cleanAnswer, cleanUrl, siteLabel } from "../src/lib/answerText.ts";

// Real ChatGPT answer, as DataForSEO returns it (shortened).
const CHATGPT = `# Best AI demand letter software for personal injury law firms (2026)

**My shortlist would start with EvenUp, Supio, and Eve.** If you're evaluating software, the key difference is the workflow. [medrecords.ai](https://medrecords.ai/best/demand-letter-software/?utm_source=chatgpt.com)[www.eve.legal](https://www.eve.legal/tort-report/best?utm_source=chatgpt.com)[www.hellocounsel.ai](https://www.hellocounsel.ai/blog/top?utm_source=chatgpt.com)

## Top options to evaluate

![Demands™ | Settlement Demand Letters Crafted with AI & In-House Expertise](https://images.openai.com/static-rsc-4/GOhz?purpose=fullsize)

## 1\\. EvenUp

(Best for demand packages)

EvenUp specializes in personal injury demands. [www.eve.legal](https://www.eve.legal/tort-report/best?utm_source=chatgpt.com)[www.legesgpt.com](https://www.legesgpt.com/blog/best?utm_source=chatgpt.com)[www.eve.legal](https://www.eve.legal/other?utm_source=chatgpt.com)

**Best for\\:** Firms that want to scale demand production.

Pricing: Quote-based.

[Visit EvenUp](https://www.evenuplaw.com/)

---

![How to Roll Out AI at Your Law Firm | Supio](https://images.openai.com/static-rsc-4/MgXO?purpose=fullsize)

## 2\\. Supio

Supio combines medical-record analysis. [Read the Supio docs](https://www.supio.com/docs?utm_source=chatgpt.com) for more.

---
`;

// Real Google AI Overview answer (shortened).
const AIO = `The top AI demand letter software are \`specialized solutions built for medical record parsing\`:[[1]](https://www.inquery.ai/post/ai-demand-letter-tools/)

- **EvenUp** (\`Demands\` ): Best for high-volume practices.[[1]](https://www.legesgpt.com/blog/best)[[2]](https://www.evenuplaw.com/products/demands/)
- **Law Practice AI** : Best for plaintiff-side PI firms.



---

### Key Features to Compare
| Feature | PI AI Tools |
|---|---|
| **HIPAA** | SOC 2 |`;

test("pictures are dropped, alt text and all", () => {
  const out = cleanAnswer(CHATGPT, "ChatGPT");
  assert.ok(!out.includes("!["));
  assert.ok(!out.includes("Settlement Demand Letters Crafted"));
  assert.ok(!out.includes("images.openai.com"));
});

test("escaped punctuation reads normally", () => {
  const out = cleanAnswer(CHATGPT, "ChatGPT");
  assert.ok(out.includes("## 1. EvenUp"));
  assert.ok(out.includes("**Best for:**"));
  assert.ok(!out.includes("\\:"));
  assert.ok(!out.includes("\\."));
});

test("button lines like Visit EvenUp are dropped, links inside sentences stay", () => {
  const out = cleanAnswer(CHATGPT, "ChatGPT");
  assert.ok(!out.includes("Visit EvenUp"));
  assert.ok(out.includes("[Read the Supio docs](https://www.supio.com/docs) for more."));
});

test("a run of cited sites keeps each site once, with short labels, after a space", () => {
  const out = cleanAnswer(CHATGPT, "ChatGPT");
  assert.ok(out.includes("specializes in personal injury demands. [eve.legal](https://www.eve.legal/tort-report/best)[legesgpt.com](https://www.legesgpt.com/blog/best)\n"));
  assert.ok(out.includes("the workflow. [medrecords.ai]"));
  assert.ok(!out.includes("utm_source"));
  assert.ok(!out.includes("[www."));
});

test("rules never start, end or double up", () => {
  const out = cleanAnswer(CHATGPT, "ChatGPT");
  assert.ok(!out.endsWith("---"));
  assert.ok(!/---\s*\n\s*---/.test(out));
  assert.ok(!/\n{3,}/.test(out));
});

test("Google citations become site citations, and highlights lose their code marks", () => {
  const out = cleanAnswer(AIO, "AI Overview");
  assert.ok(out.includes("built for medical record parsing: [inquery.ai](https://www.inquery.ai/post/ai-demand-letter-tools/)"));
  assert.ok(out.includes("**EvenUp** (Demands): Best for high-volume practices. [legesgpt.com](https://www.legesgpt.com/blog/best)[evenuplaw.com]"));
  assert.ok(out.includes("**Law Practice AI**: Best"));
  assert.ok(!out.includes("`"));
  assert.ok(!out.includes("[[1]]"));
});

test("tables survive", () => {
  const out = cleanAnswer(AIO, "AI Overview");
  assert.ok(out.includes("| Feature | PI AI Tools |\n|---|---|\n| **HIPAA** | SOC 2 |"));
});

test("code marks stay for engines that mean code", () => {
  assert.equal(cleanAnswer("Run `npm install` first.", "ChatGPT"), "Run `npm install` first.");
});

test("citations whose number was already stripped still show their site", () => {
  assert.equal(cleanAnswer("Fact.[](https://www.supio.com/x?utm_source=chatgpt.com)", "ChatGPT"), "Fact. [supio.com](https://www.supio.com/x)");
});

test("cleaning twice changes nothing", () => {
  for (const [t, e] of [[CHATGPT, "ChatGPT"], [AIO, "AI Overview"]]) {
    const once = cleanAnswer(t, e);
    assert.equal(cleanAnswer(once, e), once);
  }
});

test("helpers", () => {
  assert.equal(cleanUrl("https://a.com/x?utm_source=chatgpt.com"), "https://a.com/x");
  assert.equal(cleanUrl("https://a.com/x?id=2&utm_medium=y"), "https://a.com/x?id=2");
  assert.equal(siteLabel("www.Eve.legal"), "eve.legal");
  assert.equal(siteLabel("https://www.supio.com/a"), "supio.com");
  assert.equal(cleanAnswer("", "ChatGPT"), "");
});
