import assert from "node:assert/strict";
import { test } from "node:test";
import { cityOf, parsePlaces, grid, isBusiness, listingCheck, localPrompts, phoneDigits, rankAt, reviewHistory, summarize, zoomFor, type Place } from "../src/lib/local.ts";

const place = (o: Partial<Place> & { title: string; rank: number }): Place => ({ cid: null, placeId: null, domain: null, address: null, phone: null, category: null, categories: [], rating: null, reviews: null, lat: null, lng: null, ...o });
const loc = { title: "Brightpath Dental", cid: "111", placeId: "ChIJ-a", domain: "brightpathdental.com" };

test("the grid is 7 by 7, centred on the business, 1 mile apart at Austin's latitude", () => {
  const g = grid(30.2672, -97.7431, 1);
  assert.equal(g.length, 49);
  assert.deepEqual([g[24].lat, g[24].lng], [30.2672, -97.7431]);
  assert.ok(g[0].lat > g[48].lat && g[0].lng < g[48].lng, "north-west first, south-east last");
  const dLat = g[17].lat - g[24].lat; // one row north
  assert.ok(Math.abs(dLat * 69 - 1) < 0.01);
  const dLng = g[25].lng - g[24].lng; // one column east
  assert.ok(Math.abs(dLng * 69.172 * Math.cos((30.2672 * Math.PI) / 180) - 1) < 0.01);
  assert.equal(zoomFor(0.5), 15);
  assert.equal(zoomFor(2), 13);
});

test("the business is found by its Google ids first, then by website and name together", () => {
  assert.equal(isBusiness(place({ title: "Other name", cid: "111", rank: 1 }), loc), true);
  assert.equal(isBusiness(place({ title: "Brightpath Dental", cid: "999", rank: 1 }), loc), false, "a different cid is a different business, whatever its name");
  assert.equal(isBusiness(place({ title: "Brightpath Dental", domain: "www.brightpathdental.com", rank: 1 }), { ...loc, cid: null, placeId: null }), true);
  assert.equal(isBusiness(place({ title: "Brightpath Kids", domain: "brightpathdental.com", rank: 1 }), { ...loc, cid: null, placeId: null }), false);
});

test("a business listed twice counts once, at its best rank", () => {
  assert.equal(rankAt([place({ title: "A", rank: 1 }), place({ title: "Brightpath", cid: "111", rank: 6 }), place({ title: "Brightpath", cid: "111", rank: 3 })], loc), 3);
  assert.equal(rankAt([place({ title: "A", rank: 1 })], loc), null);
});

test("a scan: failed points are left out, not found counts as 21, rivals ranked by top 3 share", () => {
  const smile = (rank: number) => place({ title: "SmileWorks", cid: "222", category: "Emergency dental service", reviews: 480, rating: 4.6, rank });
  const per = [
    { i: 0, results: [smile(1), place({ title: "Brightpath", cid: "111", rank: 2, reviews: 212, rating: 4.8 }), place({ title: "Dentora", cid: "333", rank: 3 })] },
    { i: 1, results: [smile(1), smile(4), place({ title: "Dentora", cid: "333", rank: 2 }), place({ title: "Lakeline", cid: "444", rank: 3 })] },
    { i: 2, results: [] },
    { i: 3, results: null },
  ];
  const s = summarize("emergency dentist", 1, per, loc);
  assert.equal(s.read, 3);
  assert.equal(s.points.find((p) => p.i === 3)?.error, true);
  assert.equal(s.avg, Math.round(((2 + 21 + 21) / 3) * 10) / 10);
  assert.equal(s.top3, 1);
  assert.equal(s.found, 1);
  assert.deepEqual(s.you, { rating: 4.8, reviews: 212 });
  assert.equal(s.rivals[0].title, "SmileWorks");
  assert.equal(s.rivals[0].top3, 2, "listed twice at one point still counts once");
  assert.equal(s.rivals[0].seen, 2);
  assert.deepEqual(s.points.find((p) => p.i === 1)?.top.map((t) => t.title), ["SmileWorks", "Dentora", "Lakeline"]);
});

test("a scan where every point failed has no average", () => {
  const s = summarize("x", 1, [{ i: 0, results: null }], loc);
  assert.equal(s.avg, null);
  assert.equal(s.read, 0);
});

test("phone numbers match across formats", () => {
  assert.equal(phoneDigits("(512) 555-0124"), "5125550124");
  assert.equal(phoneDigits("+1 512.555.0124"), "5125550124");
  assert.equal(phoneDigits("tel:+44 20 7946 0958"), "442079460958");
  assert.equal(phoneDigits(null), "");
});

test("the listing check compares name, phone, street, schema and the rivals' category", () => {
  const l = { title: "Brightpath Dental", phone: "(512) 555-0124", address: "1200 Lamar Blvd, Austin, TX 78703", category: "Dentist", categories: [] };
  const rivals = [{ category: "Emergency dental service", top3: 9 }, { category: "Dentist", top3: 2 }];
  const good = listingCheck(l, { text: "Brightpath Dental, 1200 Lamar Blvd. Call 512-555-0124", phones: ["+1 512 555 0124"], schemaTypes: ["Dentist"], schemaPhone: null }, rivals);
  assert.deepEqual(good.map((c) => c.status), ["pass", "pass", "pass", "pass", "warn"]);
  assert.match(good[4].detail, /Emergency dental service/);
  const bad = listingCheck(l, { text: "Welcome", phones: ["512-555-0142"], schemaTypes: [], schemaPhone: null }, []);
  assert.equal(bad.find((c) => c.id === "phone")!.status, "fail");
  assert.match(bad.find((c) => c.id === "phone")!.detail, /5125550142/);
  assert.equal(bad.find((c) => c.id === "schema")!.status, "fail");
  assert.equal(bad.find((c) => c.id === "category")!.status, "pass", "no rival data, nothing to compare");
});

test("review history lines up scans oldest first, and local prompts use category and city", () => {
  const h = reviewHistory([{ at: "2026-11-08", you: { rating: 4.8, reviews: 215 }, rivals: [{ title: "SmileWorks", reviews: 490 }] }, { at: "2026-11-01", you: { rating: 4.8, reviews: 212 }, rivals: [] }], ["SmileWorks"]);
  assert.deepEqual(h.map((x) => [x.at, x.you, x.rivals.SmileWorks]), [["2026-11-01", 212, null], ["2026-11-08", 215, 490]]);
  assert.deepEqual(localPrompts({ category: "Dentist", city: "Austin" }, ["emergency dentist near me"]).slice(0, 3), ["best dentist in Austin", "which dentist in Austin do people recommend", "best emergency dentist in Austin"]);
  assert.deepEqual(localPrompts({ category: "Dentist", city: null }, []), []);
});

test("Google Maps items read as places, and the city comes from the address", () => {
  const [p] = parsePlaces([{ type: "maps_search", rank_group: 2, title: "Brightpath Dental", cid: "111", place_id: "ChIJ-a", domain: "brightpathdental.com", address: "1200 Lamar Blvd, Austin, TX 78703", phone: "+1 512-555-0124", category: "Dentist", additional_categories: ["Cosmetic dentist"], rating: { value: 4.8, votes_count: 212, rating_max: 5 }, latitude: 30.27, longitude: -97.75 }, { type: "maps_paid_item", title: "Ad" }]);
  assert.deepEqual([p.title, p.cid, p.rank, p.rating, p.reviews, p.categories[0]], ["Brightpath Dental", "111", 2, 4.8, 212, "Cosmetic dentist"]);
  assert.equal(parsePlaces([{ type: "maps_paid_item", title: "Ad" }]).length, 0);
  assert.equal(cityOf("1200 Lamar Blvd, Austin, TX 78703"), "Austin");
  assert.equal(cityOf("221B Baker St, London NW1 6XE, United Kingdom"), "London");
  assert.equal(cityOf("Somewhere"), null);
});
