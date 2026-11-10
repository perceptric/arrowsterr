import assert from "node:assert/strict";
import { test } from "node:test";
import { businesses, cityOf, localInsights, rankBands, mapOwners, parsePlaces, placeText, grid, isBusiness, listingCheck, localPrompts, phoneDigits, rankAt, reviewHistory, summarize, zoomFor, type Place } from "../src/lib/local.ts";

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
  assert.match(bad.find((c) => c.id === "phone")!.detail, /\(512\) 555-0142/);
  assert.equal(bad.find((c) => c.id === "name")!.label, "Name not on the website");
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

test("a date or zip code on the page is not read as a different phone number", () => {
  const l = { title: "Burger Place", phone: "+1 212-582-0238", address: "327 W 42nd St, New York, NY 10036", category: "Restaurant", categories: [] };
  const c = listingCheck(l, { text: "Burger Place since 2024120 NY 10036", phones: ["2024120"], schemaTypes: [], schemaPhone: null }, []);
  const phone = c.find((x) => x.id === "phone")!;
  assert.equal(phone.status, "warn");
  assert.equal(phone.label, "Phone not on the website");
});

test("places read as miles and a compass direction from the business", () => {
  assert.equal(placeText(24, 2), "at the business");
  assert.equal(placeText(17, 1), "1 mi north");
  assert.equal(placeText(31, 2), "2 mi south");
  assert.equal(placeText(30, 2), "2.8 mi south-west");
  assert.equal(placeText(0, 0.5), "2.1 mi north-west");
});

test("the map's owners and the scan's findings come from the points", () => {
  const top = (...t: string[]) => t.map((title) => ({ title, cid: null }));
  const points = Array.from({ length: 49 }, (_, i) => ({ i, rank: null as number | null, top: top("Holy Burger", "Canes", "McDonald's") }));
  points[30] = { i: 30, rank: 7, top: top("Holy Burger", "Canes", "McDonald's") };
  points[31] = { i: 31, rank: 16, top: top("Canes", "Holy Burger", "McDonald's") };
  const scan = {
    keyword: "fast food restaurant", size: 7, spacing: 2, points,
    rivals: [
      { title: "Holy Burger", cid: null, domain: null, category: null, rating: 4.8, reviews: 2140, top3: 49, seen: 49 },
      { title: "Canes", cid: null, domain: null, category: null, rating: 4.5, reviews: 900, top3: 49, seen: 49 },
    ],
    you: { rating: 4.1, reviews: 380 }, avg: 20.6, top3: 0, found: 2, read: 49,
  };
  const owners = mapOwners(scan, { title: "Burger King", cid: null });
  assert.equal(owners[0].title, "Holy Burger");
  assert.equal(owners[0].first, 48);
  assert.equal(owners[1].first, 1);
  assert.equal(owners.at(-1)!.you, true);
  const { headline, insights } = localInsights(scan, null, { title: "Burger King", cid: null });
  assert.match(headline, /Holy Burger holds the top 3 for “fast food restaurant” at 49 of 49 points\. You hold it at 0\./);
  const text = insights.map((x) => x.text).join(" | ");
  assert.match(text, /At your own address you're not in the top 20/);
  assert.match(text, /Your best spot is #7, 2\.8 mi south-west/);
  assert.match(text, /top 10 as far as 2\.8 mi out/);
  assert.match(text, /Holy Burger has 2,140 reviews to your 380/);
  assert.match(text, /Your rating is 4\.1, Holy Burger's is 4\.8/);
});

test("every business gets its rank at each point, the business itself always listed, map pack shares add up", () => {
  const me = place({ title: "Brightpath Dental", cid: "111", rank: 4, reviews: 80, rating: 4.6 });
  const a = place({ title: "Smile Co", cid: "222", rank: 1, reviews: 300, rating: 4.9, address: "1 Main St" });
  const b = place({ title: "Tooth Hub", cid: "333", rank: 2 });
  const c = place({ title: "Dent Plus", cid: "444", rank: 3 });
  const per = [
    { i: 0, results: [a, b, c, me] },
    { i: 1, results: [{ ...me, rank: 1 }, { ...a, rank: 2 }, { ...b, rank: 3 }, { ...a, rank: 5 }] },
    { i: 2, results: null },
    { i: 3, results: [a, b, c] },
  ];
  const list = businesses(per, { ...loc, address: "1200 Lamar Blvd" }, 2);
  const you = list.find((x) => x.you)!;
  assert.deepEqual(you.ranks, [4, 1, undefined, null]);
  assert.equal(you.avg, Math.round(((4 + 1 + 21) / 3) * 10) / 10);
  assert.equal(you.address, "1200 Lamar Blvd");
  const smile = list.find((x) => x.title === "Smile Co")!;
  assert.deepEqual(smile.ranks, [1, 2, undefined, 1], "listed twice at point 1, counted once at its best rank");
  assert.equal(list[0].title, "Smile Co");
  const total = list.reduce((s, x) => s + x.voice, 0);
  assert.ok(Math.abs(total - 1) < 1e-9, "map pack shares add up to 100%");
  assert.deepEqual(rankBands(you.ranks), { good: 1, average: 1, poor: 0, out: 1, read: 3 });
});
