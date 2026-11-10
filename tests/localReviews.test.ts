import assert from "node:assert/strict";
import { test } from "node:test";
import { checkThemes, isoOf, keywordMentions, keywordWords, mergeReviews, monthly, parseReviews, pullDepth, replyPrompt, reviewStats, themeShare, themeTable, toAnswer, writeReviewUrl, type SavedReview } from "../src/lib/localReviews.ts";

const NOW = Date.parse("2026-11-10T12:00:00Z");
const ago = (d: number) => new Date(NOW - d * 864e5).toISOString();
let n = 0;
const rev = (o: Partial<SavedReview> = {}): SavedReview => ({ id: `r${++n}`, rating: 5, text: "Great visit", postedAt: ago(10), author: "Ana", reply: null, repliedAt: null, url: null, cid: "1", title: "Northside Dental", you: true, themes: [], removedAt: null, ...o });

test("DataForSEO review items read as reviews, doubles dropped", () => {
  const r = parseReviews([
    { review_id: "A", rating: { value: 4 }, review_text: "Short wait, kind staff.", timestamp: "2026-10-01 09:30:00 +00:00", profile_name: "Ana Ruiz", owner_answer: "Thanks Ana!", owner_timestamp: "2026-10-02 10:00:00 +00:00", review_url: "https://g.co/r/A" },
    { review_id: "A", rating: { value: 1 } },
    { review_id: "B", rating: { value: "2" }, review_text: null, original_review_text: "Muy lento.", timestamp: "2026-09-01 08:00:00 +00:00" },
    { rating: { value: 5 } },
  ]);
  assert.equal(r.length, 2);
  assert.deepEqual(r[0], { id: "A", rating: 4, text: "Short wait, kind staff.", postedAt: "2026-10-01T09:30:00.000Z", author: "Ana Ruiz", reply: "Thanks Ana!", repliedAt: "2026-10-02T10:00:00.000Z", url: "https://g.co/r/A" });
  assert.equal(r[1].text, "Muy lento.");
  assert.equal(r[1].rating, 2);
  assert.equal(r[1].reply, null);
  assert.equal(isoOf("2026-01-24 13:17:33 +02:00"), "2026-01-24T11:17:33.000Z");
  assert.equal(isoOf("yesterday"), null);
});

test("a weekly pull never doubles a review, rethemes edits, and marks removed ones only where it looked", () => {
  const saved = [
    { id: "A", text: "Good", rating: 5, reply: null, repliedAt: null, postedAt: ago(5), removedAt: null },
    { id: "B", text: "Slow front desk", rating: 3, reply: null, repliedAt: null, postedAt: ago(20), removedAt: null },
    { id: "C", text: "Fine", rating: 4, reply: null, repliedAt: null, postedAt: ago(30), removedAt: null }, // gone from Google
    { id: "D", text: "Old one", rating: 5, reply: null, repliedAt: null, postedAt: ago(400), removedAt: null }, // older than the pull
  ];
  const pulled = [
    { id: "N", text: "New", rating: 5, postedAt: ago(1), author: null, reply: null, repliedAt: null, url: null },
    { id: "A", text: "Good", rating: 5, postedAt: ago(5), author: null, reply: "Thank you", repliedAt: ago(4), url: null },
    { id: "B", text: "Slow front desk, but the dentist was great", rating: 4, postedAt: ago(20), author: null, reply: null, repliedAt: null, url: null },
    { id: "E", text: "Older", rating: 5, postedAt: ago(60), author: null, reply: null, repliedAt: null, url: null },
  ];
  const m = mergeReviews(saved, pulled, false);
  assert.deepEqual(m.add.map((r) => r.id), ["N", "E"]);
  assert.deepEqual(m.change.map((c) => [c.review.id, c.retheme]), [["A", false], ["B", true]]);
  assert.deepEqual(m.removed, ["C"]);
  // A complete pull (fewer than asked for) can call any missing review removed.
  assert.deepEqual(mergeReviews(saved, pulled, true).removed, ["C", "D"]);
  // An empty answer removes nothing, and the same pull twice changes nothing.
  assert.deepEqual(mergeReviews(saved, [], true).removed, []);
  const again = mergeReviews(pulled.map((r) => ({ ...r, removedAt: null })), pulled, false);
  assert.deepEqual([again.add.length, again.change.length, again.removed.length], [0, 0, 0]);
  // A removed review that comes back is restored.
  assert.equal(mergeReviews([{ ...saved[0], removedAt: ago(2) }], [pulled[1]], false).change.length, 1);
  assert.equal(pullDepth(0), 200);
  assert.equal(pullDepth(12), 50);
});

test("themes need a listed name, a tone and a quote that's really in the review", () => {
  const text = "The wait time was over an hour. Dr. Lee was gentle and explained everything! Parking is a nightmare.";
  const kept = checkThemes(text, [
    { theme: "Wait time", tone: "complaint", quote: "wait time was over an hour" },
    { theme: "expertise", tone: "praise", quote: "“explained everything!”" },
    { theme: "Location and parking", tone: "complaint", quote: "parking is hard to find" }, // not in the review
    { theme: "Vibes", tone: "praise", quote: "Dr. Lee was gentle" }, // not on the list
    { theme: "Staff and friendliness", tone: "happy", quote: "Dr. Lee was gentle" }, // no tone
    { theme: "Comfort", tone: "praise", quote: "gentle" }, // one word
    { theme: "Wait time", tone: "complaint", quote: "over an hour" }, // same theme twice
  ]);
  assert.deepEqual(kept.map((k) => `${k.theme}:${k.tone}`), ["Wait time:complaint", "Expertise:praise"]);
  assert.equal(kept[1].quote, "explained everything!");
  assert.deepEqual(checkThemes(null, [{ theme: "Speed", tone: "praise", quote: "fast" }]), []);
  assert.deepEqual(checkThemes(text, "nonsense"), []);
});

test("numbers: reviews per month, 90 days, answered share, reply time, reviews to answer", () => {
  const list = [
    rev({ postedAt: "2026-11-02T10:00:00Z", rating: 5, reply: "Thanks", repliedAt: "2026-11-03T10:00:00Z" }),
    rev({ postedAt: "2026-10-20T10:00:00Z", rating: 2 }),
    rev({ postedAt: "2026-10-05T10:00:00Z", rating: 4, reply: "Thanks", repliedAt: "2026-10-08T10:00:00Z" }),
    rev({ postedAt: "2026-06-01T10:00:00Z", rating: 5 }),
    rev({ postedAt: "2026-10-10T10:00:00Z", rating: 1, removedAt: ago(1) }), // removed: left out
    rev({ postedAt: "2025-01-01T10:00:00Z", rating: 1 }), // older than 12 months
    rev({ postedAt: "2026-09-01T10:00:00Z", you: false, cid: "2" }),
  ];
  const mine = list.filter((r) => r.you);
  assert.deepEqual(monthly(mine, 6, NOW), [
    { month: "2026-06", count: 1 },
    { month: "2026-07", count: 0 },
    { month: "2026-08", count: 0 },
    { month: "2026-09", count: 0 },
    { month: "2026-10", count: 2 },
    { month: "2026-11", count: 1 },
  ]);
  const s = reviewStats(mine, NOW);
  assert.equal(s.in90, 3);
  assert.equal(s.rating90, 3.7);
  assert.equal(s.replyShare, 50); // 2 of the 4 live reviews from the last 12 months
  assert.equal(s.replyDays, 2); // 1 day and 3 days
  assert.equal(s.unanswered, 2);
  assert.deepEqual(toAnswer(list, NOW).map((r) => r.postedAt), ["2026-10-20T10:00:00Z", "2026-06-01T10:00:00Z"]); // 2 stars before 5
  assert.deepEqual(reviewStats([], NOW), { in90: 0, rating90: null, replyShare: null, replyDays: null, unanswered: 0 });
});

test("theme shares need 5 read reviews a side, and keep your quotes", () => {
  const wait = { theme: "Wait time", tone: "complaint" as const, quote: "waited an hour" };
  const staff = { theme: "Staff and friendliness", tone: "praise" as const, quote: "so kind" };
  const mine = [rev({ themes: [wait] }), rev({ themes: [wait, staff] }), rev({ themes: [] }), rev({ themes: [] }), rev({ themes: null }), rev({ themes: [wait] })];
  const theirs = Array.from({ length: 20 }, (_, i) => rev({ you: false, cid: "2", themes: i < 2 ? [wait] : i < 12 ? [staff] : [] }));
  const rows = themeTable(mine, theirs, NOW);
  const w = rows.find((r) => r.theme === "Wait time")!;
  assert.deepEqual([w.you, w.leaders], [{ n: 3, of: 5 }, { n: 2, of: 20 }]);
  assert.equal(themeShare(w.you), 60);
  assert.equal(themeShare(w.leaders), 10);
  assert.deepEqual(w.quotes, ["waited an hour"]);
  assert.equal(themeShare({ n: 2, of: 4 }), null);
  assert.equal(rows[0].theme, "Wait time");
});

test("keyword words show where a leader's reviews use them more", () => {
  const words = keywordWords(["emergency dentist near me", "best dentist austin", "teeth whitening"], "Austin");
  assert.deepEqual(words, ["emergency", "dentist", "teeth", "whitening"]);
  const groups = [
    { title: "Northside Dental", you: true, reviews: [rev({ text: "Emergency visit on a Sunday" })] },
    { title: "Bright Smile", you: false, reviews: [rev({ text: "emergency crown" }), rev({ text: "Emergencies handled fast" }), rev({ text: "EMERGENCY help" }), rev({ text: "whitening was great" })] },
  ];
  const rows = keywordMentions(words, groups, NOW);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].word, "emergency");
  assert.deepEqual([rows[0].top!.title, rows[0].top!.n, rows[0].you.n], ["Bright Smile", 3, 1]);
});

test("the review link, and a reply prompt that never offers money", () => {
  assert.equal(writeReviewUrl("ChIJ a+b"), "https://search.google.com/local/writereview?placeid=ChIJ%20a%2Bb");
  const low = replyPrompt({ business: "Northside Dental", review: { rating: 2, text: "Waited an hour.", author: "Ana" }, voice: "Tone: warm.", phone: "(512) 555-0142" });
  assert.match(low, /Apologize once/);
  assert.match(low, /555-0142/);
  assert.match(low, /Never offer money/);
  assert.match(low, /Tone: warm/);
  const high = replyPrompt({ business: "Northside Dental", review: { rating: 5, text: null, author: null }, voice: "" });
  assert.doesNotMatch(high, /Apologize/);
  assert.match(high, /rating only/);
});
