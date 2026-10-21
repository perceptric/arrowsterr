import assert from "node:assert/strict";
import { test } from "node:test";
import { aiVerdict, brandWord, namesSite, sameSite, spotsOf } from "../src/lib/rankChecks.ts";
import { cleanTopic, pickOptions } from "../src/lib/metaRules.ts";

test("a result counts for the domain with or without www and on subdomains, never on look-alikes", () => {
  assert.equal(sameSite("www.acme.com", "acme.com"), true);
  assert.equal(sameSite("blog.acme.com", "www.acme.com"), true);
  assert.equal(sameSite("ACME.COM.", "acme.com"), true);
  assert.equal(sameSite("notacme.com", "acme.com"), false);
  assert.equal(sameSite("acme.com.evil.io", "acme.com"), false);
  assert.equal(sameSite("acme.com", ""), false);
});

test("every spot the domain holds, best first", () => {
  const rows = [
    { rank: 37, url: "https://acme.com/b", domain: "acme.com", title: "" },
    { rank: 1, url: "https://g2.com/x", domain: "g2.com", title: "" },
    { rank: 4, url: "https://www.acme.com/a", domain: "", title: "" },
  ];
  assert.deepEqual(spotsOf(rows, "acme.com").map((r) => r.rank), [4, 37]);
  assert.deepEqual(spotsOf(rows, "zzz.com"), []);
});

test("brand words come from the domain, and short ones need the full domain", () => {
  assert.equal(brandWord("acme.com"), "acme");
  assert.equal(brandWord("www.bbc.co.uk"), "bbc");
  assert.equal(brandWord("shop.acme.io"), "acme");
  assert.equal(brandWord("canva.com.au"), "canva");
  assert.equal(namesSite("Try HubSpot or Pipedrive.", "hubspot.com"), true);
  assert.equal(namesSite("Our hubspotter guide", "hubspot.com"), false, "inside another word");
  assert.equal(namesSite("Monday dot com and Notion", "monday.com"), true);
  assert.equal(namesSite("The BBC says", "bbc.co.uk"), false, "3 letters is too short to trust");
  assert.equal(namesSite("Source: bbc.co.uk", "bbc.co.uk"), true);
  assert.equal(namesSite("Use Close CRM", "close-crm.com"), true, "a hyphen can be a space");
  assert.equal(namesSite("Close the deal today", "close-crm.com"), false, "hyphenated brands need both words");
});

test("AI answers: cited spot counts sites once, tracking codes and www don't matter", () => {
  const answer = {
    text: "Acme and Zeta both work well.",
    sources: [
      { url: "https://g2.com/a" },
      { url: "https://g2.com/b" },
      { url: "https://www.acme.com/pricing?utm_source=chatgpt.com", domain: "www.acme.com" },
      { url: "https://zeta.io/" },
    ],
  };
  const v = aiVerdict(answer, "acme.com");
  assert.equal(v.cited, true);
  assert.equal(v.spot, 2);
  assert.equal(v.named, true);
  assert.deepEqual(v.others, ["g2.com", "zeta.io"]);
  assert.equal(v.pages.length, 1);
  const none = aiVerdict({ text: "", sources: [] }, "acme.com");
  assert.deepEqual(none, { cited: false, spot: null, named: false, pages: [], others: [] });
});

test("meta options outside the rules are never shown", () => {
  const titles = pickOptions(
    [
      'Title 1: "Trail Running Shoes for Every Terrain | Acme"',
      "Trail running shoes for every terrain | Acme",
      "Too short",
      "AMAZING Trail Running Shoes You Will Love Right Now Today",
      "Best Trail Running Shoes!!! Shop the Whole Range at Acme Today",
      "Trail Running Shoes Built for Grip and Comfort on Rough Ground and Mud",
      "Lightweight Trail Shoes for Runners | Acme 🏃",
      "Trail Running Shoes Tested on 500 Miles of Rock | Acme",
      42,
    ],
    "title",
  );
  assert.deepEqual(titles, ["Trail Running Shoes for Every Terrain | Acme", "Trail Running Shoes Tested on 500 Miles of Rock | Acme"]);
  assert.deepEqual(pickOptions("nope", "title"), []);
  assert.equal(cleanTopic("  trail   shoes "), "trail shoes");
  assert.equal(cleanTopic("<script>"), null);
  assert.equal(cleanTopic("x"), null);
});
