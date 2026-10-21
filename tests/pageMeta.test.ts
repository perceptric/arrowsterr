import assert from "node:assert/strict";
import { test } from "node:test";
import { faqPairs, pageMeta, readHours } from "../src/lib/pageMeta.ts";

const html = `<!doctype html><html lang="en-US"><head>
<title>Trail Shoes | Acme</title>
<meta name="description" content="Shoes for rough ground.">
<meta property="og:site_name" content="Acme">
<meta property="og:image" content="/img/shoe.jpg">
<meta property="article:published_time" content="2026-03-02T10:00:00Z">
<link rel="canonical" href="https://acme.com/shoes">
</head><body>
<header><img src="/logo.svg" alt="Acme logo"></header>
<h1>Trail Shoes</h1>
<a href="tel:+1%20555%200100">Call</a> <a href="mailto:hi@acme.com?subject=x">Mail</a>
<a href="https://www.linkedin.com/company/acme/">LinkedIn</a> <a href="https://x.com/">X home</a> <a href="javascript:alert(1)">bad</a>
<h2>Do you ship abroad?</h2><p>Yes, we ship to 40 countries.</p><p>Returns are free.</p>
<h2>About us</h2><p>We make shoes.</p>
<details><summary>Can I return worn shoes?</summary><p>Within 30 days of delivery.</p></details>
<dl><dt>Is there a warranty?</dt><dd>One year on every pair.</dd></dl>
<h3>Why?</h3><p>Ok</p>
</body></html>`;

test("the page's own tags, links and contact details are read without any AI", () => {
  const p = pageMeta(html, "https://acme.com/shoes?ref=1");
  assert.equal(p.lang, "en-US");
  assert.equal(p.title, "Trail Shoes | Acme");
  assert.equal(p.siteName, "Acme");
  assert.equal(p.image, "https://acme.com/img/shoe.jpg");
  assert.equal(p.logo, "https://acme.com/logo.svg");
  assert.equal(p.published, "2026-03-02");
  assert.equal(p.canonical, "https://acme.com/shoes");
  assert.equal(p.phone, "+1 555 0100");
  assert.equal(p.email, "hi@acme.com");
  assert.deepEqual(p.sameAs, ["https://www.linkedin.com/company/acme"], "a network's home page isn't a profile");
});

test("FAQ pairs come from question headings, details and definition lists", () => {
  const f = faqPairs(html);
  assert.deepEqual(f.map((x) => x.q), ["Can I return worn shoes?", "Is there a warranty?", "Do you ship abroad?"]);
  assert.equal(f[2].a, "Yes, we ship to 40 countries. Returns are free.");
  assert.equal(f.some((x) => x.q === "Why?"), false, "a one-word answer is too short");
});

test("opening hours are read from common ways of writing them", () => {
  assert.deepEqual(readHours("Mon-Fri 09:00-17:00, Sat 10:00-14:00"), [
    { days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"], opens: "09:00", closes: "17:00" },
    { days: ["Saturday"], opens: "10:00", closes: "14:00" },
  ]);
  assert.deepEqual(readHours("Monday to Thursday 9am - 5:30pm"), [{ days: ["Monday", "Tuesday", "Wednesday", "Thursday"], opens: "09:00", closes: "17:30" }]);
  assert.deepEqual(readHours("Closed on holidays"), []);
});
