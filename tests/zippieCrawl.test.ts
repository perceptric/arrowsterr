// Zippie's crawl checks on fixed HTML: the facts of a page, the problems across a site, robots.txt and PageSpeed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { inboundCounts, pageFacts, robotsReport, siteIssues, speedReport, urlKey, type CrawledPage } from "../src/lib/zippieCrawl.ts";

const PAGE = `<!doctype html><html lang="en"><head><title>AI agents for restaurants | Tavola</title>
<meta name="description" content="What an AI agent is and how it helps guests.">
<meta name="robots" content="index, follow"><link rel="canonical" href="https://tavola.example/blog/ai-agents/">
<link rel="alternate" hreflang="es" href="/es/blog/ai-agents">
<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"Article"},{"@type":["FAQPage"]}]}</script></head>
<body><header><a href="/">Home</a></header><h1>What is an AI agent?</h1><h2>Agents</h2><p>An agent takes steps on its own.</p>
<a href="/blog/chatbots">restaurant chatbot</a> <a href="https://www.tavola.example/pricing#top">Pricing</a>
<a href="https://other.example/x" rel="nofollow">source</a> <a href="mailto:hi@tavola.example">mail</a>
<img src="/a.png" alt="Agent diagram"><img src="/b.png"></body></html>`;

test("a page's SEO facts: title, meta, canonical, headings, links, images, schema, hreflang", () => {
  const f = pageFacts(PAGE, "https://tavola.example/blog/ai-agents/");
  assert.equal(f.title, "AI agents for restaurants | Tavola");
  assert.equal(f.description, "What an AI agent is and how it helps guests.");
  assert.equal(f.canonical, "https://tavola.example/blog/ai-agents/");
  assert.equal(f.noindex, false);
  assert.deepEqual(f.h1, ["What is an AI agent?"]);
  assert.equal(f.h2, 1);
  assert.deepEqual(f.schema, ["Article", "FAQPage"]);
  assert.deepEqual(f.hreflang, [{ lang: "es", url: "https://tavola.example/es/blog/ai-agents" }]);
  assert.equal(f.links.length, 4); // mailto left out
  assert.ok(f.links.find((l) => l.anchor === "Pricing")!.internal); // www and the hash don't make it outside
  assert.ok(f.links.find((l) => l.anchor === "source")!.nofollow);
  assert.deepEqual(f.images.map((i) => i.alt), ["Agent diagram", null]);
  assert.equal(urlKey("https://WWW.Tavola.example/blog/x/#top"), "https://tavola.example/blog/x");
});

const page = (url: string, over: Partial<CrawledPage> = {}, html = ""): CrawledPage => ({
  url,
  status: 200,
  hops: 0,
  finalUrl: url,
  inSitemap: true,
  facts: pageFacts(html || `<html><head><title>${url}</title><meta name="description" content="${url}"></head><body><h1>x</h1>${"word ".repeat(400)}</body></html>`, url),
  ...over,
});

test("the site check finds broken pages, noindex in the sitemap, chains, duplicates, thin and orphan pages", () => {
  const home = page("https://tavola.example/", {}, `<html><head><title>Home</title><meta name="description" content="d"></head><body><h1>Home</h1><a href="/blog/a">a</a><a href="/blog/b">b</a></body></html>`);
  const a = page("https://tavola.example/blog/a", {}, `<html><head><title>Same</title><meta name="description" content="one"></head><body><h1>A</h1>${"word ".repeat(400)}<a href="/blog/b">b</a></body></html>`);
  const b = page("https://tavola.example/blog/b", {}, `<html><head><title>Same</title><meta name="robots" content="noindex"><meta name="description" content="two"></head><body><h1>B</h1>short</body></html>`);
  const orphan = page("https://tavola.example/blog/c");
  const dead = page("https://tavola.example/old", { status: 404, facts: null });
  const chain = page("https://tavola.example/moved", { hops: 2, finalUrl: "https://tavola.example/blog/a" });
  const issues = siteIssues([home, a, b, orphan, dead, chain]);
  const hit = (k: string) => issues.find((i) => i.key === k)?.pages ?? [];
  assert.deepEqual(hit("broken"), ["https://tavola.example/old"]);
  assert.deepEqual(hit("noindex"), ["https://tavola.example/blog/b"]);
  assert.deepEqual(hit("chains"), ["https://tavola.example/moved"]);
  assert.deepEqual(hit("dup-title").sort(), ["https://tavola.example/blog/a", "https://tavola.example/blog/b"]);
  assert.ok(hit("thin").includes("https://tavola.example/blog/b"));
  assert.ok(hit("orphan").includes("https://tavola.example/blog/c") && !hit("orphan").includes("https://tavola.example/"));
  assert.equal(issues[0].key, "broken"); // most harmful first
  assert.equal(inboundCounts([home, a])["https://tavola.example/blog/b"], 2);
});

test("robots.txt: sitemaps, and which AI bots may read the site", () => {
  const r = robotsReport("User-agent: GPTBot\nDisallow: /\n\nUser-agent: *\nDisallow: /admin\n\nSitemap: https://tavola.example/sitemap.xml");
  assert.deepEqual(r.sitemaps, ["https://tavola.example/sitemap.xml"]);
  assert.equal(r.bots.find((b) => b.agent === "GPTBot")!.home, false);
  assert.equal(r.bots.find((b) => b.agent === "ClaudeBot")!.home, true);
  assert.equal(r.blocksAll, false);
});

test("PageSpeed: the score, lab and field metrics, and the biggest savings first", () => {
  const s = speedReport({
    lighthouseResult: {
      categories: { performance: { score: 0.62 } },
      audits: {
        "largest-contentful-paint": { displayValue: "3.4 s" },
        "cumulative-layout-shift": { displayValue: "0.02" },
        "render-blocking-resources": { title: "Remove render-blocking files", details: { type: "opportunity", overallSavingsMs: 900 } },
        "uses-optimized-images": { title: "Compress images", details: { type: "opportunity", overallSavingsMs: 2100 } },
        tiny: { title: "Tiny", details: { type: "opportunity", overallSavingsMs: 40 } },
      },
    },
    loadingExperience: { metrics: { LARGEST_CONTENTFUL_PAINT_MS: { percentile: 3100, category: "AVERAGE" } } },
  });
  assert.equal(s.score, 62);
  assert.equal(s.lab.lcp, "3.4 s");
  assert.deepEqual(s.field.lcp, { value: 3100, rating: "AVERAGE" });
  assert.deepEqual(s.savings.map((x) => x.fix), ["Compress images", "Remove render-blocking files"]);
});
