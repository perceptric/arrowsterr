import assert from "node:assert/strict";
import { test } from "node:test";
import { bareHost, bingSiteForUrl, bingSites, gscRows, gscSites, pickGscProperty } from "../src/lib/searchEngines.ts";

const site = (url: string, permission = "siteOwner") => ({ url, permission });

test("bare host drops the scheme, www, path and port", () => {
  assert.equal(bareHost("https://www.Example.com/blog?x=1"), "example.com");
  assert.equal(bareHost("sc-domain:example.com"), "example.com");
  assert.equal(bareHost("example.com:8080"), "example.com");
  assert.equal(bareHost("shop.example.com."), "shop.example.com");
  assert.equal(bareHost(""), "");
});

test("a domain property wins over URL-prefix properties", () => {
  const sites = [site("https://www.example.com/"), site("sc-domain:example.com"), site("http://example.com/")];
  assert.equal(pickGscProperty(sites, "example.com"), "sc-domain:example.com");
  assert.equal(pickGscProperty(sites, "www.example.com"), "sc-domain:example.com");
});

test("without a domain property, the https home page wins, in the www form the brand uses", () => {
  const sites = [site("http://www.example.com/"), site("https://example.com/blog/"), site("https://www.example.com/"), site("https://example.com/")];
  assert.equal(pickGscProperty(sites, "www.example.com"), "https://www.example.com/");
  assert.equal(pickGscProperty(sites, "example.com"), "https://example.com/");
  assert.equal(pickGscProperty([site("http://www.example.com/"), site("https://example.com/blog/")], "example.com"), "http://www.example.com/");
});

test("a subdomain brand takes its own property, then the parent domain property", () => {
  const sites = [site("sc-domain:example.com"), site("https://shop.example.com/")];
  assert.equal(pickGscProperty(sites, "shop.example.com"), "https://shop.example.com/");
  assert.equal(pickGscProperty([site("sc-domain:example.com")], "shop.example.com"), "sc-domain:example.com");
  // A child domain property never covers the parent.
  assert.equal(pickGscProperty([site("sc-domain:shop.example.com")], "example.com"), null);
});

test("other sites and look-alike domains never match", () => {
  const sites = [site("sc-domain:other.com"), site("https://notexample.com/"), site("sc-domain:example.co")];
  assert.equal(pickGscProperty(sites, "example.com"), null);
  assert.equal(pickGscProperty(sites, ""), null);
});

test("Search Console site lists parse with or without response_data, and skip unverified ones", () => {
  const raw = {
    response_data: {
      siteEntry: [
        { siteUrl: "sc-domain:example.com", permissionLevel: "siteOwner" },
        { siteUrl: "https://www.example.com/", permissionLevel: "siteUnverifiedUser" },
        { siteUrl: "", permissionLevel: "siteOwner" },
      ],
    },
  };
  assert.deepEqual(gscSites(raw), [{ url: "sc-domain:example.com", permission: "siteOwner" }]);
  assert.deepEqual(gscSites({ siteEntry: [{ siteUrl: "https://a.com/", permissionLevel: "siteFullUser" }] }), [{ url: "https://a.com/", permission: "siteFullUser" }]);
  assert.deepEqual(gscSites(null), []);
  assert.deepEqual(gscSites({ response_data: {} }), []);
});

test("Bing sites parse, with or without response_data", () => {
  const sites = bingSites({
    sites: [
      { url: "https://www.example.com/", is_verified: false },
      { url: "http://www.example.com/", is_verified: true },
    ],
    skipped_site_count: 0,
  });
  assert.deepEqual(sites, [
    { url: "https://www.example.com/", verified: false },
    { url: "http://www.example.com/", verified: true },
  ]);
  assert.deepEqual(bingSites({ response_data: { sites: [{ Url: "https://a.com/" }] } }), [{ url: "https://a.com/", verified: true }]);
});

test("a live post goes to the Bing site it lives under", () => {
  const sites = [
    { url: "https://www.example.com/", verified: true },
    { url: "https://www.example.com/blog/", verified: true },
    { url: "https://example.com/", verified: true },
    { url: "https://shop.example.com/", verified: true },
    { url: "https://other.com/", verified: false },
  ];
  assert.equal(bingSiteForUrl(sites, "https://www.example.com/blog/best-crm"), "https://www.example.com/blog/");
  assert.equal(bingSiteForUrl(sites, "https://www.example.com/news/x"), "https://www.example.com/");
  assert.equal(bingSiteForUrl(sites, "https://example.com/blog/x"), "https://example.com/");
  assert.equal(bingSiteForUrl(sites, "https://shop.example.com/p/1"), "https://shop.example.com/");
  assert.equal(bingSiteForUrl(sites, "https://other.com/x"), null);
  assert.equal(bingSiteForUrl(sites, "not a url"), null);
  assert.equal(bingSiteForUrl([{ url: "https://example.com/blog/", verified: true }], "https://example.com/blogger"), null);
});

test("Search Console rows read with or without response_data, numbers from text too", () => {
  assert.deepEqual(gscRows({ response_data: { rows: [{ keys: ["2026-11-09", "crm"], clicks: "3", impressions: 30, ctr: 0.1, position: 4.5 }] } }), [
    { keys: ["2026-11-09", "crm"], clicks: 3, impressions: 30, ctr: 0.1, position: 4.5 },
  ]);
  assert.deepEqual(gscRows({}), []);
});
