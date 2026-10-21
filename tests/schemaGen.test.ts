import assert from "node:assert/strict";
import { test } from "node:test";
import { buildSchema, checkSchema, schemaScript } from "../src/lib/schemaGen.ts";

test("FAQ: only full pairs go in, and a half-filled pair is flagged", () => {
  const v = { faqs: [{ q: "Do you ship abroad?", a: "Yes, to 40 countries." }, { q: "Half", a: " " }] };
  const s = buildSchema("FAQPage", v) as { mainEntity: { name: string; acceptedAnswer: { text: string } }[] };
  assert.equal(s.mainEntity.length, 1);
  assert.equal(s.mainEntity[0].acceptedAnswer.text, "Yes, to 40 countries.");
  assert.equal(checkSchema("FAQPage", v)[0].level, "error");
  assert.equal(checkSchema("FAQPage", { faqs: [] })[0].level, "required");
});

test("empty fields never reach the JSON-LD, so nothing says an empty name", () => {
  const s = buildSchema("Article", { headline: "Hello", authorName: "", publisherName: "" });
  assert.deepEqual(s, { "@context": "https://schema.org", "@type": "Article", headline: "Hello" });
  assert.deepEqual(buildSchema("Organization", {}), { "@context": "https://schema.org", "@type": "Organization" });
});

test("Product: an offer or a rating is required, and the numbers are checked", () => {
  const issues = checkSchema("Product", { name: "Trail shoe" });
  assert.equal(issues.find((i) => i.key === "price")?.level, "required");
  const ok = checkSchema("Product", { name: "Trail shoe", price: "89.00", priceCurrency: "usd", availability: "InStock" });
  assert.equal(ok.filter((i) => i.level !== "recommended").length, 0);
  const s = buildSchema("Product", { name: "Trail shoe", price: "1,089.50", priceCurrency: "usd", availability: "InStock", gtin: "0123-4567-8901-2" }) as { offers: Record<string, unknown>; gtin: string };
  assert.equal(s.offers.price, 1089.5);
  assert.equal(s.offers.priceCurrency, "USD");
  assert.equal(s.offers.availability, "https://schema.org/InStock");
  assert.equal(s.gtin, "0123456789012");
  const bad = checkSchema("Product", { name: "X", price: "10", priceCurrency: "dollars", gtin: "123", ratingValue: "7" });
  assert.deepEqual(bad.filter((i) => i.level === "error").map((i) => i.key).sort(), ["gtin", "priceCurrency", "ratingValue", "reviewCount"]);
});

test("LocalBusiness: address, hours and location build the right shape", () => {
  const v = { subtype: "Dentist", name: "Bright Teeth", street: "1 Main St", city: "Austin", region: "TX", postalCode: "78701", country: "us", latitude: "30.26", longitude: "-97.74", hours: [{ days: ["Monday", "Tuesday"], opens: "09:00", closes: "17:00" }, { days: [], opens: "x", closes: "y" }] };
  const s = buildSchema("LocalBusiness", v) as { "@type": string; address: { addressCountry: string }; geo: unknown; openingHoursSpecification: unknown[] };
  assert.equal(s["@type"], "Dentist");
  assert.equal(s.address.addressCountry, "US");
  assert.deepEqual(s.geo, { "@type": "GeoCoordinates", latitude: 30.26, longitude: -97.74 });
  assert.equal(s.openingHoursSpecification.length, 1);
  assert.equal(checkSchema("LocalBusiness", { ...v, subtype: "Hacker", latitude: "" }).find((i) => i.key === "latitude")?.level, "error");
  assert.equal(buildSchema("LocalBusiness", { name: "X", subtype: "Hacker" })["@type"], "LocalBusiness");
  assert.equal(checkSchema("LocalBusiness", { name: "X" })[0].key, "street");
});

test("addresses and dates must be real, and lists split on commas or lines", () => {
  const issues = checkSchema("Organization", { name: "Acme", url: "acme.com", logo: "https://acme.com/logo.png", foundingDate: "May 2020", sameAs: "https://x.com/acme\nlinkedin" });
  assert.deepEqual(issues.filter((i) => i.level === "error").map((i) => i.key).sort(), ["foundingDate", "sameAs", "url"]);
  const s = buildSchema("Organization", { sameAs: "https://x.com/acme, https://linkedin.com/company/acme" }) as { sameAs: string[] };
  assert.equal(s.sameAs.length, 2);
});

test("the script tag can't be closed early by a value", () => {
  const out = schemaScript(buildSchema("Article", { headline: "</script><script>alert(1)</script>" }));
  assert.equal(out.match(/<\/script>/g)?.length, 1);
  assert.match(out, /^<script type="application\/ld\+json">/);
});
