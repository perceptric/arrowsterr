import assert from "node:assert/strict";
import { test } from "node:test";
import { crawlDelay, crawlRate, endlessPath, indexable, isChallenge, isInternal, normUrl, partialReason, pathMatches, readPage, readSettings, sameish, skipReason, TIME_CAP_MS, urlHash } from "../src/lib/audit/crawl.ts";
import { buildGraph, compareCrawls, crawlStats, pageRank, pageValues, scoreOf, type GraphPage } from "../src/lib/audit/graph.ts";

test("normUrl writes one address one way", () => {
  assert.equal(normUrl("HTTPS://Acme.COM:443/Blog/Post/?utm_source=x&b=2&a=1#top"), "https://acme.com/Blog/Post/?a=1&b=2");
  assert.equal(normUrl("http://acme.com:80/"), "http://acme.com/");
  assert.equal(normUrl("/pricing?gclid=1", "https://www.acme.com/blog/"), "https://www.acme.com/pricing");
  assert.equal(normUrl("../about", "https://acme.com/blog/post"), "https://acme.com/about");
  assert.equal(normUrl("mailto:hi@acme.com"), null);
  assert.equal(normUrl("not a url"), null);
  // The trailing slash stays as it is: /a and /a/ can be different pages.
  assert.notEqual(normUrl("https://acme.com/a"), normUrl("https://acme.com/a/"));
  assert.equal(urlHash("https://acme.com/a"), urlHash("https://acme.com/a"));
  assert.equal(urlHash("https://acme.com/a").length, 20);
});

test("internal means the same site, with or without www", () => {
  assert.equal(isInternal("https://www.acme.com/x", "acme.com", false), true);
  assert.equal(isInternal("https://acme.com/x", "acme.com", false), true);
  assert.equal(isInternal("https://blog.acme.com/x", "acme.com", false), false);
  assert.equal(isInternal("https://blog.acme.com/x", "acme.com", true), true);
  assert.equal(isInternal("https://notacme.com/x", "acme.com", true), false);
});

test("include and exclude patterns, files and endless paths are skipped", () => {
  assert.equal(pathMatches("/blog", "/blog/post"), true);
  assert.equal(pathMatches("/blog/*", "/blog/post"), true);
  assert.equal(pathMatches("/blog/*", "/blogs"), false);
  assert.equal(pathMatches("*/tag/*", "/blog/tag/seo"), true);
  const s = { include: [], exclude: ["/tag/*"] };
  assert.equal(skipReason("https://acme.com/tag/seo", s, 1), "excluded");
  assert.equal(skipReason("https://acme.com/logo.png", s, 1), "file");
  assert.equal(skipReason("https://acme.com/a", s, 21), "deep");
  assert.equal(skipReason("https://acme.com/blog/post", s, 2), null);
  assert.equal(skipReason("https://acme.com/pricing", { include: ["/blog/*"], exclude: [] }, 1), "excluded");
  assert.equal(skipReason("https://acme.com/", { include: ["/blog/*"], exclude: [] }, 0), null);
  assert.equal(endlessPath(new URL("https://acme.com/events?month=2026-11")), true);
  assert.equal(endlessPath(new URL("https://acme.com/a/b/a/b/a/b")), true);
  assert.equal(endlessPath(new URL("https://acme.com/2024/05/post")), false);
});

const PAGE = `<!doctype html><html><head><title> Best CRMs  for startups </title>
<meta name="robots" content="index, follow"><link rel="canonical" href="/best-crm/">
<meta property="article:published_time" content="2026-03-01T10:00:00Z"></head><body>
<header><nav><a href="/">Home</a><a href="/pricing">Pricing</a></nav></header>
<main><h1>Best CRMs</h1><h2>HubSpot</h2><p>We tried every one of these tools with a real sales team for a month, and here is what we found.</p>
<p>Read our <a href="/blog/crm-pricing?utm_source=x">guide to CRM pricing</a> first, then compare <a href="https://www.acme.com/pricing#plans" rel="nofollow">our plans</a>.</p>
<a href="https://hubspot.com">HubSpot</a><a href="mailto:x@y.z">Mail</a><a href="#top">Top</a></main>
<footer><a href="/privacy">Privacy</a></footer></body></html>`;

test("readPage finds the facts and every internal link with its place", () => {
  const r = readPage(PAGE, "https://acme.com/best-crm/", "acme.com", false);
  assert.equal(r.title, "Best CRMs for startups");
  assert.deepEqual(r.h1, ["Best CRMs"]);
  assert.deepEqual(r.h2, ["HubSpot"]);
  assert.equal(r.canonical, "https://acme.com/best-crm/");
  assert.equal(r.noindex, false);
  assert.equal(r.published, "2026-03-01");
  assert.equal(r.extLinks, 1);
  const by = Object.fromEntries(r.links.map((l) => [l.url, l]));
  assert.equal(by["https://acme.com/"].place, "nav");
  assert.equal(by["https://acme.com/blog/crm-pricing"].place, "body");
  assert.equal(by["https://acme.com/blog/crm-pricing"].anchor, "guide to CRM pricing");
  assert.equal(by["https://www.acme.com/pricing"].rel, "nofollow");
  assert.equal(by["https://acme.com/privacy"].place, "footer");
  assert.equal(r.links.length, 5);
  assert.equal(indexable(200, r, "https://acme.com/best-crm/", null), true);
  assert.equal(indexable(200, r, "https://acme.com/best-crm/", "noindex"), false);
  assert.equal(indexable(404, r, "https://acme.com/best-crm/", null), false);
  assert.equal(indexable(200, { noindex: false, canonical: "https://acme.com/other" }, "https://acme.com/best-crm/", null), false);
  assert.equal(sameish("http://www.acme.com/a/", "https://acme.com/a"), true);
});

test("noindex in the page is read", () => {
  const r = readPage('<html><head><meta name="robots" content="noindex,follow"></head><body></body></html>', "https://acme.com/x", "acme.com", false);
  assert.equal(r.noindex, true);
});

test("a firewall's challenge page is told apart from a real 403", () => {
  assert.equal(isChallenge(403, "<title>Just a moment...</title><script src=/cdn-cgi/challenge-platform/x>", null), true);
  assert.equal(isChallenge(200, "", new Headers({ "cf-mitigated": "challenge" })), true);
  assert.equal(isChallenge(403, "<h1>Forbidden</h1>", null), false);
  assert.equal(isChallenge(200, "Just a moment...", null), false);
});

test("crawl speed follows the setting, Crawl-delay and 429s", () => {
  assert.equal(crawlDelay("User-agent: *\nCrawl-delay: 4\n"), 4);
  assert.equal(crawlDelay("User-agent: Googlebot\nCrawl-delay: 9\n\nUser-agent: *\nDisallow: /x\n"), null);
  assert.equal(crawlDelay("User-agent: ArrowsterrBot\nUser-agent: Bingbot\nCrawl-delay: 2\n"), 2);
  assert.equal(crawlRate("normal", null, 0), 2);
  assert.equal(crawlRate("fast", 4, 0), 0.25);
  assert.equal(crawlRate("normal", null, 1), 1);
});

test("partial crawls say why", () => {
  const t = { home: { status: 200 }, done: 100, noAnswer: 2, found: 120, startedAt: 0, now: 1000 };
  assert.equal(partialReason(t), null);
  assert.equal(partialReason({ ...t, home: { status: 0 } }), "home");
  assert.equal(partialReason({ ...t, home: { status: 503 } }), "home");
  assert.equal(partialReason({ ...t, home: null }), "home");
  // A 404 home page is a finding, and the crawl still counts.
  assert.equal(partialReason({ ...t, home: { status: 404 } }), null);
  assert.equal(partialReason({ ...t, noAnswer: 51 }), "no_answer");
  assert.equal(partialReason({ ...t, done: 50, found: 400, now: TIME_CAP_MS }), "time");
  assert.equal(partialReason({ ...t, done: 300, found: 400, now: TIME_CAP_MS }), null);
});

test("settings are cleaned and never pass the plan's limit", () => {
  const s = readSettings({ start: "www.acme.com/blog", include: "blog/*, /guides", exclude: ["/tag/*"], speed: "fast", limit: 99999, subdomains: true }, "https://acme.com/", 2000);
  assert.deepEqual(s, { start: "https://www.acme.com/blog", subdomains: true, include: ["/blog/*", "/guides"], exclude: ["/tag/*"], speed: "fast", limit: 2000 });
  const d = readSettings(null, "https://acme.com/", 100);
  assert.equal(d.start, "https://acme.com/");
  assert.equal(d.speed, "normal");
  assert.equal(d.limit, 100);
});

// A small site: home links to a, b and an old address that redirects to c. b links to d. e is only in the sitemap.
// f is a 404 that a links to. g answers 200 but nothing links to it and it came from a link (unknown to the site).
const node = (hash: string, linksTo: string[], extra: Partial<GraphPage> = {}): GraphPage => ({ hash, status: 200, html: true, finalHash: null, linksTo, bodyLinksTo: linksTo, foundFrom: "link", aiCitations: 0, ...extra });
const SITE: (GraphPage & { indexable: boolean })[] = [
  { ...node("home", ["a", "b", "old"], { foundFrom: "home" }), indexable: true },
  { ...node("a", ["home", "f", "old"]), indexable: true },
  { ...node("b", ["home", "d"]), indexable: true },
  { ...node("old", [], { status: 301, html: false, finalHash: "c" }), indexable: false },
  { ...node("c", ["home"], { foundFrom: "redirect" }), indexable: true },
  { ...node("d", ["home"]), indexable: false },
  { ...node("e", [], { foundFrom: "sitemap", aiCitations: 3 }), indexable: true },
  { ...node("f", [], { status: 404, html: false }), indexable: false },
];

test("the graph gives depth, links in, orphans and bad links", () => {
  const g = buildGraph(SITE, "home");
  assert.equal(g.get("home")!.depth, 0);
  assert.equal(g.get("a")!.depth, 1);
  assert.equal(g.get("c")!.depth, 1); // through the redirect, at no extra click
  assert.equal(g.get("d")!.depth, 2);
  assert.equal(g.get("e")!.depth, null);
  assert.equal(g.get("home")!.linksIn, 4); // a, b, c and d
  assert.equal(g.get("old")!.linksIn, 2);
  assert.equal(g.get("c")!.linksIn, 2); // the links to its old address count, once per page
  assert.equal(g.get("e")!.orphan, true);
  assert.equal(g.get("d")!.orphan, false);
  assert.equal(g.get("f")!.orphan, false); // a broken page is a broken page, not an orphan
  assert.equal(g.get("home")!.orphan, false);
  assert.equal(g.get("a")!.badLinksOut, 2); // the 404 and the redirect
  assert.equal(g.get("home")!.badLinksOut, 1);
  assert.equal(g.get("home")!.linkScore, 10);
  assert.equal(g.get("e")!.linkScore, 0);
  assert.ok(g.get("a")!.linkScore > 0 && g.get("a")!.linkScore < 10);
  // e has AI citations, so it's worth more than any page with none, whatever its link score.
  assert.ok(g.get("e")!.value > g.get("home")!.value);
});

test("a page that links to the same target twice counts once", () => {
  const g = buildGraph([node("home", ["a", "a"], { foundFrom: "home" }), node("a", ["home"])], "home");
  assert.equal(g.get("a")!.linksIn, 1);
});

test("stats add up", () => {
  const s = crawlStats(SITE, buildGraph(SITE, "home"), "home");
  assert.equal(s.pages, 8);
  assert.equal(s.ok, 6);
  assert.equal(s.redirects, 1);
  assert.equal(s.broken, 1);
  assert.equal(s.orphans, 1);
  assert.equal(s.unreachable, 1);
  assert.equal(s.notIndexable, 1);
  assert.equal(s.pagesWithBadLinks, 2);
  assert.equal(s.badLinks, 3);
  assert.equal(s.avgDepth, 1); // home 0, a 1, b 1, c 1, d 2
});

test("PageRank sums to one and the score is a log scale", () => {
  const pr = pageRank(["x", "y", "z"], new Map([["x", ["y", "z"]], ["y", ["x"]], ["z", []]]));
  const sum = [...pr.values()].reduce((s, v) => s + v, 0);
  assert.ok(Math.abs(sum - 1) < 1e-9);
  assert.equal(scoreOf(0.1, 0.1, 1), 0);
  assert.equal(scoreOf(1, 0.1, 1), 10);
  assert.equal(scoreOf(0.5, 0.5, 0.5), 0);
});

test("page value: data a site lacks drops out, and traffic beats link score", () => {
  // No traffic data at all: link score orders the pages.
  const v1 = pageValues([{ linkScore: 1 }, { linkScore: 5 }, { linkScore: 0 }]);
  assert.ok(v1[1] > v1[0] && v1[0] > v1[2]);
  assert.equal(v1[2], 0);
  // With clicks: a page with a few clicks beats a page with the best link score and none.
  const v2 = pageValues([{ clicks: 1, linkScore: 0 }, { clicks: 0, linkScore: 10 }, { clicks: 500, linkScore: 2 }]);
  assert.ok(v2[0] > v2[1]);
  assert.ok(v2[2] > v2[0]);
  assert.ok(v2.every((v) => v >= 0 && v <= 1));
});

test("crawl compare finds pages added and gone", () => {
  const c = compareCrawls([{ hash: "a", url: "/a" }, { hash: "b", url: "/b" }], [{ hash: "b", url: "/b" }, { hash: "c", url: "/c" }]);
  assert.deepEqual(c, { added: 1, gone: 1, addedSample: ["/a"], goneSample: ["/c"] });
});
