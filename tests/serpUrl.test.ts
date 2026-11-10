import assert from "node:assert/strict";
import { test } from "node:test";
import { breadcrumbUrl, fixSerpItems, isGoogleRedirect, plainTarget } from "../src/lib/serpUrl.ts";

test("Google redirect links are spotted, and plain targets read", () => {
  assert.equal(isGoogleRedirect("https://google.com/goto?url=CAESUgHElkXX"), true);
  assert.equal(isGoogleRedirect("https://www.google.co.uk/url?q=https://acme.com/a"), true);
  assert.equal(isGoogleRedirect("https://cloud.google.com/use-cases/how-to-build"), false);
  assert.equal(isGoogleRedirect("https://acme.com/goto?url=x"), false);
  assert.equal(plainTarget("https://www.google.com/url?q=https://acme.com/a&sa=U"), "https://acme.com/a");
  assert.equal(plainTarget("https://google.com/goto?url=CAESUgHElkXX"), null);
});

test("breadcrumbs give the site and, when the parts look like a path, the page", () => {
  assert.equal(breadcrumbUrl("https://www.base44.com › blog › ai-app-builder"), "https://www.base44.com/blog/ai-app-builder");
  assert.equal(breadcrumbUrl("https://replit.com › ai › App Builder Guide"), "https://replit.com/");
  assert.equal(breadcrumbUrl("https://figma.com"), "https://figma.com/");
  assert.equal(breadcrumbUrl("Figma"), null);
  assert.equal(breadcrumbUrl("https://www.google.com › search"), null);
});

test("redirect links in organic results are swapped for the real address, others are left alone", async () => {
  const items = [
    { type: "organic", url: "https://google.com/goto?url=AAA", domain: "google.com", breadcrumb: "https://www.base44.com › blog" },
    { type: "organic", url: "https://google.com/goto?url=BBB", domain: "google.com", breadcrumb: "https://replit.com › x" },
    { type: "organic", url: "https://google.com/goto?url=CCC", domain: "google.com", breadcrumb: null },
    { type: "organic", url: "https://cloud.google.com/blog/x", domain: "cloud.google.com" },
    { type: "paid", url: "https://google.com/goto?url=DDD", domain: "google.com" },
  ];
  const seen: string[] = [];
  await fixSerpItems(items, async (u) => {
    seen.push(u);
    if (u.endsWith("AAA")) return "https://base44.com/blog/build-an-app";
    if (u.endsWith("BBB")) return "https://www.google.com/sorry/index"; // Google blocked us: use the breadcrumb
    return null;
  });
  assert.deepEqual([items[0].url, items[0].domain], ["https://base44.com/blog/build-an-app", "base44.com"]);
  assert.deepEqual([items[1].url, items[1].domain], ["https://replit.com/x", "replit.com"]);
  assert.equal(items[2].url, "https://google.com/goto?url=CCC"); // nothing to go on: kept
  assert.equal(items[3].url, "https://cloud.google.com/blog/x");
  assert.equal(items[4].url, "https://google.com/goto?url=DDD"); // ads aren't touched
  assert.equal(seen.length, 3);
});
