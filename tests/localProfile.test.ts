import assert from "node:assert/strict";
import { test } from "node:test";
import { hoursOf, leaders, needsConfirm, parseInfo, parsePosts, parseQuestions, postsWithin, profileChanges, profileGaps, profileScore, type Profile } from "../src/lib/localProfile.ts";

const NOW = Date.parse("2026-11-10T12:00:00Z");
const base = (o: Partial<Profile> = {}): Profile => ({ cid: "1", placeId: null, title: "Northside Dental", category: "Dentist", categories: [], phone: "(512) 555-0142", website: "https://northside.example", address: "4401 Berkman Dr", description: "x".repeat(300), hours: ["monday 09:00-17:00"], photos: 40, rating: 4.8, reviews: 412, attributes: [], bookingUrl: null, claimed: true, posts: [], questions: { total: 2, unanswered: 0 }, ...o });

test("a DataForSEO business item reads as a profile", () => {
  const p = parseInfo({
    title: "Bright Smile", cid: "222", place_id: "ChIJ", category: "Dentist", additional_categories: ["Emergency dental service", null, "Teeth whitening service"],
    phone: "+15125550100", url: "https://bright.example", address: "1 Main St", description: "We care.", total_photos: 311, rating: { value: 4.9, votes_count: 1040 },
    attributes: { available_attributes: { accessibility: ["has_wheelchair_accessible_entrance"], planning: ["accepts_reservations", "has_wheelchair_accessible_entrance"] } },
    work_time: { work_hours: { timetable: { monday: [{ open: { hour: 9, minute: 0 }, close: { hour: 17, minute: 30 } }], saturday: [] } } },
    book_online_url: "https://book.example", is_claimed: true,
  })!;
  assert.deepEqual(p.categories, ["Emergency dental service", "Teeth whitening service"]);
  assert.equal(p.photos, 311);
  assert.equal(p.reviews, 1040);
  assert.deepEqual(p.attributes, ["has_wheelchair_accessible_entrance", "accepts_reservations"]);
  assert.equal(p.hours[0], "monday 09:00-17:30");
  assert.equal(p.hours[5], "saturday closed");
  assert.equal(parseInfo({ cid: "x" }), null);
  assert.deepEqual(hoursOf(null), []);
});

test("posts and questions read, and unknown stays unknown", () => {
  assert.deepEqual(parsePosts([{ timestamp: "2026-11-01 10:00:00 +00:00" }, { timestamp: "2026-11-08 10:00:00 +00:00" }, { timestamp: "junk" }]), ["2026-11-08 10:00:00 +00:00", "2026-11-01 10:00:00 +00:00"]);
  assert.deepEqual(parseQuestions({ items: [{ items: [{}] }, { items: [] }], items_without_answers: [{}, {}] }), { total: 4, unanswered: 3 });
  assert.equal(postsWithin({ posts: null }, 30, NOW), null);
  assert.equal(postsWithin({ posts: ["2026-11-05T00:00:00Z", "2026-09-01T00:00:00Z"] }, 30, NOW), 1);
});

test("gaps need at least 2 of the 3 leaders, and the score never drops for what wasn't read", () => {
  const you = base({ posts: [], questions: { total: 5, unanswered: 3 } });
  const rivals = [
    base({ cid: "a", categories: ["Emergency dental service", "Pediatric dentist"], photos: 311, bookingUrl: "x", posts: ["2026-11-06T00:00:00Z"], attributes: ["accepts_reservations"] }),
    base({ cid: "b", categories: ["Emergency dental service"], photos: 148, bookingUrl: "x", posts: ["2026-11-02T00:00:00Z"], attributes: ["accepts_reservations"] }),
    base({ cid: "c", categories: ["Teeth whitening service"], photos: 96, posts: [] }),
  ];
  const ids = profileGaps(you, rivals, NOW).map((g) => g.id);
  assert.ok(ids.includes("category:emergency dental service"));
  assert.ok(!ids.includes("category:pediatric dentist"), "only one leader lists it");
  for (const id of ["questions", "posts", "booking", "photos", "attributes"]) assert.ok(ids.includes(id), id);
  assert.ok(!ids.includes("hours") && !ids.includes("description"));
  const low = profileScore(you, rivals, NOW);
  const unknown = profileScore(base({ posts: null, questions: null, photos: null, categories: ["Emergency dental service", "Teeth whitening service"], bookingUrl: "x" }), rivals, NOW);
  assert.ok(low < unknown, `${low} < ${unknown}`);
  assert.equal(profileGaps(base({ claimed: false }), rivals, NOW)[0].id, "claim");
});

test("a change counts only when the two newest reads agree on it", () => {
  const r = (at: string, o: Partial<Profile>) => ({ at, profile: base(o) });
  const sat = (h: string) => ({ hours: ["monday 09:00-17:00", `saturday ${h}`] });
  // One odd read: not a change.
  assert.deepEqual(profileChanges([r("2026-11-10", sat("09:00-13:00")), r("2026-11-03", sat("09:00-17:00")), r("2026-10-27", sat("09:00-17:00"))]), []);
  assert.equal(needsConfirm([r("2026-11-10", sat("09:00-13:00")), r("2026-11-03", sat("09:00-17:00"))]), true);
  // Confirmed the next day: a change.
  const c = profileChanges([r("2026-11-11", sat("09:00-13:00")), r("2026-11-10", sat("09:00-13:00")), r("2026-11-03", sat("09:00-17:00"))]);
  assert.equal(c.length, 1);
  assert.equal(c[0].label, "Hours");
  assert.match(c[0].before, /saturday 09:00-17:00/);
  assert.equal(c[0].confirmedAt, "2026-11-11");
  // A read that flips back is never a change.
  assert.deepEqual(profileChanges([r("2026-11-11", sat("09:00-17:00")), r("2026-11-10", sat("09:00-13:00")), r("2026-11-03", sat("09:00-17:00"))]), []);
});

test("the leaders are the competitors with the most top 3 spots across keywords", () => {
  const l = leaders([
    { rivals: [{ title: "A", cid: "a", top3: 10 }, { title: "B", cid: "b", top3: 5 }, { title: "N", cid: null, top3: 40 }] },
    { rivals: [{ title: "B", cid: "b", top3: 9 }, { title: "C", cid: "c", top3: 1 }, { title: "D", cid: "d", top3: 0 }] },
  ]);
  assert.deepEqual(l.map((x) => x.cid), ["b", "a", "c"]);
});
