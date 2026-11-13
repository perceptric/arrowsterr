import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanPersona, personaMarkdown, personaPrompt, personaReady, personaText, personaVoice, pickPages, sampleProblems, syllables, voiceStats, type PersonaSource } from "../src/lib/writerPersona.ts";
import { postShape } from "../src/lib/postShape.ts";

const site = "https://tavola.example";
const sources: PersonaSource[] = [
  { url: `${site}/`, kind: "home", title: "Tavola", text: "Tavola helps restaurants answer every guest. More than 1,200 restaurants use Tavola to answer guests in under a minute." },
  { url: `${site}/customers`, kind: "product", title: "Customers", text: "Bella Cucina cut missed calls by 40% in the first month with Tavola’s inbox." },
];

test("pickPages finds the about page, product pages first by depth, and posts newest first", () => {
  const pages = [
    { url: `${site}/blog/old-post-about-tables`, article: true },
    { url: `${site}/blog/new-post-about-guests`, article: true },
    { url: `${site}/about`, article: false },
    { url: `${site}/products/inbox/setup`, article: false },
    { url: `${site}/products`, article: false },
    { url: `${site}/pricing`, article: false },
    { url: `${site}/privacy`, article: false },
    { url: `${site}/blog/tag/guests`, article: true },
  ];
  const r = pickPages(pages, [`${site}/blog/newest-from-feed`]);
  assert.equal(r.about, `${site}/about`);
  assert.deepEqual(r.products, [`${site}/pricing`, `${site}/products`, `${site}/products/inbox/setup`]);
  assert.deepEqual(r.posts, [`${site}/blog/newest-from-feed`, `${site}/blog/new-post-about-guests`, `${site}/blog/old-post-about-tables`]);
});

test("postShape keeps the post's paragraphs, lists and headings and drops the menu", () => {
  const html = `<html><body><nav><p>Home Blog Pricing About us and more links here</p></nav><article><h1>How to answer guests</h1>
    <p>We answer every guest within a minute, and you can do the same with a few simple habits.</p>
    <h2>Start with the phone</h2><p>Most guests still call first, so the phone is where you win or lose the table.</p>
    <ul><li>Pick up fast</li><li>Say your name</li></ul><h2>Then the inbox</h2></article><footer><p>Copyright Tavola, all rights reserved here.</p></footer></body></html>`;
  const s = postShape(html);
  assert.equal(s.title, "How to answer guests");
  assert.equal(s.paragraphs.length, 2);
  assert.equal(s.lists, 1);
  assert.equal(s.headings, 2);
});

test("voiceStats measures sentences, paragraphs, we and you, contractions and grade", () => {
  const post = { title: "x", lists: 2, headings: 4, words: 0, paragraphs: ["We answer every guest fast. You can do it too, and it's easier than it looks.", "Guests remember the restaurants that answer them. We've seen it at every table we serve."] };
  const s = voiceStats([post, { ...post, lists: 0, headings: 2 }]);
  assert.equal(s.posts, 2);
  assert.equal(s.paragraphAvg, 2);
  assert.ok(s.sentenceAvg > 5 && s.sentenceAvg < 15);
  assert.ok(s.we > 50 && s.you > 20);
  assert.ok(s.contractions > 20);
  assert.ok(s.grade > 0 && s.grade < 12);
  assert.equal(s.listsPerPost, 1);
  assert.equal(s.headingsPerPost, 3);
  assert.equal(syllables("restaurant"), 3);
  assert.equal(syllables("the"), 1);
  assert.equal(voiceStats([]).posts, 0);
});

test("cleanPersona keeps proof only when the quote is on the site, and fixes its address", () => {
  const p = cleanPersona(
    {
      writer: "The Tavola team",
      reader: "Restaurant owners",
      tone: ["Warm", "plain"],
      proof: [
        { claim: "1,200 restaurants", quote: "More than 1,200 restaurants use Tavola", url: `${site}/` },
        { claim: "40% fewer missed calls", quote: "Bella Cucina cut missed calls by 40% in the first month with Tavola's inbox", url: `${site}/wrong` },
        { claim: "Made up", quote: "Tavola doubled revenue for 500 restaurants", url: `${site}/` },
        { claim: "Too short", quote: "Tavola", url: `${site}/` },
      ],
      never: ["Guaranteed results", "guaranteed results"],
      sample: "We answer guests.",
    },
    sources,
  );
  assert.deepEqual(
    p.proof.map((x) => [x.claim, x.url]),
    [
      ["1,200 restaurants", `${site}/`],
      ["40% fewer missed calls", `${site}/customers`],
    ],
  );
  assert.deepEqual(p.tone, ["warm", "plain"]);
  assert.deepEqual(p.never, ["Guaranteed results"]);
  assert.equal(cleanPersona(null).proof.length, 0);
});

test("sampleProblems flags house rule breaks and numbers that aren't on the site", () => {
  assert.deepEqual(sampleProblems("Tavola answers more than 1,200 restaurants' guests, and we think every guest who calls should hear a friendly voice within a minute of picking up the phone.", sources), []);
  const bad = sampleProblems("It's not a phone tool, it's a guest tool. Tavola tripled bookings for 350 restaurants last year — a big win!", sources);
  assert.ok(bad.some((b) => b.includes("contrast")));
  assert.ok(bad.some((b) => b.includes("350")));
  assert.ok(bad.some((b) => b.includes("dash")));
  assert.deepEqual(sampleProblems("", sources), ["The sample paragraph is empty."]);
});

test("the persona feeds the voice, the writer and the Knowledge page", () => {
  const p = cleanPersona({ writer: "The Tavola team", reader: "Restaurant owners", pov: "Every guest deserves an answer", tone: ["warm"], sentences: "12 to 20 words", use: ["guests"], avoid: ["leverage"], naming: "Tavola", proof: [{ claim: "1,200 restaurants", quote: "More than 1,200 restaurants use Tavola", url: site }], never: ["Guaranteed bookings"], cta: "Book a demo", questions: ["Who writes the blog?"], sample: "We answer every guest." }, sources);
  assert.equal(personaReady(p), true);
  assert.deepEqual(personaVoice(p).use, ["guests"]);
  assert.match(personaText(p), /Approved proof[\s\S]*1,200 restaurants/);
  assert.match(personaText(cleanPersona({}, [])), /Approved proof: none/);
  const md = personaMarkdown({ name: "Tavola" }, p, voiceStats([{ title: "", lists: 1, headings: 2, words: 0, paragraphs: ["We answer every guest fast and you can too."] }]));
  for (const h of ["## Who writes", "## Approved proof", "## Never claim", "## Open questions", "## Sample paragraph", "## Measured from 1 posts"]) assert.ok(md.includes(h), h);
});

test("the prompt names every source with its address and falls back to the house rules without posts", () => {
  const out = personaPrompt({ name: "Tavola", domain: "tavola.example" }, sources, voiceStats([]));
  assert.match(out, /Source 1: Homepage, https:\/\/tavola\.example\//);
  assert.match(out, /no blog posts to measure/);
  assert.match(out, /House rules/);
});
