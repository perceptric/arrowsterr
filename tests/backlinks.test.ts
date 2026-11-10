import assert from "node:assert/strict";
import { test } from "node:test";
import { aiLinkRows, anchorGroup, anchorMix, andAll, authorityBands, bareDomain, blTarget, brandWords, brokenPages, bulkTargets, citedDetail, citedDomains, disavowFile, gapRivals, gapSpread, guessScope, parseBulk, parseHistory, parseProfile, parseRefDomains, riskOf, suggestRedirect, linksQuery, parseAnchors, parseGap, parseLinks, parsePages, parseSummary, parseWeeks, spamLevel, weekAgo } from "../src/lib/backlinks.ts";

test("a site with zero links has no summary, empty lists and no gap", () => {
  assert.equal(parseSummary({ backlinks: 0, referring_domains: 0, rank: 0 }), null);
  assert.equal(parseSummary(null), null);
  assert.deepEqual(parseWeeks(undefined), []);
  assert.deepEqual(parseAnchors([], 0), []);
  assert.deepEqual(parseLinks(null), []);
  assert.deepEqual(parseGap([{ rival: "rival.com", items: [] }], "acme.com", new Map()), []);
});

test("the summary reads DataForSEO's fields", () => {
  const s = parseSummary({ rank: 41.6, backlinks: 3960, referring_domains: 412, referring_domains_nofollow: 90, backlinks_spam_score: 4, broken_backlinks: 7 });
  assert.deepEqual(s, { rank: 42, backlinks: 3960, domains: 412, nofollowDomains: 90, spam: 4, broken: 7 });
});

test("a spam-heavy profile reads as high, and spam links can be listed on their own", () => {
  assert.equal(spamLevel(72), "high");
  assert.equal(spamLevel(45), "medium");
  assert.equal(spamLevel(4), "low");
  assert.deepEqual(linksQuery("spam").filters, ["backlink_spam_score", ">", 60]);
});

test("weeks are sorted and capped at 12, anchors merge case and get their share of domains", () => {
  const items = Array.from({ length: 14 }, (_, i) => ({ date: `2026-${String(Math.floor(i / 4) + 8).padStart(2, "0")}-${String((i % 4) * 7 + 1).padStart(2, "0")} 00:00:00 +00:00`, new_referring_domains: i, lost_referring_domains: 1 }));
  const w = parseWeeks(items.reverse());
  assert.equal(w.length, 12);
  assert.ok(w[0].date < w[11].date);
  const a = parseAnchors([{ anchor: "Acme", referring_domains: 30, backlinks: 50 }, { anchor: "acme ", referring_domains: 10, backlinks: 12 }, { anchor: "", referring_domains: 5, backlinks: 5 }], 100);
  assert.deepEqual(a[0], { anchor: "Acme", domains: 40, backlinks: 62, share: 40 });
  assert.equal(a[1].anchor, "No anchor text");
  assert.deepEqual(parsePages([{ url: "https://acme.com/a", referring_domains: 3, backlinks: 9 }, { url: "https://acme.com/", referring_domains: 30, backlinks: 90 }]).map((p) => p.url), ["https://acme.com/", "https://acme.com/a"]);
});

test("link rows read the fields, and each list asks for the right links", () => {
  const [r] = parseLinks([{ url_from: "https://www.g2.com/x", domain_from: "www.g2.com", url_to: "https://acme.com/", anchor: " Acme  CRM ", dofollow: false, first_seen: "2026-10-04 10:00:00 +00:00", is_new: true, backlink_spam_score: 2, domain_from_rank: 77.4, item_type: "anchor", text_pre: "We compared every tool and picked", text_post: "for small teams", semantic_location: "article", attributes: ["nofollow", "noopener"], page_from_title: "Best CRMs" }]);
  assert.deepEqual(r, { from: "https://www.g2.com/x", domain: "g2.com", to: "https://acme.com/", anchor: "Acme CRM", follow: false, type: "anchor", firstSeen: "2026-10-04", isNew: true, isLost: false, spam: 2, rank: 77, pre: "We compared every tool and picked", post: "for small teams", place: "article", attrs: ["nofollow"], title: "Best CRMs" });
  assert.equal(linksQuery("lost").backlinks_status_type, "lost");
  assert.deepEqual(linksQuery("new", new Date("2026-11-09T00:00:00Z")).filters, ["first_seen", ">", "2026-10-10 00:00:00 +00:00"]);
  assert.deepEqual(linksQuery("follow").filters, ["dofollow", "=", true]);
  assert.equal(linksQuery("all").mode, "one_per_domain");
});

const hit = (domain: string, rank: number) => ({ domain_intersection: { "1": { type: "backlinks_domain_intersection", target: domain, rank, backlinks: 3 } }, summary: { intersections_count: 1 } });

test("the link gap merges each rival's list, drops the brand and rivals, ranks shared and AI-cited sites first", () => {
  const cited = citedDomains([{ chats: [{ sources: [{ domain: "www.g2.com" }, { url: "https://g2.com/reviews" }] }] }]);
  const rows = parseGap(
    [
      { rival: "rival-one.com", items: [hit("blog.example.com", 90), hit("g2.com", 70), hit("www.clutch.co", 60), hit("rival-two.io", 80), hit("www.acme.com", 50), hit("docs.acme.com", 50), { domain_intersection: { "1": null } }] },
      { rival: "https://www.rival-two.io/", items: [hit("clutch.co", 64)] },
    ],
    "acme.com",
    cited,
  );
  assert.deepEqual(rows.map((r) => r.domain), ["clutch.co", "g2.com", "blog.example.com"]);
  assert.deepEqual(rows[0].rivals, ["rival-one.com", "rival-two.io"]);
  assert.equal(rows[0].rank, 64);
  assert.equal(rows[1].aiCited, 2);
});

test("a gap with only one rival still works", () => {
  const rows = parseGap([{ rival: "rival.com", items: [hit("saastr.com", 66)] }], "acme.com", new Map());
  assert.deepEqual(rows, [{ domain: "saastr.com", rank: 66, rivals: ["rival.com"], aiCited: 0 }]);
});

test("gap rivals are cleaned, capped at 3, and never the brand", () => {
  assert.deepEqual(gapRivals(["https://www.Rival.com/pricing", "acme.com", "rival.com", "two.io", "three.co", "four.net"], "www.acme.com"), ["rival.com", "two.io", "three.co"]);
  assert.deepEqual(gapRivals(["not a site", ""], "acme.com"), []);
  assert.equal(bareDomain("HTTPS://WWW.Acme.com/a?b"), "acme.com");
});

test("the KPI arrow compares with the last snapshot at least 6 days old", () => {
  const snaps = [{ day: "2026-11-09" }, { day: "2026-11-05" }, { day: "2026-11-02" }, { day: "2026-10-26" }];
  assert.equal(weekAgo(snaps, "2026-11-09")?.day, "2026-11-02");
  assert.equal(weekAgo([{ day: "2026-11-09" }], "2026-11-09"), null);
});

test("any typed site or page becomes the right Backlinks target", () => {
  assert.deepEqual(blTarget("https://www.Acme.com/pricing", "domain"), { scope: "domain", target: "acme.com", label: "acme.com", host: "acme.com", id: "acme.com" });
  assert.deepEqual(blTarget("blog.acme.com", "subdomain"), { scope: "subdomain", target: "blog.acme.com", label: "blog.acme.com", host: "blog.acme.com", id: "sub:blog.acme.com" });
  const page = blTarget("www.acme.com/pricing?plan=pro", "url");
  assert.equal(page?.target, "https://www.acme.com/pricing?plan=pro");
  assert.equal(page?.label, "www.acme.com/pricing?plan=pro");
  assert.equal(page?.id, "url:https://www.acme.com/pricing?plan=pro");
  // A page needs a path, and junk is refused.
  assert.equal(blTarget("acme.com", "url"), null);
  assert.equal(blTarget("not a site", "domain"), null);
  assert.equal(blTarget("", "domain"), null);
  // The same host as a domain and as a subdomain are kept apart in the cache.
  assert.notEqual(blTarget("blog.acme.com", "domain")?.id, blTarget("blog.acme.com", "subdomain")?.id);
});

test("the scope is guessed from what is typed, a folder counting as its page", () => {
  const g = (s: string) => (s.includes("/blog") ? "subfolder" : s.startsWith("blog.") ? "subdomain" : s.includes("/") ? "url" : "domain");
  assert.equal(guessScope("acme.com/blog", g), "url");
  assert.equal(guessScope("acme.com/pricing", g), "url");
  assert.equal(guessScope("blog.acme.com", g), "subdomain");
  assert.equal(guessScope("acme.com", g), "domain");
  assert.equal(guessScope("x", () => null), null);
});

test("a pasted list is cleaned, deduped and split into sites and pages", () => {
  const { targets, skipped } = bulkTargets("acme.com\nhttps://www.acme.com/\nrival.io, rival.io/pricing\nnot a site\n\n");
  assert.deepEqual(targets.map((t) => t.target), ["acme.com", "rival.io", "https://rival.io/pricing"]);
  assert.equal(skipped, 1);
});

test("bulk answers join by target, biggest profile first, spam left empty when it failed", () => {
  const rows = parseBulk(["acme.com", "https://rival.io/pricing"], {
    ranks: [{ target: "acme.com", rank: 41.4 }, { target: "https://rival.io/pricing/", rank: 20 }],
    backlinks: [{ target: "acme.com", backlinks: 3960 }, { target: "rival.io/pricing", backlinks: 12 }],
    domains: [{ target: "ACME.com", referring_domains: 412, referring_domains_nofollow: 100 }, { target: "https://rival.io/pricing", referring_domains: 900 }],
    spam: null,
  });
  assert.deepEqual(rows, [
    { target: "https://rival.io/pricing", rank: 20, backlinks: 12, domains: 900, nofollowDomains: 0, spam: null },
    { target: "acme.com", rank: 41, backlinks: 3960, domains: 412, nofollowDomains: 100, spam: null },
  ]);
});

test("the summary's lists become the profile charts, unknown and empty keys dropped", () => {
  const p = parseProfile({
    backlinks: 1000,
    referring_ips: 388,
    referring_subnets: 351,
    referring_links_attributes: { nofollow: 210, ugc: 50, sponsored: 30, noopener: 400 },
    referring_links_tld: { com: 700, org: 100, edu: 4, xyz: 0 },
    referring_links_types: { anchor: 900, image: 80, redirect: 20, weird: 5 },
    referring_links_platform_types: { blogs: 400, unknown: 300, "message-boards": 100 },
    referring_links_semantic_locations: { article: 600, footer: 50, "": 300 },
    referring_links_countries: { US: 500, gb: 40, "": 10 },
  });
  assert.ok(p);
  assert.equal(p.followLinks, 790);
  assert.equal(p.nofollowLinks, 210);
  assert.deepEqual(p.tlds.map((t) => t.label), [".com", ".org", ".edu"]);
  assert.deepEqual(p.types.map((t) => t.label), ["Text", "Image", "Redirect"]);
  assert.deepEqual(p.platforms.map((t) => t.label), ["Blogs", "Forums"]);
  assert.deepEqual(p.places.map((t) => t.label), ["In the article", "Footer"]);
  assert.deepEqual(p.countries.map((t) => t.label), ["US", "GB"]);
  assert.equal(parseProfile({ backlinks: 0 }), null);
});

test("monthly history is sorted and keeps one point a month", () => {
  const h = parseHistory([
    { date: "2026-03-01 00:00:00 +00:00", referring_domains: 30, backlinks: 300, rank: 40.6 },
    { date: "2026-01-01 00:00:00 +00:00", referring_domains: 10, backlinks: 100, rank: 38 },
    { date: "2026-02-01 00:00:00 +00:00", referring_domains: 20, backlinks: 200, rank: 39 },
    { date: "2026-02-15 00:00:00 +00:00", referring_domains: 22, backlinks: 210, rank: 39 },
  ]);
  assert.deepEqual(h.map((m) => m.domains), [10, 22, 30]);
  assert.equal(h[2].rank, 41);
});

test("linking sites are cleaned, strongest first, and banded by authority", () => {
  const rows = parseRefDomains([
    { domain: "www.weak.xyz", rank: 3, backlinks: 80, referring_pages: 80, referring_pages_nofollow: 0, backlinks_spam_score: 75 },
    { domain: "g2.com", rank: 91, backlinks: 4, referring_pages: 4, referring_pages_nofollow: 4, first_seen: "2026-10-02 10:00:00 +00:00" },
    { domain: "", rank: 50 },
  ]);
  assert.deepEqual(rows.map((r) => r.domain), ["g2.com", "weak.xyz"]);
  assert.equal(rows[0].follow, false);
  assert.equal(rows[0].nofollowShare, 100);
  assert.equal(rows[0].firstSeen, "2026-10-02");
  assert.deepEqual(authorityBands([{ rank: 0 }, { rank: 9 }, { rank: 55 }, { rank: 100 }]), [2, 0, 0, 0, 0, 1, 0, 0, 0, 1]);
});

test("anchors are sorted into brand, URL, generic and keyword", () => {
  const words = brandWords("Perceptric", "perceptric.com");
  assert.equal(anchorGroup("Perceptric agency", words), "brand");
  assert.equal(anchorGroup("perceptric.com", words), "brand");
  assert.equal(anchorGroup("https://perceptric.com/blog/ai-search", words), "url");
  assert.equal(anchorGroup("example.org/page", words), "url");
  assert.equal(anchorGroup("Click here", words), "generic");
  assert.equal(anchorGroup("read more.", words), "generic");
  assert.equal(anchorGroup("ai search agency", words), "keyword");
  assert.equal(anchorGroup("", words), "empty");
  const mix = anchorMix([{ anchor: "perceptric", domains: 60, backlinks: 0, share: 0 }, { anchor: "click here", domains: 20, backlinks: 0, share: 0 }, { anchor: "geo agency", domains: 20, backlinks: 0, share: 0 }], words);
  assert.deepEqual(mix.map((g) => [g.id, g.share]), [["brand", 60], ["generic", 20], ["keyword", 20]]);
});

test("Backlinks filters join with and, and the new link lists ask DataForSEO the right way", () => {
  assert.equal(andAll([[], []]), undefined);
  assert.deepEqual(andAll([["a", "=", 1]]), ["a", "=", 1]);
  assert.deepEqual(andAll([["a", "=", 1], [], ["b", "=", 2]]), [["a", "=", 1], "and", ["b", "=", 2]]);
  assert.deepEqual(linksQuery("ugc").filters, ["attributes", "has", "ugc"]);
  const q = linksQuery("follow", new Date("2026-11-10T00:00:00Z"), { article: true, anchor: "50%_off" });
  assert.deepEqual(q.filters, [["dofollow", "=", true], "and", ["semantic_location", "=", "article"], "and", ["anchor", "like", "%50  off%"]]);
  assert.equal(linksQuery("lost").backlinks_status_type, "lost");
});

test("broken links are grouped by dead page with a live page to send each to", () => {
  const pages = brokenPages(
    [
      { url_to: "https://acme.com/old-webinar", url_to_status_code: 404, domain_from: "a.com", url_from: "https://a.com/x", domain_from_rank: 50, anchor: "webinar" },
      { url_to: "https://acme.com/old-webinar", domain_from: "a.com", url_from: "https://a.com/y", domain_from_rank: 50 },
      { url_to: "https://acme.com/old-webinar", domain_from: "b.com", url_from: "https://b.com/z", domain_from_rank: 80 },
      { url_to: "https://acme.com/blog/ai-search-2024", url_to_status_code: 410, domain_from: "c.com", url_from: "https://c.com/q", domain_from_rank: 30 },
    ],
    ["https://acme.com/", "https://acme.com/blog/ai-search", "https://acme.com/events/webinars"],
  );
  assert.equal(pages.length, 2);
  assert.equal(pages[0].page, "https://acme.com/old-webinar");
  assert.equal(pages[0].sites, 2);
  assert.equal(pages[0].links, 3);
  assert.equal(pages[0].from[0].domain, "b.com");
  assert.equal(pages[0].redirect, "/events/webinars");
  assert.equal(pages[1].status, 410);
  assert.equal(pages[1].redirect, "/blog/ai-search");
  assert.equal(suggestRedirect("/nothing-alike", ["https://acme.com/pricing"]), "/");
});

test("toxic links put spam first and the disavow file is in Google's format", () => {
  const base = { firstSeen: null, follow: true, nofollowShare: 0 };
  assert.equal(riskOf({ ...base, domain: "g2.com", rank: 91, backlinks: 4, spam: 2 }).level, "low");
  const bad = riskOf({ ...base, domain: "links.xyz", rank: 2, backlinks: 120, spam: 70 });
  assert.equal(bad.level, "high");
  assert.deepEqual(bad.reasons, ["Spam score 70", "Very low authority", ".xyz ending", "120 links from a weak site"]);
  assert.equal(riskOf({ ...base, domain: "mid.com", rank: 30, backlinks: 2, spam: 35 }).level, "check");
  assert.equal(disavowFile(["www.b.xyz", "a.top", "a.top"], "acme.com", "2026-11-10"), "# Disavow file for acme.com\n# Made in Arrowsterr on 2026-11-10\ndomain:a.top\ndomain:b.xyz\n");
});

test("AI-cited sites: who links, which models cite them, and the order to go after them", () => {
  const cited = citedDetail([
    { chats: [{ engine: "ChatGPT", sources: [{ domain: "reddit.com" }, { domain: "g2.com" }] }, { engine: "Gemini", sources: [{ url: "https://www.reddit.com/r/x" }] }] },
    { chats: [{ engine: "Perplexity", sources: [{ domain: "gartner.com" }, { domain: "reddit.com" }] }] },
  ]);
  assert.deepEqual(cited[0], { domain: "reddit.com", cites: 3, engines: ["ChatGPT", "Gemini", "Perplexity"] });
  const rows = aiLinkRows(cited, ["g2.com"], { "rival.com": ["gartner.com", "reddit.com"], "two.io": ["reddit.com"] }, { "reddit.com": 96, "gartner.com": 92, "g2.com": 91 });
  assert.deepEqual(rows.map((r) => r.domain), ["reddit.com", "gartner.com", "g2.com"]);
  assert.deepEqual(rows[0].competitors, ["rival.com", "two.io"]);
  assert.ok(rows[0].priority >= rows[1].priority);
  assert.equal(rows[2].linksYou, true);
  assert.equal(rows[2].priority, 1);
});

test("the link gap takes up to 10 competitors and splits sites by how many they link to", () => {
  assert.equal(gapRivals(Array.from({ length: 12 }, (_, i) => `r${i}.com`), "acme.com", 10).length, 10);
  assert.deepEqual(gapSpread([{ domain: "a", rank: 1, rivals: ["x"], aiCited: 0 }, { domain: "b", rank: 1, rivals: ["x", "y"], aiCited: 0 }, { domain: "c", rank: 1, rivals: ["x", "y", "z", "w"], aiCited: 0 }]), [1, 1, 1]);
});
