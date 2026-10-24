import { test } from "node:test";
import assert from "node:assert/strict";
import { areaPoints, gridPoints, metersBetween, parseConfig, pointInPolygon, spacingForArea, MAX_PINS } from "../src/lib/geo.ts";
import { findRank, isTarget, normName, organicRank, parseMaps, parseOrganic, sameSite, type Listing } from "../src/lib/match.ts";
import { band, competitorRanks, summarize, NOT_FOUND } from "../src/lib/metrics.ts";
import { alertsFor, needsRecheck, pinChange } from "../src/lib/compare.ts";
import { dataForSeo } from "../src/lib/dataforseo.ts";
import { demoProvider } from "../src/lib/demo.ts";
import { nextRun } from "../src/lib/scans.ts";

const center = { lat: 41.8781, lng: -87.6298 };

test("a grid is odd, centered and evenly spaced", () => {
  const pins = gridPoints(center, 5, 1000);
  assert.equal(pins.length, 25);
  const mid = pins[12];
  assert.deepEqual([mid.row, mid.col], [2, 2]);
  assert.ok(metersBetween(mid, center) < 1);
  assert.ok(Math.abs(metersBetween(pins[12], pins[13]) - 1000) < 2);
  assert.ok(Math.abs(metersBetween(pins[12], pins[7]) - 1000) < 2);
  assert.ok(pins[0].lat > pins[24].lat && pins[0].lng < pins[24].lng, "row 0 is north, col 0 is west");
  assert.equal(gridPoints(center, 21, 500).length, MAX_PINS);
  assert.throws(() => gridPoints(center, 4, 1000), /odd number/);
  assert.throws(() => gridPoints(center, 23, 1000), /odd number/);
  assert.throws(() => gridPoints(center, 5, 50), /spacing/);
});

test("an area scan keeps only pins inside the drawn shape", () => {
  // A triangle about 6 km on a side.
  const tri = [
    { lat: 41.9, lng: -87.7 },
    { lat: 41.9, lng: -87.63 },
    { lat: 41.85, lng: -87.7 },
  ];
  const pins = areaPoints(tri, 800);
  assert.ok(pins.length > 5);
  assert.ok(pins.every((p) => pointInPolygon(p, tri)));
  assert.throws(() => areaPoints(tri, 100), /needs \d+ pins/);
  const s = spacingForArea(tri);
  assert.ok(areaPoints(tri, s).length <= MAX_PINS);
  assert.throws(() => areaPoints(tri.slice(0, 2), 800), /at least 3/);
});

test("configs from the browser are checked", () => {
  assert.equal(parseConfig({ shape: "grid", size: 7, spacing_m: 800, center }).shape, "grid");
  assert.throws(() => parseConfig({ shape: "grid", size: 7, spacing_m: 800, center: { lat: "x", lng: 1 } }), /center/);
  assert.throws(() => parseConfig({ shape: "grid", size: 8, spacing_m: 800, center }), /odd/);
});

const L = (rank: number, o: Partial<Listing> = {}): Listing => ({ rank, title: "Other", domain: "", cid: "", place_id: "", rating: null, reviews: null, category: "", address: "", lat: null, lng: null, ...o });
const target = { name: "Joe's Pizza Palace", domain: "joespizza.com", cid: "111", place_id: "" };

test("the business is matched by ID first, never by name alone when IDs disagree", () => {
  assert.ok(isTarget(L(1, { title: "Totally different", cid: "111" }), target));
  assert.ok(!isTarget(L(1, { title: "Joe's Pizza Palace", cid: "222" }), target), "same name, other location");
  assert.ok(isTarget(L(1, { title: "Joes Pizza Palace LLC", domain: "www.joespizza.com" }), { ...target, cid: "" }));
  assert.ok(!isTarget(L(1, { title: "Joe's Pizza Palace", domain: "joespizza.co" }), { ...target, cid: "" }), "look-alike domain");
  assert.ok(!isTarget(L(1, { title: "Joe's Pizza", domain: "joespizza.com" }), { ...target, cid: "" }), "name must match");
  assert.equal(normName("Café & Bar, Inc."), "cafe and bar");
  assert.ok(sameSite("order.joespizza.com", "joespizza.com"));
  assert.ok(!sameSite("notjoespizza.com", "joespizza.com"));
  assert.equal(findRank([L(1), L(2, { cid: "111" })], target), 2);
  assert.equal(findRank([L(1), L(2)], target), null);
  assert.equal(organicRank([{ rank: 4, domain: "joespizza.com", url: "", title: "" }], "www.joespizza.com"), 4);
  assert.equal(organicRank([{ rank: 4, domain: "joespizza.com", url: "", title: "" }], ""), null);
});

test("DataForSEO items parse into Maps, Local Pack and organic, skipping ads", () => {
  const maps = parseMaps([
    { type: "maps_paid_item", rank_group: 1, title: "Ad" },
    { type: "maps_search", rank_group: 2, title: "B", cid: "2", rating: { value: 4.2, votes_count: 10 } },
    { type: "maps_search", rank_group: 1, title: "A", cid: "1", domain: "www.a.com", latitude: 1, longitude: 2 },
  ]);
  assert.deepEqual(maps.map((m) => [m.rank, m.title, m.domain]), [[1, "A", "a.com"], [2, "B", ""]]);
  assert.equal(maps[1].reviews, 10);
  const { pack, organic } = parseOrganic([
    { type: "local_pack", rank_group: 2, title: "P2", cid: "9" },
    { type: "local_pack", rank_group: 1, title: "Paid", is_paid: true },
    { type: "local_pack", rank_group: 3, title: "P3" },
    { type: "organic", rank_group: 2, domain: "b.com", url: "https://b.com" },
    { type: "organic", rank_group: 1, domain: "a.com", url: "https://a.com" },
  ]);
  assert.deepEqual(pack.map((p) => [p.rank, p.title]), [[1, "P2"], [2, "P3"]]);
  assert.deepEqual(organic.map((o) => [o.rank, o.domain]), [[1, "a.com"], [2, "b.com"]]);
});

test("the DataForSEO client posts coordinates and reads waiting, done and failed tasks", async () => {
  const sent: { url: string; body: unknown }[] = [];
  const replies: unknown[] = [
    { status_code: 20000, tasks: [{ id: "t1", status_code: 20100 }, { status_code: 40501, status_message: "Invalid Field" }] },
    { status_code: 20000, tasks: [{ id: "t1", status_code: 40602, status_message: "Task In Queue" }] },
    { status_code: 20000, tasks: [{ id: "t1", status_code: 20000, result: [{ items: [{ type: "maps_search", rank_group: 1, title: "A", cid: "111" }] }] }] },
    { status_code: 20000, tasks: [{ id: "t2", status_code: 40102, status_message: "No Search Results" }] },
  ];
  const fake = (async (url: string, init: RequestInit) => {
    sent.push({ url, body: init.body ? JSON.parse(String(init.body)) : null });
    return new Response(JSON.stringify(replies.shift()), { status: 200 });
  }) as typeof fetch;
  const dfs = dataForSeo({ login: "l", password: "p", fetch: fake });
  const spec = { tag: "1:maps", keyword: "pizza near me", lat: 41.8781234567, lng: -87.6298, zoom: 15, priority: 1 as const };
  const posted = await dfs.post("maps", [spec, spec]);
  assert.deepEqual(posted, [{ id: "t1" }, { error: "Invalid Field" }]);
  const body = (sent[0].body as Record<string, unknown>[])[0];
  assert.equal(body.location_coordinate, "41.8781235,-87.6298000,15z");
  assert.equal(body.search_places, false);
  assert.match(sent[0].url, /serp\/google\/maps\/task_post$/);
  assert.deepEqual(await dfs.get("maps", "t1"), { state: "waiting" });
  const done = await dfs.get("maps", "t1");
  assert.equal(done.state === "done" && done.maps?.[0].cid, "111");
  assert.deepEqual(await dfs.get("organic", "t2"), { state: "failed", error: "No Search Results" });
  assert.match(sent[3].url, /serp\/google\/organic\/task_get\/advanced\/t2$/);
});

test("demo data is stable and places the business", async () => {
  let now = 0;
  const demo = demoProvider({ delayMs: 10, now: () => now });
  const spec = { tag: "x", keyword: "pizza delivery near me", lat: 41.88, lng: -87.63, zoom: 15, priority: 1 as const, target: { name: "Joe's", domain: "joes.example", cid: "42", lat: 41.88, lng: -87.63 } };
  const [p] = await demo.post("maps", [spec]);
  assert.ok("id" in p);
  assert.deepEqual(await demo.get("maps", p.id), { state: "waiting" });
  now = 20;
  const a = await demo.get("maps", p.id);
  const b = await demo.get("maps", p.id);
  assert.deepEqual(a, b);
  assert.ok(a.state === "done" && a.maps!.some((l) => l.cid === "42"));
});

const pinR = (idx: number, maps: number | null, top: Listing[] = [], pack: number | null = null, org: number | null = null) => ({
  idx,
  maps_rank: maps,
  pack_rank: pack,
  organic_rank: org,
  maps_top: top,
  maps_done: true,
  organic_done: true,
});

test("summaries average found pins and count unfound pins as 21", () => {
  const rival = L(1, { title: "Rival", cid: "999" });
  const s = summarize(
    [pinR(0, 2, [rival, L(2, { cid: "111", title: "Joe" })], 1, 5), pinR(1, null, [rival], null, null), pinR(2, 4, [L(1, { title: "X", cid: "5" }), L(4, { cid: "111", title: "Joe" })], 2, 12)],
    target,
  );
  assert.equal(s.maps.avg_found, 3);
  assert.equal(s.maps.avg_all, Math.round(((2 + NOT_FOUND + 4) / 3) * 10) / 10);
  assert.equal(s.maps.top3, 1);
  assert.equal(s.maps.solv, 33.3);
  assert.equal(s.pack.in_pack, 2);
  assert.equal(s.organic.top10, 1);
  assert.equal(s.competitors[0].name, "Rival");
  assert.equal(s.competitors[0].solv, 66.7);
  assert.ok(s.competitors.find((c) => c.is_target));
  assert.deepEqual([...competitorRanks([pinR(0, 2, [rival]), pinR(1, null, [])], "cid:999")], [[0, 1], [1, null]]);
  assert.deepEqual([band(1), band(7), band(15), band(21), band(null)], ["top", "mid", "low", "out", "none"]);
});

test("rechecks fire on big jumps only, and alerts fire on drops", () => {
  assert.equal(needsRecheck(undefined, 15), false, "no previous pin");
  assert.equal(needsRecheck(3, 8), false);
  assert.equal(needsRecheck(3, 9), true);
  assert.equal(needsRecheck(null, 10), true, "from not found (21) to 10");
  assert.equal(needsRecheck(18, null), false, "18 to not found is a small move");
  assert.equal(pinChange(5, 2), 3);
  assert.equal(pinChange(null, 3), 18);
  const base = summarize([pinR(0, 2), pinR(1, 3), pinR(2, 1, [], 1)], target);
  const worse = summarize([pinR(0, 9), pinR(1, 12), pinR(2, 4, [], null)], target);
  const kinds = alertsFor("pizza", base, worse).map((a) => a.kind);
  assert.deepEqual(kinds, ["avg_drop", "top3_lost", "pack_lost"]);
  assert.deepEqual(alertsFor("pizza", worse, base), []);
  assert.deepEqual(alertsFor("pizza", null, base), []);
});

test("schedules move past now and keep their time of day", () => {
  const from = new Date("2026-10-01T09:00:00Z");
  assert.equal(nextRun(from, "daily", new Date("2026-10-05T10:00:00Z")).toISOString(), "2026-10-06T09:00:00.000Z");
  assert.equal(nextRun(from, "weekly", new Date("2026-10-01T09:30:00Z")).toISOString(), "2026-10-08T09:00:00.000Z");
  assert.equal(nextRun(from, "monthly", new Date("2026-10-01T09:30:00Z")).toISOString(), "2026-11-01T09:00:00.000Z");
});
