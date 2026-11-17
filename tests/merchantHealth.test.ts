import assert from "node:assert/strict";
import { test } from "node:test";
import { feedHealth, healthAdd, healthDone, healthStart, itemStatus, missingOf, type HealthProduct } from "../src/lib/merchantHealth.ts";

// Products as the Merchant API (products v1) lists them.
const full = { title: "Trail shoe", description: "Light trail shoe", brand: "Acme", gtins: ["00012345678905"], price: { amountMicros: "99000000", currencyCode: "USD" }, availability: "IN_STOCK", imageLink: "https://x.test/a.jpg" };
const ok: HealthProduct = { offerId: "a1", productAttributes: full, productStatus: { destinationStatuses: [{ reportingContext: "SHOPPING_ADS", approvedCountries: ["US"] }, { reportingContext: "FREE_LISTINGS", approvedCountries: ["US"] }], itemLevelIssues: [] } };
const limited: HealthProduct = {
  offerId: "b2",
  productAttributes: { ...full, title: "Rain jacket", gtins: [], description: "" },
  productStatus: {
    destinationStatuses: [{ reportingContext: "SHOPPING_ADS", approvedCountries: ["US"], disapprovedCountries: ["DE"] }],
    itemLevelIssues: [
      { code: "missing_gtin", severity: "DEMOTED", attribute: "gtin", reportingContext: "SHOPPING_ADS", description: "Missing GTIN", documentation: "https://support.google.com/merchants/answer/6324461" },
      { code: "missing_gtin", severity: "DEMOTED", attribute: "gtin", reportingContext: "FREE_LISTINGS", description: "Missing GTIN" },
    ],
  },
};
const blocked: HealthProduct = {
  name: "accounts/1/products/en~US~c3",
  productAttributes: { title: "Old hat", gtins: [], identifierExists: false, availability: "AVAILABILITY_UNSPECIFIED" },
  productStatus: {
    destinationStatuses: [{ reportingContext: "SHOPPING_ADS", disapprovedCountries: ["US"] }],
    itemLevelIssues: [
      { code: "image_link_broken", severity: "DISAPPROVED", attribute: "image link", description: "Invalid image", documentation: "javascript:alert(1)" },
      { code: "missing_gtin", severity: "NOT_IMPACTED", description: "Missing GTIN" },
    ],
  },
};
const waiting: HealthProduct = { offerId: "d4", productAttributes: full, productStatus: { destinationStatuses: [{ reportingContext: "SHOPPING_ADS", pendingCountries: ["US"] }] } };

test("itemStatus: approved, limited, disapproved and pending", () => {
  assert.equal(itemStatus(ok), "approved");
  assert.equal(itemStatus(limited), "limited");
  assert.equal(itemStatus(blocked), "disapproved");
  assert.equal(itemStatus(waiting), "pending");
  assert.equal(itemStatus({}), "pending");
  // A demoting issue alone also limits an approved item.
  assert.equal(itemStatus({ productStatus: { destinationStatuses: [{ approvedCountries: ["US"] }], itemLevelIssues: [{ code: "x", severity: "DEMOTED" }] } }), "limited");
});

test("missingOf: the details AI shopping answers need", () => {
  assert.deepEqual(missingOf(ok), []);
  assert.deepEqual(missingOf(limited), ["gtin", "description"]);
  // No GTIN is fine when the item says it has none; an unspecified availability counts as missing.
  assert.deepEqual(missingOf(blocked), ["brand", "price", "availability", "image", "description"]);
  // The older field names still read.
  assert.deepEqual(missingOf({ attributes: { ...full, gtins: undefined, gtin: "00012345678905" } }), []);
});

test("feedHealth: counts, top issues by severity then size, and examples", () => {
  const h = feedHealth([ok, limited, blocked, waiting]);
  assert.equal(h.items, 4);
  assert.deepEqual(h.status, { approved: 1, limited: 1, disapproved: 1, pending: 1 });
  assert.deepEqual(
    h.issues.map((i) => [i.code, i.severity, i.items]),
    [
      ["image_link_broken", "disapproved", 1],
      ["missing_gtin", "demoted", 2],
    ],
  );
  const gtin = h.issues.find((i) => i.code === "missing_gtin")!;
  assert.equal(gtin.doc, "https://support.google.com/merchants/answer/6324461");
  assert.equal(gtin.attribute, "gtin");
  assert.deepEqual(gtin.examples.map((x) => x.id), ["b2", "en~US~c3"]);
  // Only https links are kept.
  assert.equal(h.issues[0].doc, null);
  assert.equal(h.missing.gtin.items, 1);
  assert.equal(h.missing.description.items, 2);
  assert.deepEqual(h.missing.description.examples.map((x) => x.title), ["Rain jacket", "Old hat"]);
  assert.equal(h.missing.price.items, 1);
});

test("healthAdd: page by page gives the same answer, and examples stop at three", () => {
  const acc = healthStart();
  for (let i = 0; i < 5; i++) healthAdd(acc, [{ ...limited, offerId: `p${i}` }]);
  const h = healthDone(acc);
  assert.equal(h.items, 5);
  assert.equal(h.issues[0].items, 5);
  assert.equal(h.issues[0].examples.length, 3);
  assert.equal(h.missing.gtin.examples.length, 3);
  assert.equal(healthDone(acc, 0).issues.length, 0);
});
