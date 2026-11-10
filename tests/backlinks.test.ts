import assert from "node:assert/strict";
import { test } from "node:test";
import { bareDomain, blTarget, bulkTargets, citedDomains, gapRivals, guessScope, parseBulk, linksQuery, parseAnchors, parseGap, parseLinks, parsePages, parseSummary, parseWeeks, spamLevel, weekAgo } from "../src/lib/backlinks.ts";

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
  const [r] = parseLinks([{ url_from: "https://www.g2.com/x", domain_from: "www.g2.com", url_to: "https://acme.com/", anchor: " Acme  CRM ", dofollow: false, first_seen: "2026-10-04 10:00:00 +00:00", is_new: true, backlink_spam_score: 2, domain_from_rank: 77.4, item_type: "anchor" }]);
  assert.deepEqual(r, { from: "https://www.g2.com/x", domain: "g2.com", to: "https://acme.com/", anchor: "Acme CRM", follow: false, type: "anchor", firstSeen: "2026-10-04", isNew: true, isLost: false, spam: 2, rank: 77 });
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
