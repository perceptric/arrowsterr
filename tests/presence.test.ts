import assert from "node:assert/strict";
import { test } from "node:test";
import {
  bareHost,
  cleanHost,
  claimValues,
  gbpKeyword,
  lastEditOf,
  missingTips,
  nameMatches,
  normName,
  parseGbp,
  parseTrustpilot,
  pickArticle,
  pickWikidata,
  presenceList,
  sameSite,
  siteVariants,
  sumViews,
  wikiDate,
  wikiFacts,
  wikiLanguages,
  type BrandPresence,
  type WdEntity,
} from "../src/lib/presence.ts";

// Trimmed from live Wikidata answers (wbgetentities) for "HubSpot".
const item = (v: unknown) => ({ mainsnak: { datavalue: { value: v } }, rank: "normal" });
const ref = (id: string) => item({ "entity-type": "item", id });
const HUBSPOT: WdEntity = {
  id: "Q5926631",
  labels: { en: { value: "HubSpot" } },
  descriptions: { en: { value: "American marketing software company" } },
  claims: {
    P856: [item("http://www.hubspot.com")],
    P571: [item({ time: "+2006-00-00T00:00:00Z", precision: 9 })],
    P159: [ref("Q49111")],
    P452: [ref("Q880371"), ref("Q1254596")],
  },
  sitelinks: { enwiki: { title: "HubSpot" }, dewiki: { title: "HubSpot" }, commonswiki: { title: "Category:HubSpot" }, zh_yuewiki: { title: "HubSpot" }, enwikiquote: { title: "HubSpot" } },
};
// A founder lists the company's site too.
const FOUNDER: WdEntity = { id: "Q4963923", labels: { en: { value: "Brian Halligan" } }, descriptions: { en: { value: "American businessman" } }, claims: { P856: [item("https://www.hubspot.com/")] }, sitelinks: { enwiki: { title: "Brian Halligan" } } };
const LIBRARY: WdEntity = { id: "Q107384321", labels: { en: { value: "hubspot3" } }, descriptions: { en: { value: "Python library" } }, claims: {} };

test("hosts are compared without protocol, www or path", () => {
  assert.equal(bareHost("https://www.HubSpot.com/products?x=1"), "hubspot.com");
  assert.equal(bareHost("http://www2.acme.co.uk:8080/"), "acme.co.uk");
  assert.equal(bareHost(""), "");
  assert.equal(cleanHost("not a site"), "");
  assert.equal(cleanHost("Acme.com/blog"), "acme.com");
  assert.ok(sameSite("http://www.hubspot.com", "hubspot.com"));
  assert.ok(sameSite("blog.hubspot.com", "hubspot.com"));
  assert.ok(!sameSite("nothubspot.com", "hubspot.com"));
  assert.ok(!sameSite("", "hubspot.com"));
  assert.ok(siteVariants("acme.com").includes("http://www.acme.com"));
  assert.equal(siteVariants("acme.com").length, 8);
});

test("names match without case, accents or company suffixes", () => {
  assert.equal(normName("HubSpot, Inc."), "hubspot");
  assert.equal(normName("Café Rouge Ltd"), "caferouge");
  assert.ok(nameMatches("Hubspot", { name: "HubSpot" }));
  assert.ok(nameMatches("HubSpot Inc", { name: "HubSpot" }));
  assert.ok(nameMatches("Monday", { name: "monday.com", domain: "monday.com" }));
  assert.ok(!nameMatches("HubSpot CRM", { name: "HubSpot" }));
  assert.ok(!nameMatches("", { name: "HubSpot" }));
});

test("the item whose website is the brand's site wins, even over a founder with the same site", () => {
  const hit = pickWikidata([FOUNDER, LIBRARY, HUBSPOT], { name: "HubSpot", domain: "hubspot.com" });
  assert.equal(hit?.entity.id, "Q5926631");
  assert.equal(hit?.match, "website");
});

test("a website that points elsewhere means another organization", () => {
  const other: WdEntity = { ...HUBSPOT, id: "Q1", claims: { P856: [item("https://www.hubspot.de")] } };
  assert.equal(pickWikidata([other, LIBRARY], { name: "HubSpot", domain: "hubspot.com" }), null);
});

test("a name match counts only for a business with no website listed", () => {
  const bare: WdEntity = { id: "Q2", labels: { en: { value: "Acme" } }, descriptions: { en: { value: "software company" } }, claims: {} };
  const person: WdEntity = { id: "Q3", labels: { en: { value: "Acme" } }, descriptions: { en: { value: "family name" } }, claims: {} };
  assert.equal(pickWikidata([person, bare], { name: "Acme", domain: "acme.com" })?.match, "name");
  assert.equal(pickWikidata([person], { name: "Acme", domain: "acme.com" }), null);
  assert.equal(pickWikidata([], { name: "Acme", domain: "acme.com" }), null);
});

test("deprecated values are skipped and preferred ones come first", () => {
  const e: WdEntity = { id: "Q9", claims: { P856: [{ mainsnak: { datavalue: { value: "https://old.example" } }, rank: "deprecated" }, item("https://b.example"), { mainsnak: { datavalue: { value: "https://a.example" } }, rank: "preferred" }] } };
  assert.deepEqual(claimValues(e, "P856"), ["https://a.example", "https://b.example"]);
});

test("facts, languages and the article come from the item", () => {
  assert.deepEqual(wikiFacts(HUBSPOT, { Q49111: "Cambridge", Q880371: "software industry" }), { website: "http://www.hubspot.com", founded: "2006", hq: "Cambridge", industry: ["software industry"] });
  assert.deepEqual(wikiLanguages(HUBSPOT.sitelinks), ["en", "de", "zh-yue"]);
  assert.deepEqual(pickArticle(HUBSPOT.sitelinks, "de"), { lang: "de", title: "HubSpot" });
  assert.deepEqual(pickArticle(HUBSPOT.sitelinks, "fr"), { lang: "en", title: "HubSpot" });
  assert.equal(pickArticle({ commonswiki: { title: "x" } }), null);
  assert.equal(wikiDate({ time: "+1998-09-04T00:00:00Z", precision: 11 }), "1998-09-04");
  assert.equal(wikiDate({ time: "+2010-05-00T00:00:00Z", precision: 10 }), "2010-05");
  assert.equal(wikiDate({ time: "-0500-00-00T00:00:00Z", precision: 9 }), null);
  assert.equal(wikiDate(null), null);
});

test("pageviews and last edit are read from the Wikimedia answers", () => {
  assert.equal(sumViews({ items: [{ views: 188 }, { views: 169 }, { views: "x" }] }), 357);
  assert.equal(sumViews({ detail: "not found" }), null);
  assert.equal(lastEditOf({ query: { pages: [{ title: "HubSpot", revisions: [{ timestamp: "2026-11-13T22:11:57Z" }] }] } }), "2026-11-13T22:11:57Z");
  assert.equal(lastEditOf({ query: { pages: [{ title: "Nope", missing: true }] } }), null);
});

test("a Trustpilot task reads as found with recent reviews, or missing", () => {
  const found = parseTrustpilot({
    domain: "hubspot.com",
    check_url: "https://www.trustpilot.com/review/hubspot.com?sort=recency&languages=all",
    title: "HubSpot",
    reviews_count: 1192,
    rating: { rating_type: "Max5", value: 1.5 },
    items: [
      { rating: { value: 1 }, title: "Lost our data", review_text: "Records went missing.\n\nTwice.", timestamp: "2026-11-16 10:43:47 +00:00", url: "https://www.trustpilot.com/reviews/a" },
      { rating: { value: 3 }, title: "good", review_text: "good but needs more tools", timestamp: "2026-11-15 17:51:44 +00:00" },
      { rating: { value: 5 }, review_text: "great" },
      { rating: { value: 4 }, review_text: "fine" },
    ],
  });
  assert.equal(found.status, "found");
  assert.equal(found.rating, 1.5);
  assert.equal(found.reviews, 1192);
  assert.equal(found.url, "https://www.trustpilot.com/review/hubspot.com");
  assert.equal(found.recent?.length, 3);
  assert.deepEqual(found.recent?.[0], { rating: 1, title: "Lost our data", text: "Records went missing. Twice.", date: "2026-11-16", url: "https://www.trustpilot.com/reviews/a" });
  assert.equal(parseTrustpilot({ domain: "zzqq.com", title: null, reviews_count: null, rating: null, items_count: 0 }).status, "missing");
  assert.equal(parseTrustpilot(null).status, "missing");
});

test("a Google Business Profile counts only when it links to the brand's site", () => {
  const result = {
    items: [{ type: "google_business_info", title: "HubSpot", domain: "www.hubspot.com", url: "https://www.hubspot.com/", category: "Software company", address: "2 Canal Pk, Cambridge, MA 02141", rating: { value: 3.7, votes_count: 169 }, is_claimed: true, cid: "17567319779307444774" }],
  };
  assert.deepEqual(parseGbp(result, "hubspot.com"), {
    status: "found",
    title: "HubSpot",
    rating: 3.7,
    reviews: 169,
    category: "Software company",
    address: "2 Canal Pk, Cambridge, MA 02141",
    claimed: true,
    url: "https://www.google.com/maps?cid=17567319779307444774",
  });
  const other = parseGbp(result, "hubspot.de");
  assert.equal(other.status, "missing");
  assert.match(other.note ?? "", /another site/);
  assert.equal(parseGbp({ items: null }, "hubspot.com").status, "missing");
  assert.equal(parseGbp(result, null).status, "missing");
});

test("the Google search adds the head office city once", () => {
  assert.equal(gbpKeyword("HubSpot", "Cambridge"), "HubSpot Cambridge");
  assert.equal(gbpKeyword("HubSpot", null), "HubSpot");
  assert.equal(gbpKeyword("Bank of London", "London"), "Bank of London");
});

test("the list is the brand, then up to 3 competitors without repeats", () => {
  const list = presenceList({ name: "HubSpot", domain: "hubspot.com" }, [
    { name: "Salesforce", domain: "https://www.salesforce.com/" },
    { name: "hubspot", domain: "hubspot.com" },
    { name: "Pipedrive", domain: null },
    { name: "salesforce", domain: "salesforce.com" },
    { name: "Zoho", domain: "zoho.com" },
    { name: "Monday", domain: "monday.com" },
    "junk",
  ]);
  assert.deepEqual(list, [
    { name: "HubSpot", domain: "hubspot.com", you: true },
    { name: "Salesforce", domain: "salesforce.com" },
    { name: "Pipedrive", domain: null },
    { name: "Zoho", domain: "zoho.com" },
  ]);
  assert.equal(presenceList({ name: "Acme", domain: "acme.com" }, undefined).length, 1);
});

test("tips name each missing source", () => {
  const p: BrandPresence = { name: "Acme", domain: "acme.com", wiki: { status: "missing" }, trustpilot: { status: "missing" }, gbp: { status: "unchecked" } };
  const tips = missingTips(p);
  assert.equal(tips.length, 3);
  assert.match(tips[0], /Wikipedia/);
  assert.equal(missingTips({ ...p, wiki: { status: "found", article: null }, trustpilot: { status: "found" } }).length, 1);
});
