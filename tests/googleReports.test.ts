import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addSearch,
  addVisits,
  AI_CHANNEL,
  aiReferrals,
  byPath,
  cellMatches,
  citedPrompts,
  compareRange,
  contentStatus,
  decliningPages,
  countryCode,
  countryName,
  GA4_DIMS,
  GA4_PARTS,
  ga4Filter,
  ga4Requests,
  GSC_DIMS,
  gscBody,
  NO_SUMS,
  nvrLabel,
  rangeOf,
  readFilters,
  readRange,
  returningRate,
  searchDeclines,
  toCsv,
  trafficChannels,
  typedNumber,
  weekly,
  type Ga4Sums,
} from "../src/lib/googleReports.ts";

const sums = (sessions: number, keyEvents = 0): Ga4Sums => ({ ...NO_SUMS, sessions, users: sessions, keyEvents });

test("ranges end yesterday, and compare with the days before or the year before", () => {
  assert.deepEqual(rangeOf("28d", "2026-11-27"), { from: "2026-10-30", to: "2026-11-26" });
  assert.deepEqual(rangeOf("today", "2026-11-27"), { from: "2026-11-27", to: "2026-11-27" });
  assert.deepEqual(rangeOf("custom", "2026-11-27", { from: "2026-01-01", to: "2026-01-31" }), { from: "2026-01-01", to: "2026-01-31" });
  assert.deepEqual(compareRange({ from: "2026-10-30", to: "2026-11-26" }, "prev"), { from: "2026-10-02", to: "2026-10-29" });
  assert.deepEqual(compareRange({ from: "2024-02-01", to: "2024-02-29" }, "year"), { from: "2023-02-01", to: "2023-02-28" });
  assert.equal(compareRange({ from: "2026-10-30", to: "2026-11-26" }, "none"), null);
});

test("request bodies keep only allowed filters and sane dates", () => {
  const f = readFilters(
    [
      { dim: "page", op: "contains", value: " /blog/ " },
      { dim: "country", op: "contains", value: "usa" }, // countries take is / isn't only
      { dim: "nope", op: "equals", value: "x" },
      { dim: "query", op: "includingRegex", value: "" },
    ],
    GSC_DIMS,
  );
  assert.deepEqual(f, [{ dim: "page", op: "contains", value: "/blog/" }]);
  assert.equal(readFilters([{ dim: "landingPage", op: "includingRegex", value: "^/blog" }], GA4_DIMS).length, 1);
  assert.equal(readFilters([{ dim: "event", op: "includingRegex", value: "sign" }], GA4_DIMS).length, 0);
  assert.deepEqual(readRange({ from: "2026-11-01", to: "2026-11-26" }, "2026-11-27"), { from: "2026-11-01", to: "2026-11-26" });
  assert.equal(readRange({ from: "2026-11-26", to: "2026-11-01" }, "2026-11-27"), null);
  assert.equal(readRange({ from: "2026-11-01", to: "2026-11-30" }, "2026-11-27"), null);
  assert.equal(readRange({ from: "2020-01-01", to: "2026-11-26" }, "2026-11-27"), null);
});

test("Search Console filters become dimensionFilterGroups in Google's words", () => {
  const body = gscBody({
    range: { from: "2026-08-29", to: "2026-11-26" },
    type: "image",
    dims: ["query"],
    rowLimit: 1000,
    filters: [
      { dim: "page", op: "contains", value: "/blog/" },
      { dim: "query", op: "excludingRegex", value: "^brand" },
      { dim: "country", op: "equals", value: "United States" },
      { dim: "device", op: "notEquals", value: "Mobile" },
      { dim: "searchAppearance", op: "equals", value: "Faq rich result" },
    ],
  });
  assert.deepEqual(body, {
    startDate: "2026-08-29",
    endDate: "2026-11-26",
    dimensions: ["query"],
    type: "image",
    rowLimit: 1000,
    dataState: "all",
    dimensionFilterGroups: [
      {
        groupType: "and",
        filters: [
          { dimension: "page", operator: "contains", expression: "/blog/" },
          { dimension: "query", operator: "excludingRegex", expression: "^brand" },
          { dimension: "country", operator: "equals", expression: "usa" },
          { dimension: "device", operator: "notEquals", expression: "MOBILE" },
          { dimension: "searchAppearance", operator: "equals", expression: "FAQ_RICH_RESULT" },
        ],
      },
    ],
  });
  const hourly = gscBody({ range: { from: "2026-11-24", to: "2026-11-27" }, type: "web", dims: ["hour"], filters: [] });
  assert.equal(hourly.dataState, "hourly_all");
  assert.equal("dimensionFilterGroups" in hourly, false);
});

test("country codes and names go both ways", () => {
  assert.equal(countryName("usa"), "United States");
  assert.equal(countryName("gbr"), "United Kingdom");
  assert.equal(countryCode("united kingdom"), "gbr");
  assert.equal(countryCode("SG"), "sgp");
  assert.equal(countryCode("aus"), "aus");
  assert.equal(countryCode("Atlantis"), null);
});

test("GA4 filters become one dimensionFilter, with AI assistants as its own channel", () => {
  assert.equal(ga4Filter([]), undefined);
  assert.deepEqual(ga4Filter([{ dim: "landingPage", op: "contains", value: "/blog/" }]), {
    filter: { fieldName: "landingPage", stringFilter: { matchType: "CONTAINS", value: "/blog/", caseSensitive: false } },
  });
  const ai = ga4Filter([{ dim: "channel", op: "equals", value: AI_CHANNEL }]) as { filter: { fieldName: string; inListFilter: { values: string[] } } };
  assert.equal(ai.filter.fieldName, "sessionSource");
  assert.ok(ai.filter.inListFilter.values.includes("chatgpt.com") && ai.filter.inListFilter.values.includes("perplexity.ai"));
  const notAi = ga4Filter([{ dim: "channel", op: "notEquals", value: "AI assistants" }]) as { notExpression: unknown };
  assert.deepEqual(notAi.notExpression, ai);
  // Referral leaves the AI visits out, as the table shows it.
  const ref = ga4Filter([{ dim: "channel", op: "equals", value: "Referral" }]) as { andGroup: { expressions: unknown[] } };
  assert.equal(ref.andGroup.expressions.length, 2);
  assert.deepEqual(ref.andGroup.expressions[1], { notExpression: ai });
  const two = ga4Filter([
    { dim: "device", op: "equals", value: "mobile" },
    { dim: "event", op: "notContains", value: "test" },
  ]) as { andGroup: { expressions: unknown[] } };
  assert.deepEqual(two.andGroup.expressions[1], { notExpression: { filter: { fieldName: "eventName", stringFilter: { matchType: "CONTAINS", value: "test", caseSensitive: false } } } });
});

test("GA4 requests: two ranges for totals and events, by hour for today, filters on every part", () => {
  const filters = [{ dim: "country" as const, op: "equals" as const, value: "Singapore" }];
  const reqs = ga4Requests({ range: { from: "2026-10-30", to: "2026-11-26" }, prev: { from: "2026-10-02", to: "2026-10-29" }, filters, hourly: false });
  assert.equal(reqs.length, GA4_PARTS.length);
  const part = (k: (typeof GA4_PARTS)[number]) => reqs[GA4_PARTS.indexOf(k)];
  assert.equal(part("totals").dateRanges.length, 2);
  assert.equal(part("events").dateRanges.length, 2);
  assert.equal(part("landing").dateRanges.length, 2, "landing pages carry the period before, for Declining pages");
  assert.equal(part("aiPages").dateRanges.length, 2);
  assert.equal(part("countries").dateRanges.length, 1);
  assert.deepEqual(part("series").dimensions, [{ name: "date" }]);
  assert.deepEqual(part("nvr").dimensions, [{ name: "newVsReturning" }]);
  assert.deepEqual(part("totals").metrics.map((m) => m.name), ["totalUsers", "sessions", "engagedSessions", "userEngagementDuration", "activeUsers", "keyEvents", "newUsers"]);
  assert.ok(reqs.every((r) => r.dimensionFilter), "every part keeps the filters");
  const ai = part("ai").dimensionFilter as { andGroup: { expressions: unknown[] } };
  assert.equal(ai.andGroup.expressions.length, 2, "the AI part adds the AI hosts to the filters");
  const today = ga4Requests({ range: { from: "2026-11-27", to: "2026-11-27" }, prev: null, filters: [], hourly: true, keyMetric: "conversions" });
  assert.deepEqual(today[GA4_PARTS.indexOf("series")].dimensions, [{ name: "dateHour" }]);
  assert.equal(today[0].dateRanges.length, 1);
  assert.equal(today[0].metrics[5].name, "conversions");
  assert.equal("dimensionFilter" in today[0], false);
});

test("AI visits move out of the channel GA4 gave them into AI assistants, one row per assistant", () => {
  const rows = trafficChannels(
    [
      { channel: "Organic Search", sums: sums(800, 40) },
      { channel: "Referral", sums: sums(300, 6) },
      { channel: "Direct", sums: sums(200) },
      { channel: "Unassigned", sums: sums(5) },
    ],
    [
      { source: "chatgpt.com", channel: "Referral", sums: sums(150, 3) },
      { source: "perplexity.ai", channel: "Referral", sums: sums(60) },
      { source: "chat.openai.com", channel: "Direct", sums: sums(10) },
      { source: "gemini.google.com", channel: "Unassigned", sums: sums(5) },
      { source: "example.com", channel: "Referral", sums: sums(99) }, // not an AI host: ignored
    ],
  );
  assert.deepEqual(rows.map((r) => [r.key, r.sums.sessions]), [
    ["Organic Search", 800],
    [AI_CHANNEL, 225],
    ["Direct", 190],
    ["Referral", 90],
  ]);
  const ai = rows.find((r) => r.key === AI_CHANNEL)!;
  assert.deepEqual(ai.children!.map((c) => [c.key, c.sums.sessions]), [
    ["ChatGPT", 160],
    ["Perplexity", 60],
    ["Gemini", 5],
  ]);
  assert.equal(rows.find((r) => r.key === "Referral")!.sums.keyEvents, 3);
  assert.equal(rows.some((r) => r.key === "Unassigned"), false, "a channel left empty is dropped");
  assert.deepEqual(trafficChannels([{ channel: "Direct", sums: sums(10) }], []).map((r) => r.key), ["Direct"]);
});

test("Search Console URLs and GA4 paths join on one page path", () => {
  const search = byPath(
    [
      { path: "https://www.momos.com/Blog/NPS/", clicks: 10, impressions: 100, position: 4 },
      { path: "http://momos.com/blog/nps?utm=x", clicks: 5, impressions: 300, position: 8 },
      { path: "https://momos.com/", clicks: 1, impressions: 10, position: null },
    ],
    (r) => r.path,
    addSearch,
  );
  const nps = search.get("/blog/nps")!;
  assert.equal(nps.clicks, 15);
  assert.equal(nps.impressions, 400);
  assert.equal(nps.position, 7, "position is weighted by impressions");
  assert.equal(search.get("/")!.position, null);
  const visits = byPath(
    [
      { path: "/blog/nps", sessions: 30, keyEvents: 2 },
      { path: "/blog/nps/?ref=x", sessions: 10, keyEvents: 1 },
      { path: "(not set)", sessions: 4, keyEvents: 0 },
    ],
    (r) => r.path,
    addVisits,
  );
  assert.deepEqual(visits.get("/blog/nps"), { path: "/blog/nps", sessions: 40, keyEvents: 3 });
  assert.ok(visits.has("/"), "GA4's (not set) lands on the home page key, never a crash");
});

test("weeks fold seven days into one, and CSV quotes what it must", () => {
  const days = Array.from({ length: 9 }, (_, i) => ({ key: `2026-11-${String(i + 1).padStart(2, "0")}`, n: 1 }));
  assert.deepEqual(weekly(days, (a, b) => ({ ...a, n: a.n + b.n })), [
    { key: "2026-11-01", n: 7 },
    { key: "2026-11-08", n: 2 },
  ]);
  assert.equal(toCsv([["Query", "Clicks"], ['say "hi", now', 3], ["empty", null]]), 'Query,Clicks\n"say ""hi"", now",3\nempty,');
});

test("new and returning: GA4's values as labels, and the returning share of users", () => {
  assert.equal(nvrLabel("new"), "New");
  assert.equal(nvrLabel("returning"), "Returning");
  assert.equal(nvrLabel(""), "(not set)");
  assert.equal(returningRate({ ...NO_SUMS, users: 200, newUsers: 150 }), 0.25);
  assert.equal(returningRate(NO_SUMS), null);
});

test("AI referrals: sessions by assistant and page, the share of all sessions, and the period before", () => {
  const ai = aiReferrals(
    [
      { path: "https://momos.com/blog/a/", source: "chatgpt.com", period: "cur", sums: sums(30) },
      { path: "/blog/a", source: "perplexity.ai", period: "cur", sums: sums(10) },
      { path: "/pricing", source: "chatgpt.com", period: "cur", sums: sums(10) },
      { path: "/blog/a", source: "chatgpt.com", period: "prev", sums: sums(20) },
      { path: "/blog/a", source: "example.com", period: "cur", sums: sums(99) }, // not an AI host: ignored
    ],
    [
      { key: "2026-11-01", source: "chatgpt.com", sums: sums(25) },
      { key: "2026-11-01", source: "perplexity.ai", sums: sums(5) },
    ],
    1000,
    true,
  );
  assert.equal(ai.sums.sessions, 50);
  assert.equal(ai.share, 0.05);
  assert.equal(ai.prevSessions, 20);
  assert.deepEqual(ai.assistants, ["ChatGPT", "Perplexity"]);
  assert.deepEqual(ai.pages[0], { path: "/blog/a", sums: { ...NO_SUMS, sessions: 40, users: 40 }, prevSessions: 20, by: { ChatGPT: 30, Perplexity: 10 } });
  assert.deepEqual(ai.series, [{ key: "2026-11-01", by: { ChatGPT: 25, Perplexity: 5 } }]);
  assert.equal(aiReferrals([], [], 0, false).share, null);
});

test("cited prompts: the brand's own pages each answer cites, by path", () => {
  const map = citedPrompts(
    [
      { prompt: "best survey tools", sources: [{ url: "https://www.momos.com/blog/a?utm=x" }, { url: "https://other.com/blog/a" }] },
      { prompt: "qualtrics alternatives", sources: [{ url: "https://momos.com/blog/a/" }] },
      { prompt: "best survey tools", sources: [{ url: "https://momos.com/blog/a" }] },
      { prompt: "no sources" },
    ],
    "momos.com",
  );
  assert.deepEqual(map.get("/blog/a"), ["best survey tools", "qualtrics alternatives"]);
  assert.equal(map.size, 1);
});

test("declining pages: 10% or more lost from at least 10 sessions, most lost first", () => {
  const rows = decliningPages([
    { key: "/a", sums: sums(140), prev: sums(300) },
    { key: "/b", sums: sums(95), prev: sums(100) }, // lost 5%: kept out
    { key: "/c", sums: sums(2), prev: sums(8) }, // too small
    { key: "/d", sums: sums(40), prev: sums(80) },
    { key: "/e", sums: sums(50), prev: null }, // no period before
  ]);
  assert.deepEqual(
    rows.map((r) => r.path),
    ["/a", "/d"],
  );
  assert.equal(Math.round(rows[0].change * 100), -53);
});

test("search declines: clicks in both periods and the search that lost the most", () => {
  const [page] = searchDeclines(
    [
      { page: "https://momos.com/blog/nps", query: "nps survey questions", clicks: 10, impressions: 900, position: 11 },
      { page: "https://momos.com/blog/nps", query: "nps meaning", clicks: 30, impressions: 500, position: 3 },
    ],
    [
      { page: "https://momos.com/blog/nps/", query: "nps survey questions", clicks: 60, impressions: 1000, position: 4 },
      { page: "https://momos.com/blog/nps", query: "nps meaning", clicks: 28, impressions: 480, position: 3 },
    ],
  );
  assert.deepEqual(page, { path: "/blog/nps", clicks: 40, prevClicks: 88, query: "nps survey questions", from: 4, to: 11 });
});

test("content status: New under 14 days, then Growing or Declining on clicks, or sessions without clicks", () => {
  assert.equal(contentStatus({ days: 9, clicksBefore: 0, clicksAfter: 50, sessionsBefore: 0, sessionsAfter: 0 }), "New");
  assert.equal(contentStatus({ days: 28, clicksBefore: 40, clicksAfter: 90, sessionsBefore: 0, sessionsAfter: 0 }), "Growing");
  assert.equal(contentStatus({ days: 28, clicksBefore: 40, clicksAfter: 12, sessionsBefore: 0, sessionsAfter: 0 }), "Declining");
  assert.equal(contentStatus({ days: 20, clicksBefore: 0, clicksAfter: 0, sessionsBefore: 30, sessionsAfter: 10 }), "Declining");
});

test("table filters: words ignore case, numbers compare by size, shares typed as percents", () => {
  assert.equal(typedNumber("1,200"), 1200);
  assert.equal(typedNumber("−20%"), -0.2);
  assert.equal(typedNumber("abc"), null);
  assert.equal(cellMatches("/blog/NPS-guide", "contains", "nps"), true);
  assert.equal(cellMatches("/blog/nps-guide", "notContains", "nps"), false);
  assert.equal(cellMatches("Organic Search", "equals", "organic search"), true);
  assert.equal(cellMatches(-0.53, "lt", "-25%"), true);
  assert.equal(cellMatches(-0.1, "lt", "-25%"), false);
  assert.equal(cellMatches(140, "gt", "100"), true);
  assert.equal(cellMatches(null, "gt", "1"), false);
});
