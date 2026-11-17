import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { BOTS, buildReport, chunks, cloudflareQuery, cloudflareWindow, dayList, fromCloudflare, fromConnector, matchBot, mergeRows, normPath } from "../src/lib/aiCrawlers.ts";

// Real user agents, as the bots send them.
const UA: Record<string, string> = {
  gptbot: "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; GPTBot/1.2; +https://openai.com/gptbot",
  "oai-searchbot": "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; OAI-SearchBot/1.0; +https://openai.com/searchbot",
  "chatgpt-user": "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; ChatGPT-User/1.0; +https://openai.com/bot",
  claudebot: "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ClaudeBot/1.0; +claudebot@anthropic.com)",
  "claude-user": "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Claude-User/1.0; +Claude-User@anthropic.com)",
  "claude-searchbot": "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Claude-SearchBot/1.0; +Claude-SearchBot@anthropic.com)",
  perplexitybot: "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)",
  "perplexity-user": "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Perplexity-User/1.0; +https://perplexity.ai/perplexity-user)",
  googlebot: "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Googlebot/2.1; +http://www.google.com/bot.html) Chrome/131.0.6778.204 Safari/537.36",
  bingbot: "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm) Chrome/116.0.1938.76 Safari/537.36",
  applebot: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15 (Applebot/0.1; +http://www.apple.com/go/applebot)",
  "meta-externalagent": "meta-externalagent/1.1 (+https://developers.facebook.com/docs/sharing/webmasters/crawler)",
  bytespider: "Mozilla/5.0 (Linux; Android 5.0) AppleWebKit/537.36 (KHTML, like Gecko) Mobile Safari/537.36 (compatible; Bytespider; spider-feedback@bytedance.com)",
  ccbot: "CCBot/2.0 (https://commoncrawl.org/faq/)",
  amazonbot: "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Amazonbot/0.1; +https://developer.amazon.com/support/amazonbot) Chrome/119.0.6045.214 Safari/537.36",
  duckassistbot: "DuckAssistBot/1.2; (+http://duckduckgo.com/duckassistbot.html)",
};

test("matchBot: every listed bot is found by its real user agent", () => {
  for (const b of BOTS) assert.equal(matchBot(UA[b.id])?.id, b.id, b.id);
  assert.equal(Object.keys(UA).length, BOTS.length);
});

test("matchBot: people, other bots and robots-only words are not matched", () => {
  assert.equal(matchBot("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36"), null);
  assert.equal(matchBot("Mozilla/5.0 (compatible; AhrefsBot/7.0; +http://ahrefs.com/robot/)"), null);
  assert.equal(matchBot("Google-Extended"), null);
  assert.equal(matchBot(""), null);
  assert.equal(matchBot(null), null);
  // Without case, like the plugin's stripos.
  assert.equal(matchBot("gptbot/1.0")?.id, "gptbot");
});

test("BOTS matches the WordPress plugin's list, in the same order", () => {
  const php = readFileSync(new URL("../wp-plugin/arrowsterr-connector/arrowsterr-connector.php", import.meta.url), "utf8");
  const body = php.slice(php.indexOf("function arrowsterr_crawler_bots()"), php.indexOf("function arrowsterr_crawler_of("));
  const pairs = [...body.matchAll(/'([a-z-]+)'\s*=>\s*'([^']+)'/g)].map((m) => [m[1], m[2]]);
  assert.deepEqual(pairs, BOTS.map((b) => [b.id, b.token]));
  // Both read the version from the same place.
  assert.match(php, /Version:\s+1\.3\.0/);
  assert.match(php, /ARROWSTERR_CONNECTOR_VERSION', '1\.3\.0'/);
});

test("normPath: one form for the same page", () => {
  assert.equal(normPath("/blog/post/?utm_source=x#top"), "/blog/post");
  assert.equal(normPath("https://example.com/a/b/"), "/a/b");
  assert.equal(normPath(""), "/");
  assert.equal(normPath("/"), "/");
  assert.equal(normPath("pricing"), "/pricing");
  assert.equal(normPath("//double//slash/"), "/double/slash");
  assert.equal(normPath("/caf%C3%A9"), "/café");
});

test("mergeRows: adds up repeats and drops unknown bots and bad days", () => {
  const out = mergeRows([
    { day: "2026-11-01", bot: "gptbot", path: "/a/", hits: 2 },
    { day: "2026-11-01", bot: "gptbot", path: "/a?x=1", hits: 3 },
    { day: "2026-11-01", bot: "nobot", path: "/a", hits: 9 },
    { day: "yesterday", bot: "gptbot", path: "/a", hits: 9 },
    { day: "2026-11-01", bot: "claudebot", path: "/a", hits: 0 },
  ]);
  assert.deepEqual(out, [{ day: "2026-11-01", bot: "gptbot", path: "/a", hits: 5 }]);
});

test("buildReport: bots, top pages and skipped key pages", () => {
  const rows = [
    { day: "2026-11-10", bot: "gptbot", path: "/", hits: 4 },
    { day: "2026-11-11", bot: "gptbot", path: "/pricing", hits: 2 },
    { day: "2026-11-11", bot: "claudebot", path: "/pricing", hits: 1 },
    { day: "2026-11-11", bot: "googlebot", path: "/features", hits: 50 },
    { day: "2026-11-11", bot: "perplexitybot", path: "/logo.png", hits: 7 },
    { day: "2026-10-01", bot: "gptbot", path: "/old", hits: 99 },
  ];
  const r = buildReport(rows, ["/", "/pricing/", "/features", "/about"], "2026-11-10", "2026-11-12");
  assert.equal(r.total, 57);
  assert.deepEqual(r.bots.map((b) => [b.id, b.hits, b.pages, b.last]), [["googlebot", 50, 1, "2026-11-11"], ["gptbot", 6, 2, "2026-11-11"], ["claudebot", 1, 1, "2026-11-11"]]);
  assert.deepEqual(r.bots[1].days, [{ day: "2026-11-10", hits: 4 }, { day: "2026-11-11", hits: 2 }, { day: "2026-11-12", hits: 0 }]);
  assert.deepEqual(r.pages.map((p) => [p.path, p.hits]), [["/features", 50], ["/", 4], ["/pricing", 3]]);
  assert.deepEqual(r.pages[2].bots, [{ id: "gptbot", hits: 2 }, { id: "claudebot", hits: 1 }]);
  // Googlebot alone doesn't count as an AI read.
  assert.deepEqual(r.skipped, ["/features", "/about"]);
  assert.equal(r.skippedCount, 2);
  assert.equal(r.checkedPages, 4);
});

test("dayList and chunks split a period", () => {
  assert.deepEqual(dayList("2026-10-30", "2026-11-02"), ["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02"]);
  assert.deepEqual(chunks(dayList("2026-11-01", "2026-11-05"), 2), [
    { from: "2026-11-01", to: "2026-11-02" },
    { from: "2026-11-03", to: "2026-11-04" },
    { from: "2026-11-05", to: "2026-11-05" },
  ]);
  assert.equal(chunks(["2026-11-01"], 0).length, 1);
});

test("Cloudflare: the query names every bot, and the answer becomes rows", () => {
  const parts = [{ from: "2026-11-01", to: "2026-11-01" }, { from: "2026-11-02", to: "2026-11-02" }];
  const q = cloudflareQuery(parts, 1000);
  for (const b of BOTS) assert.ok(q.includes(`%${b.token}%`), b.token);
  assert.match(q, /p1: httpRequestsAdaptiveGroups\(limit: 1000/);
  assert.match(q, /datetime_lt: "2026-11-03T00:00:00Z"/);
  const answer = {
    viewer: {
      zones: [
        {
          p0: [
            { count: 5, dimensions: { date: "2026-11-01", userAgent: UA.gptbot, clientRequestPath: "/a/" } },
            { count: 2, dimensions: { userAgent: "Mozilla/5.0 Chrome", clientRequestPath: "/a" } },
          ],
          p1: [{ count: 3, dimensions: { date: "2026-11-02", userAgent: UA["claude-user"], clientRequestPath: "/b?q=1" } }],
        },
      ],
    },
  };
  assert.deepEqual(fromCloudflare(answer, parts), [
    { day: "2026-11-01", bot: "gptbot", path: "/a", hits: 5 },
    { day: "2026-11-02", bot: "claude-user", path: "/b", hits: 3 },
  ]);
  assert.deepEqual(fromCloudflare(null, parts), []);
});

test("cloudflareWindow: reads the zone's limits in days, with safe defaults", () => {
  const s = { viewer: { zones: [{ settings: { httpRequestsAdaptiveGroups: { enabled: true, maxDuration: 259200, notOlderThan: 2678400, maxPageSize: 10000 } } }] } };
  assert.deepEqual(cloudflareWindow(s), { enabled: true, back: 31, width: 3, pageSize: 10000 });
  assert.deepEqual(cloudflareWindow(null), { back: 7, width: 1, pageSize: 1000, enabled: true });
});

test("fromConnector: reads the plugin's rows and skips broken ones", () => {
  const out = fromConnector({ rows: [["2026-11-01", "gptbot", "/a/", "4"], ["2026-11-01", "gptbot", "/a", 1], ["bad"], ["2026-11-01", "unknown", "/a", 3]] });
  assert.deepEqual(out, [{ day: "2026-11-01", bot: "gptbot", path: "/a", hits: 5 }]);
  assert.deepEqual(fromConnector({}), []);
  assert.deepEqual(fromConnector(null), []);
});
