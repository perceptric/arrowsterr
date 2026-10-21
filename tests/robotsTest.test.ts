import assert from "node:assert/strict";
import { test } from "node:test";
import { parseRobots, pathOf, robotsAllows, robotsStatus } from "../src/lib/robotsTest.ts";

// Cases follow RFC 9309 and Google's open-source robots.txt parser tests (github.com/google/robotstxt).
const allows = (text: string, agent: string, path: string) => robotsAllows(parseRobots(text), agent, path).allowed;

test("the longest matching rule wins, and Allow wins a tie", () => {
  assert.equal(allows("user-agent: FooBot\ndisallow: /\nallow: /\n", "FooBot", "/x/page.html"), true);
  assert.equal(allows("user-agent: FooBot\ndisallow: /x/page.html\nallow: /x/\n", "FooBot", "/x/page.html"), false);
  assert.equal(allows("user-agent: FooBot\nallow: /page\ndisallow: /*.html\n", "FooBot", "/page.html"), false);
  assert.equal(allows("user-agent: FooBot\nallow: /page\ndisallow: /*.html\n", "FooBot", "/page"), true);
  assert.equal(allows("user-agent: FooBot\nallow: /x/page.\ndisallow: /*.html\n", "FooBot", "/x/page.html"), true);
  assert.equal(allows("user-agent: FooBot\nallow: /folder\ndisallow: /folder/\n", "FooBot", "/folder/page"), false);
});

test("the decision names its line, so the page can point at it", () => {
  const r = robotsAllows(parseRobots("# top\nUser-agent: *\nAllow: /blog/\nDisallow: /\n"), "Bingbot", "/pricing");
  assert.equal(r.allowed, false);
  assert.equal(r.rule?.line, 4);
  assert.equal(r.rule?.text, "Disallow: /");
  assert.equal(r.group, "*");
});

test("user agents match without case or version, and a crawler's own groups merge and beat *", () => {
  const text = "User-agent: *\nDisallow: /\n\nUser-agent: googlebot/2.1\nDisallow: /private/\n\nUser-agent: GOOGLEBOT\nDisallow: /tmp/\n";
  assert.equal(allows(text, "Googlebot", "/"), true);
  assert.equal(allows(text, "Googlebot", "/private/a"), false);
  assert.equal(allows(text, "Googlebot", "/tmp/a"), false);
  assert.equal(allows(text, "Bingbot", "/"), false);
});

test("Google's special crawlers fall back to Googlebot's group before *", () => {
  const text = "User-agent: *\nDisallow: /\n\nUser-agent: Googlebot\nAllow: /\n";
  assert.equal(allows(text, "Googlebot-Image", "/a.png"), true);
  assert.equal(robotsAllows(parseRobots(text), "Googlebot-Image", "/a.png").group, "googlebot");
  assert.equal(allows(text + "\nUser-agent: Googlebot-Image\nDisallow: /\n", "Googlebot-Image", "/a.png"), false);
});

test("* and $ work, paths are case-sensitive, and query strings count", () => {
  const text = "User-agent: *\nDisallow: /*.pdf$\nDisallow: /search?\nDisallow: /X/\n";
  assert.equal(allows(text, "Googlebot", "/files/a.pdf"), false);
  assert.equal(allows(text, "Googlebot", "/files/a.pdf?v=2"), true);
  assert.equal(allows(text, "Googlebot", "/search?q=shoes"), false);
  assert.equal(allows(text, "Googlebot", "/search"), true);
  assert.equal(allows(text, "Googlebot", "/x/"), true);
});

test("encoded and plain paths match each other", () => {
  assert.equal(allows("User-agent: *\nDisallow: /foo/bar/ツ\n", "Googlebot", "/foo/bar/%E3%83%84"), false);
  assert.equal(allows("User-agent: *\nDisallow: /foo/bar/%E3%83%84\n", "Googlebot", "/foo/bar/ツ"), false);
});

test("rules before any user-agent, empty Disallow and robots.txt itself", () => {
  const p = parseRobots("Disallow: /\nUser-agent: *\nDisallow:\n");
  assert.equal(robotsAllows(p, "Googlebot", "/anything").allowed, true);
  assert.equal(p.warnings.find((w) => w.line === 1)?.level, "warn");
  assert.equal(allows("User-agent: *\nDisallow: /\n", "Googlebot", "/robots.txt"), true);
  assert.equal(allows("", "Googlebot", "/x"), true);
});

test("warnings: a site-wide block, lines Google ignores, odd sitemaps and big files", () => {
  const p = parseRobots("User-agent: *\nCrawl-delay: 10\nNoindex: /a\nDisallow: /\nSitemap: /sitemap.xml\nSitemap: https://acme.com/s.xml\nFoo bar\n");
  const at = (line: number) => p.warnings.find((w) => w.line === line);
  assert.equal(at(2)?.level, "info");
  assert.match(at(3)!.message, /noindex/);
  assert.equal(at(4)?.level, "high");
  assert.match(at(5)!.message, /full address/);
  assert.match(at(7)!.message, /colon/);
  assert.deepEqual(p.sitemaps, [{ url: "https://acme.com/s.xml", line: 6 }]);
  const big = parseRobots("User-agent: *\n" + "Disallow: /a\n".repeat(50_000) + "Disallow: /late\n");
  assert.equal(big.warnings[0].level, "high");
  assert.equal(robotsAllows(big, "Googlebot", "/late").allowed, true, "rules past 500 KiB are ignored");
});

test("what the robots.txt answer itself means, and paths from what people type", () => {
  assert.equal(robotsStatus(200), "rules");
  assert.equal(robotsStatus(404), "allow-all");
  assert.equal(robotsStatus(503), "block-all");
  assert.equal(robotsStatus(0), "block-all");
  assert.equal(pathOf("https://acme.com/a/b?x=1#top"), "/a/b?x=1");
  assert.equal(pathOf("blog/post"), "/blog/post");
  assert.equal(pathOf(""), "/");
});
