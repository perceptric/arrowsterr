import assert from "node:assert/strict";
import { test } from "node:test";
import { cleanKit } from "../src/lib/brandKit.ts";
import { BRAND_SYSTEM, fallbackGuidelines, guidelinesBody, guidelinesPrompt, voicePages, voiceSample } from "../src/lib/brandSetup.ts";
import { cleanVoice } from "../src/lib/brandVoice.ts";

const page = (url: string, article = false) => ({ url, article });

test("voice pages: homepage, about, then articles, then short pages; legal and login skipped", () => {
  const pages = [
    page("https://acme.com/privacy"),
    page("https://acme.com/pricing"),
    page("https://acme.com/blog/how-to-plan-a-launch", true),
    page("https://acme.com/login"),
    page("https://acme.com/about"),
    page("https://acme.com/blog/tag/news"),
    page("https://acme.com/blog/five-ways-to-write-better-briefs", true),
    page("https://acme.com/features/reports-and-dashboards"),
  ];
  assert.deepEqual(voicePages(pages, "acme.com"), [
    "https://acme.com/",
    "https://acme.com/about",
    "https://acme.com/blog/how-to-plan-a-launch",
    "https://acme.com/blog/five-ways-to-write-better-briefs",
    "https://acme.com/pricing",
  ]);
  assert.deepEqual(voicePages([], "www.acme.com"), ["https://acme.com/"]);
  // A long top-level slug counts as an article, but posts in a folder come first.
  const mixed = [page("https://acme.com/b2b-content-marketing-agency-services", true), page("https://acme.com/blog/how-we-plan", true)];
  assert.deepEqual(voicePages(mixed, "acme.com").slice(1), ["https://acme.com/blog/how-we-plan", "https://acme.com/b2b-content-marketing-agency-services"]);
});

test("voice sample: the longest article wins, cut at a sentence end; short pages give nothing", () => {
  const long = "We plan every launch in three steps. ".repeat(200);
  const s = voiceSample([
    { url: "https://acme.com/", text: "Home ".repeat(400), article: false },
    { url: "https://acme.com/blog/a", text: long, article: true },
  ]);
  assert.ok(s.startsWith("We plan every launch"));
  assert.ok(s.length <= 4000 && s.endsWith("."));
  assert.equal(voiceSample([{ url: "https://acme.com/", text: "Too short.", article: false }]), "");
});

test("guidelines: voice, rules, messages, claims and look become one Markdown document", () => {
  const voice = cleanVoice({ tone: ["plain", "warm"], sentences: "Short, 8 to 15 words", use: ["teams"], avoid: ["synergy"], naming: "Acme, never ACME", reader: "Ops leads" });
  const kit = cleanKit({ name: "Acme" });
  const { body, reader } = guidelinesBody(
    { name: "Acme", domain: "acme.com" },
    { about: "Acme is a software company that plans launches for ops teams.", personality: "If Acme were a person, they'd be a calm planner.", offer: ["Acme Desk: launch plans"], reader: "", messages: ["Plans in one place"], proof: ["Used by 2,000 teams"], words: ["Acme Desk"], style: ["US spelling", "Sentence case headings"], dont: ["Don't call Acme the best"], cta: "Start free" },
    { voice, kit },
    "Written by Zippie from acme.com on 2026-10-25. Edit anything that's off.",
  );
  assert.equal(reader, "Ops leads");
  for (const h of ["# Acme", "## What we offer", "## Key messages", "## Voice and tone", "## Writing rules", "## Our words", "## Words we avoid", "## Proof we can use", "## Don't say", "## Look", "## Website"]) assert.ok(body.includes(h), h);
  assert.ok(body.includes("We sound plain, warm."));
  assert.ok(body.includes("teams, Acme Desk"));
  assert.ok(body.includes("_Written by Zippie from acme.com"));
});

test("guidelines: a broken reply still gives the name and the site", () => {
  const { body } = guidelinesBody({ name: "Acme", domain: "acme.com" }, null);
  assert.equal(body, "# Acme\n\n## Website\nhttps://acme.com");
  assert.equal(fallbackGuidelines({ name: "Acme", domain: "acme.com" }), body);
});

test("guidelines prompt: includes the learned voice and other pages; the system prompt carries the brand methods", () => {
  const p = guidelinesPrompt({ name: "Acme", domain: "acme.com" }, { title: "Acme", description: "", headings: [], ctas: [], body: "Home" }, { voice: cleanVoice({ tone: ["plain"], reader: "Ops leads" }), samples: [{ url: "https://acme.com/blog/a", text: "Our post." }] });
  assert.ok(p.includes("tone plain"));
  assert.ok(p.includes("https://acme.com/blog/a"));
  for (const m of ["Voice profiler", "Brand review", "Style sheet"]) assert.ok(BRAND_SYSTEM.includes(m), m);
});
