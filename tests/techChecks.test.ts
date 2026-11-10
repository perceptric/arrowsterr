import assert from "node:assert/strict";
import { test } from "node:test";
import { readPage, refreshTarget } from "../src/lib/tech/parse.ts";
import { indexReason, runChecks, score, validHreflang, type CheckPage, type SiteFacts } from "../src/lib/tech/checks.ts";
import { LinkTally, summarize } from "../src/lib/tech/summary.ts";
import { normUrl, isInternal, slashTwin, templates, templateName } from "../src/lib/tech/url.ts";
import { parseSitemap, robotsSitemaps } from "../src/lib/tech/sitemaps.ts";
import { cleanSettings, passesRules, pageLimit } from "../src/lib/tech/limits.ts";
import { isStuck } from "../src/lib/siteAudit.ts";

const ROOT = "https://acme.com/";

test("URLs are cleaned one way: host case, ports, fragments and tracking parameters go, the path stays", () => {
  assert.equal(normUrl("HTTPS://Acme.COM:443/Blog/?utm_source=x&b=2&a=1#top"), "https://acme.com/Blog/?a=1&b=2");
  assert.equal(normUrl("/pricing?gclid=1", "https://acme.com/x"), "https://acme.com/pricing");
  assert.equal(normUrl("mailto:a@b.com"), null);
  assert.equal(normUrl("https://acme.com/a?b=1", undefined, true), "https://acme.com/a");
  assert.ok(isInternal("https://www.acme.com/x", ROOT));
  assert.ok(!isInternal("https://blog.acme.com/x", ROOT));
  assert.ok(isInternal("https://blog.acme.com/x", ROOT, true));
  assert.equal(slashTwin("https://acme.com/a/"), "https://acme.com/a");
  assert.equal(slashTwin("https://acme.com/"), "https://acme.com/");
});

test("templates group pages by URL shape", () => {
  const urls = ["https://acme.com/", "https://acme.com/blog/how-to-a", "https://acme.com/blog/how-to-b", "https://acme.com/blog/c", "https://acme.com/products/123", "https://acme.com/pricing"];
  const t = templates(urls);
  assert.equal(t.get("https://acme.com/"), "/");
  assert.equal(t.get("https://acme.com/blog/c"), "/blog/*");
  assert.equal(t.get("https://acme.com/products/123"), "/products/*");
  assert.equal(templateName("/blog/*"), "Blog");
  assert.equal(templateName("/"), "Home");
});

const HTML = `<!doctype html><html lang="en"><head>
<title>Acme CRM for small teams</title>
<meta name="description" content="A CRM.">
<meta name="viewport" content="width=device-width">
<link rel="canonical" href="/crm">
<link rel="alternate" hreflang="en" href="https://acme.com/crm"><link rel="alternate" hreflang="en-UK" href="https://acme.com/uk/crm">
<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"Organization"},{"@type":"WebPage"}]}</script>
<script type="application/ld+json">{ broken </script>
<meta property="og:image" content="x.png">
</head><body>
<nav><a href="/">Home</a><a href="/about" rel="nofollow">About</a></nav>
<main><h1>CRM</h1><h3>Skipped</h3><p>${"word ".repeat(260)}</p>
<a href="/pricing?utm_source=nav">Pricing</a><a href="http://acme.com/old"></a><a href="https://other.com/x">Other</a>
<a href="/docs"><img src="/i.png"></a><img src="/j.png" alt=""><img src="http://cdn.com/k.png"></main>
<div class="cookie-banner">We use cookies ${"cookie ".repeat(80)}</div>
</body></html>`;

test("a page is read for every fact the checks need", () => {
  const f = readPage("https://acme.com/crm", HTML, { "x-robots-tag": "" }, { root: ROOT });
  assert.equal(f.title, "Acme CRM for small teams");
  assert.equal(f.canonical, "https://acme.com/crm");
  assert.equal(f.canonicalRaw, "/crm");
  assert.deepEqual(f.h1, ["CRM"]);
  assert.equal(f.headingSkip, true);
  assert.deepEqual(f.schema, ["Organization", "WebPage"]);
  assert.equal(f.schemaInvalid, 1);
  assert.equal(f.hreflang.length, 2);
  assert.equal(f.nofollowInternal, 1);
  assert.equal(f.emptyAnchors, 2); // the bare http link and the linked image without alt
  assert.equal(f.imageLinksNoAlt, 1);
  assert.equal(f.httpLinks, 1);
  assert.equal(f.mixedContent, 1);
  assert.equal(f.imagesNoAlt, 2); // /i.png and the http image; alt="" counts as described
  assert.ok(f.internal.some((l) => l.url === "https://acme.com/pricing"));
  assert.equal(f.external.length, 1);
  // The cookie banner and menu don't count as main text.
  assert.ok(f.words >= 260 && f.words < 275, String(f.words));
  assert.equal(f.shell, false);
  assert.equal(readPage("https://acme.com/a", "<html><body><div id=root></div><script src=app.js></script></body></html>", {}, { root: ROOT }).shell, true);
  assert.equal(readPage("https://acme.com/a", "<html><head><meta name=robots content='NOINDEX, follow'></head><body></body></html>", {}, { root: ROOT }).noindex, true);
  assert.equal(readPage("https://acme.com/a", "<html><body></body></html>", { "x-robots-tag": "noindex" }, { root: ROOT }).noindex, true);
  assert.equal(refreshTarget("0; url=/new", "https://acme.com/old"), "https://acme.com/new");
});

const facts = (over: Partial<NonNullable<CheckPage["facts"]>> = {}): NonNullable<CheckPage["facts"]> => {
  const { internal, external, ...rest } = readPage("https://acme.com/x", HTML, {}, { root: ROOT });
  void internal;
  void external;
  return { ...rest, canonical: null, canonicalRaw: null, canonicals: 0, schemaInvalid: 0, headingSkip: false, emptyAnchors: 0, nofollowInternal: 0, httpLinks: 0, mixedContent: 0, imageLinksNoAlt: 0, imagesNoAlt: 0, hreflang: [], ...over };
};
const page = (url: string, over: Partial<CheckPage> = {}, f: Partial<NonNullable<CheckPage["facts"]>> = {}): CheckPage => ({ url, final: url, status: 200, hops: 0, loop: false, chainEnd: 200, ms: 200, bytes: 20_000, compressed: true, depth: 1, inSitemap: true, linksIn: 3, facts: facts({ title: `Title for ${url} page`, description: `About ${url}`, textHash: url, canonical: url, canonicalRaw: url, canonicals: 1, ...f }), ...over });
const site = (over: Partial<SiteFacts> = {}): SiteFacts => ({
  home: "https://acme.com/",
  robots: { status: 200, sitemaps: 1, blockedSearch: [], blockedTraining: [], disallowedSitemapUrls: [] },
  sitemaps: { found: 1, urls: 10, bad: [], tooBig: [] },
  hosts: { httpLive: false, otherHostLive: false, hsts: true },
  llmsTxt: true,
  infinite: [],
  links: { broken: [], brokenCount: 0, external: [], externalCount: 0, toRedirect: [], toRedirectCount: 0 },
  statusOf: {},
  ...over,
});
const ids = (pages: CheckPage[], s = site()) => runChecks(pages, s).map((i) => i.id);

test("a clean site has no issues and scores 100", () => {
  const pages = [page("https://acme.com/", { depth: 0 }), page("https://acme.com/a"), page("https://acme.com/b")];
  const issues = runChecks(pages, site());
  assert.deepEqual(issues.map((i) => i.id), []);
  assert.equal(score(issues, pages.length), 100);
});

test("indexability: noindex on sitemap pages is an error, elsewhere a notice; canonicals are judged by their target", () => {
  const pages = [
    page("https://acme.com/", { depth: 0 }),
    page("https://acme.com/p1", {}, { noindex: true }),
    page("https://acme.com/hidden", { inSitemap: false, linksIn: 1 }, { noindex: true }),
    page("https://acme.com/c", {}, { canonical: "https://acme.com/gone" }),
    page("https://acme.com/c2", {}, { canonical: "https://acme.com/a", canonicalRaw: "/a" }),
  ];
  const got = ids(pages, site({ statusOf: { "https://acme.com/gone": 404, "https://acme.com/a": 200 } }));
  assert.ok(got.includes("noindex_important"));
  assert.ok(got.includes("noindex"));
  assert.ok(got.includes("canonical_to_error"));
  assert.ok(got.includes("canonical_relative"));
  assert.ok(got.includes("canonical_elsewhere"));
  assert.ok(got.includes("sitemap_error_urls")); // the noindex and canonicalized pages are in the sitemap
  assert.equal(indexReason(pages[1]), "noindex");
  assert.equal(indexReason(pages[3]), "Canonical elsewhere");
});

test("unknown is never broken: a canonical to a page we didn't fetch isn't an error", () => {
  const got = ids([page("https://acme.com/", { depth: 0 }), page("https://acme.com/c", {}, { canonical: "https://acme.com/not-crawled" })]);
  assert.ok(!got.includes("canonical_to_error"));
});

test("redirects: chains, loops and redirects into errors are told apart", () => {
  const got = ids([page("https://acme.com/", { depth: 0 }), page("https://acme.com/r1", { status: 301, hops: 2, chainEnd: 200, facts: null }), page("https://acme.com/r2", { status: 301, hops: 3, loop: true, chainEnd: 301, facts: null }), page("https://acme.com/r3", { status: 302, hops: 1, chainEnd: 404, facts: null })]);
  assert.ok(got.includes("redirect_chain"));
  assert.ok(got.includes("redirect_loop"));
  assert.ok(got.includes("redirect_to_error"));
});

test("duplicates: same text, same titles, slash twins and parameter copies", () => {
  const got = ids([
    page("https://acme.com/", { depth: 0 }),
    page("https://acme.com/a", {}, { textHash: "same", title: "Same title here please", description: "d1" }),
    page("https://acme.com/b", {}, { textHash: "same", title: "Same title here please", description: "d2" }),
    page("https://acme.com/c/"),
    page("https://acme.com/c"),
    page("https://acme.com/list?sort=new", {}, { textHash: "list" }),
    page("https://acme.com/list", {}, { textHash: "list" }),
    page("https://acme.com/cal?d=1", {}, { textHash: "d1" }),
    page("https://acme.com/cal?d=2", {}, { textHash: "d2" }),
  ]);
  for (const id of ["duplicate_content", "duplicate_title", "trailing_slash_dupes", "parameter_dupes"]) assert.ok(got.includes(id), id);
  const issues = runChecks([page("https://acme.com/", { depth: 0 }), page("https://acme.com/list?sort=new", {}, { textHash: "list" }), page("https://acme.com/list", {}, { textHash: "list2" }), page("https://acme.com/cal?d=1", {}, { textHash: "d1" }), page("https://acme.com/cal?d=2", {}, { textHash: "d2" })], site());
  // Different pages that happen to use parameters (a calendar) aren't duplicates.
  assert.equal(issues.find((i) => i.id === "parameter_dupes"), undefined);
  assert.ok(!got.includes("duplicate_description"));
});

test("site-wide issues: robots, sitemaps, hosts, AI bots and llms.txt", () => {
  const got = ids([page("https://acme.com/", { depth: 0 })], site({ robots: { status: 503, sitemaps: 0, blockedSearch: ["OAI-SearchBot"], blockedTraining: ["GPTBot"], disallowedSitemapUrls: ["https://acme.com/x"] }, sitemaps: { found: 0, urls: 0, bad: [], tooBig: [] }, hosts: { httpLive: true, otherHostLive: true, hsts: false }, llmsTxt: false }));
  for (const id of ["robots_error", "robots_blocks_important", "sitemap_missing", "http_and_https", "www_and_bare", "no_hsts", "ai_bots_blocked", "ai_training_blocked", "no_llms_txt"]) assert.ok(got.includes(id), id);
  const issues = runChecks([page("https://acme.com/", { depth: 0 })], site({ robots: { status: 200, sitemaps: 1, blockedSearch: ["OAI-SearchBot", "PerplexityBot"], blockedTraining: [], disallowedSitemapUrls: [] } }));
  assert.equal(issues.find((i) => i.id === "ai_bots_blocked")?.title, "robots.txt blocks OAI-SearchBot, PerplexityBot");
});

test("hreflang: bad codes, missing return links, no self and no x-default", () => {
  assert.ok(validHreflang("en-GB") && validHreflang("x-default") && validHreflang("zh-Hant-TW") && validHreflang("es-419"));
  assert.ok(!validHreflang("en_GB") && !validHreflang("english"));
  const got = ids([
    page("https://acme.com/", { depth: 0 }),
    page("https://acme.com/en", {}, { hreflang: [{ lang: "en", url: "https://acme.com/en" }, { lang: "de", url: "https://acme.com/de" }, { lang: "english", url: "https://acme.com/x" }] }),
    page("https://acme.com/de", {}, { hreflang: [{ lang: "en", url: "https://acme.com/fr" }] }),
  ]);
  for (const id of ["hreflang_bad_code", "hreflang_no_return", "hreflang_no_self", "hreflang_no_xdefault"]) assert.ok(got.includes(id), id);
});

test("links are counted once per page, and only links to fetched pages can be broken", () => {
  const t = new LinkTally();
  for (const [u, s] of [["https://acme.com/", 200], ["https://acme.com/a", 200], ["https://acme.com/gone", 404], ["https://acme.com/moved", 301]] as const) t.page(u, s);
  t.links("https://acme.com/", ["https://acme.com/a", "https://acme.com/a", "https://acme.com/gone", "https://acme.com/moved", "https://acme.com/never-fetched"]);
  t.links("https://acme.com/a", ["https://acme.com/", "https://acme.com/gone"]);
  assert.equal(t.inOf("https://acme.com/a"), 1);
  assert.equal(t.brokenCount, 2);
  assert.equal(t.toRedirectCount, 1);
  const d = t.depth(["https://acme.com/"]);
  assert.equal(d.get("https://acme.com/a"), 1);
  assert.equal(d.get("https://acme.com/never-fetched"), undefined);
});

test("the summary scores each area and counts the charts", () => {
  const pages = [page("https://acme.com/", { depth: 0 }), page("https://acme.com/blog/how-to-a", { depth: 5 }, { title: "" }), page("https://acme.com/blog/how-to-b"), page("https://acme.com/blog/how-to-c", { status: 404, facts: null })];
  const s = summarize(pages, site());
  assert.ok(s.areas.content < 100);
  assert.equal(s.areas.intl, 100);
  assert.equal(s.stats.statuses.client, 1);
  assert.equal(s.stats.depth[5], 1);
  assert.ok(s.stats.templates.some((t) => t.pattern === "/blog/*" && t.pages === 3));
  assert.ok(s.perPage.get("https://acme.com/blog/how-to-a")?.includes("missing_title"));
});

test("sitemaps: indexes, url sets, CDATA and bad XML", () => {
  assert.deepEqual(parseSitemap(`<?xml version="1.0"?><sitemapindex><sitemap><loc>https://acme.com/s1.xml</loc></sitemap></sitemapindex>`), { kind: "index", locs: ["https://acme.com/s1.xml"] });
  assert.deepEqual(parseSitemap(`<urlset><url><loc><![CDATA[https://acme.com/a?x=1&amp;y=2]]></loc></url></urlset>`).locs, ["https://acme.com/a?x=1&y=2"]);
  assert.equal(parseSitemap("<html>not a sitemap</html>").kind, "bad");
  assert.deepEqual(robotsSitemaps("User-agent: *\nSitemap: https://acme.com/sitemap.xml\nsitemap:https://acme.com/news.xml"), ["https://acme.com/sitemap.xml", "https://acme.com/news.xml"]);
});

test("crawl settings stay inside the plan, and include and exclude rules work", () => {
  assert.equal(cleanSettings({ limit: 999_999, speed: 50 }, "foundation").limit, 2000);
  assert.equal(cleanSettings({}, "scale").limit, pageLimit("scale"));
  assert.equal(cleanSettings({ speed: 0 }, "scale").speed, 4);
  assert.ok(passesRules("https://acme.com/blog/x", { include: ["/blog/"], exclude: [] }));
  assert.ok(!passesRules("https://acme.com/tag/x", { include: [], exclude: ["/tag/"] }));
  assert.ok(passesRules("https://acme.com/p/12", { include: ["/\\/p\\/\\d+/"], exclude: [] }));
});

test("a long crawl that keeps reporting progress isn't stuck; one that goes quiet for 20 minutes is", () => {
  const now = Date.parse("2026-11-10T12:00:00Z");
  assert.equal(isStuck({ status: "running", created_at: "2026-11-10T09:00:00Z", heartbeat_at: "2026-11-10T11:55:00Z" }, now), false);
  assert.equal(isStuck({ status: "running", created_at: "2026-11-10T11:00:00Z", heartbeat_at: "2026-11-10T11:35:00Z" }, now), true);
  assert.equal(isStuck({ status: "running", created_at: "2026-11-10T11:00:00Z" }, now), true);
});

test("with Search Console and Chrome UX Report data, the Google checks run and issues carry their clicks", () => {
  const pages = [page("https://acme.com/", { depth: 0 }), page("https://acme.com/a"), page("https://acme.com/b/"), page("https://acme.com/c")];
  const issues = runChecks(pages, site({
    sitemapPaths: ["https://acme.com/sitemap.xml", "https://acme.com/news.xml"],
    google: {
      clicks: { "https://acme.com/a": 40, "https://acme.com/b": 10 },
      inspections: { "https://acme.com/a": { coverage: "Crawled - currently not indexed", otherCanonical: false, richErrors: 0 }, "https://acme.com/b": { coverage: "Submitted and indexed", otherCanonical: true, richErrors: 2 } },
      gscSitemaps: ["https://acme.com/sitemap.xml"],
      gscSitemapErrors: [],
      originPass: false,
      vitals: { "https://www.acme.com/c": { lcp: 5200, inp: 120, cls: 0.3 } },
    },
  }));
  const got = (id: string) => issues.find((i) => i.id === id);
  assert.deepEqual(got("not_indexed_valuable")?.pages, ["https://acme.com/a"]);
  // Google and the crawl may differ by a trailing slash or www.
  assert.deepEqual(got("google_other_canonical")?.pages, ["https://acme.com/b/"]);
  assert.equal(got("rich_result_errors")?.count, 1);
  assert.deepEqual(got("sitemap_not_submitted")?.pages, ["https://acme.com/news.xml"]);
  assert.ok(got("cwv_fail_origin"));
  assert.deepEqual(got("lcp_poor")?.pages, ["https://acme.com/c"]);
  assert.ok(got("cls_poor") && !got("inp_poor"));
  assert.equal(got("not_indexed_valuable")?.clicks, 40);
  // Without Google data, none of these run.
  assert.ok(!runChecks(pages, site()).some((i) => ["not_indexed_valuable", "cwv_fail_origin", "sitemap_not_submitted"].includes(i.id)));
});

test("rendering checks compare the raw HTML with what Chromium saw", async () => {
  const { renderedFacts, rawShare } = await import("../src/lib/tech/render.ts");
  const raw = readPage("https://acme.com/p", "<html><head><title>Pricing</title><link rel=canonical href=https://acme.com/p></head><body><main><p>Plans below.</p></main></body></html>", {}, { root: ROOT });
  const r = renderedFacts(
    "https://acme.com/p",
    `<html><head><title>Pricing</title><meta name=description content="Plans"><link rel=canonical href=https://acme.com/other><script type="application/ld+json">{"@type":"Product"}</script></head><body><main><h1>Plans</h1><p>${"word ".repeat(300)}</p>${Array.from({ length: 6 }, (_, i) => `<a href="/plan/${i}">P${i}</a>`).join("")}</main></body></html>`,
    raw.internal.map((l) => l.url),
    { status: 200, final: "https://acme.com/p", timeout: false, errors: ["TypeError: x is undefined"], failed: [{ url: "https://acme.com/api/plans", type: "fetch", reason: "net::ERR_FAILED" }, { url: "https://acme.com/i.png", type: "image", reason: "x" }], resources: ["https://acme.com/assets/app.js"] },
    { root: ROOT },
  );
  assert.equal(r.onlyRendered.length, 6);
  assert.equal(r.failed.length, 1); // images don't count
  assert.equal(rawShare(raw.words, r), 1);
  const p = page("https://acme.com/p", {}, { ...raw, canonical: "https://acme.com/p" });
  p.rendered = r;
  const issues = runChecks([page("https://acme.com/", { depth: 0 }), p], site({ robotsAllowsGoogle: (u) => !u.includes("/assets/") }));
  const ids = issues.map((i) => i.id);
  for (const id of ["js_most_content", "js_canonical_changed", "js_title_meta", "js_links_only", "js_schema_only", "render_failed_requests", "robots_blocks_resources", "render_errors"]) assert.ok(ids.includes(id), id);
  assert.ok(!ids.includes("js_main_content") && !ids.includes("js_robots_changed") && !ids.includes("render_timeout"));
  // A page that rendered the same as its HTML has no rendering issues.
  const same = page("https://acme.com/s");
  same.rendered = { ...r, words: same.facts!.words, onlyRendered: [], schema: same.facts!.schema, canonical: same.facts!.canonical, failed: [], errors: 0, resources: [], description: same.facts!.description, h1: same.facts!.h1, title: same.facts!.title, noindex: false };
  assert.deepEqual(runChecks([page("https://acme.com/", { depth: 0 }), same], site()).filter((i) => i.area === "render").map((i) => i.id), []);
});

test("internal link score: the home page leads, a page nobody links to is lowest", () => {
  const t = new LinkTally();
  const urls = ["https://acme.com/", "https://acme.com/a", "https://acme.com/b", "https://acme.com/c", "https://acme.com/lonely"];
  for (const u of urls) t.page(u, 200);
  t.links("https://acme.com/", ["https://acme.com/a", "https://acme.com/b", "https://acme.com/c"]);
  t.links("https://acme.com/a", ["https://acme.com/", "https://acme.com/b"]);
  t.links("https://acme.com/b", ["https://acme.com/"]);
  t.links("https://acme.com/c", ["https://acme.com/"]);
  const r = t.rank();
  assert.equal(r.get("https://acme.com/"), 10);
  assert.equal(r.get("https://acme.com/lonely"), 0);
  assert.ok(r.get("https://acme.com/b")! > r.get("https://acme.com/c")!);
});

test("site structure: folders, weak pages and link suggestions", async () => {
  const { folders, weakPages, suggestLinks, anchorFor, topicWords } = await import("../src/lib/tech/structure.ts");
  const sp = (url: string, over = {}) => ({ url, depth: 2, linksIn: 5, rank: 5, status: 200, indexable: true, clicks: 0, ...over });
  const f = folders([sp("https://acme.com/"), sp("https://acme.com/blog/a", { depth: 3 }), sp("https://acme.com/blog/b", { depth: 5, clicks: 40 }), sp("https://acme.com/pricing")]);
  assert.deepEqual(f.map((x) => [x.folder, x.pages]), [["/", 2], ["/blog", 2]]);
  assert.equal(f.find((x) => x.folder === "/blog")?.depth, 4);
  const weak = weakPages([sp("https://acme.com/x", { clicks: 90, rank: 1.2 }), sp("https://acme.com/y", { clicks: 10, depth: 5 }), sp("https://acme.com/z", { clicks: 300 }), sp("https://acme.com/n", { clicks: 0, rank: 0.1 })]);
  assert.deepEqual(weak.map((p) => p.url), ["https://acme.com/x", "https://acme.com/y"]);
  assert.deepEqual([...topicWords("The best AI search tools for agencies")], ["search", "tool", "agencie"]);
  const s = suggestLinks(
    { url: "https://acme.com/geo", title: "Generative engine optimization guide | Acme", h1: "Generative engine optimization" },
    [
      { url: "https://acme.com/a", title: "Engine optimization for AI answers", h1: "", rank: 6, links: [] },
      { url: "https://acme.com/b", title: "Generative engine optimization tips", h1: "", rank: 2, links: ["https://acme.com/geo"] },
      { url: "https://acme.com/c", title: "Pricing", h1: "", rank: 9, links: [] },
      { url: "https://acme.com/d", title: "Generative engine optimization checklist", h1: "", rank: 3, links: [] },
    ],
  );
  assert.deepEqual(s.map((x) => x.from), ["https://acme.com/d", "https://acme.com/a"]);
  assert.equal(anchorFor({ title: "GEO guide | Acme", h1: "" }), "GEO guide");
});
