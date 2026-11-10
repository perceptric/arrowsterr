// Local Research, phase 3 (docs/local-research-plan.md, 4.5): Google reviews for a location's business and the 3
// competitors with the most top 3 spots. Saved by review id, so a weekly pull never doubles one; a review that
// disappears is marked removed, never deleted. Haiku tags themes with a quote, and code keeps a theme only when the
// quote is really in the review. Pure: DataForSEO answers in, facts out.

import { normQuote } from "./perception.ts";

export type Review = {
  /** Google's review id. */
  id: string;
  rating: number | null;
  text: string | null;
  postedAt: string | null;
  author: string | null;
  reply: string | null;
  repliedAt: string | null;
  url: string | null;
};

export type ThemeHit = { theme: string; tone: "praise" | "complaint"; quote: string };

/** A saved review, as the screen reads it. `themes` is null until Haiku has read it. */
export type SavedReview = Review & { cid: string; title: string; you: boolean; themes: ThemeHit[] | null; removedAt: string | null };

const str = (v: unknown, n = 5000) => (typeof v === "string" && v.trim() ? v.trim().slice(0, n) : null);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() && Number.isFinite(Number(v)) ? Number(v) : null);

/** DataForSEO's "2026-01-24 13:17:33 +00:00" as an ISO date; null when it can't be read. */
export function isoOf(v: unknown): string | null {
  const s = str(v, 60);
  if (!s) return null;
  const t = Date.parse(s.replace(/^(\d{4}-\d\d-\d\d) (\d\d:\d\d(?::\d\d)?) ?([+-]\d\d:?\d\d|Z)?$/, (_m, d, h, z) => `${d}T${h}${z ?? "Z"}`));
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

/** Reviews from DataForSEO's Google Reviews task: items with review_id. Field names follow its docs; check the first real answer. */
export function parseReviews(items: unknown[] | null | undefined): Review[] {
  const seen = new Set<string>();
  const out: Review[] = [];
  for (const raw of Array.isArray(items) ? items : []) {
    const i = (raw ?? {}) as Record<string, unknown>;
    const id = str(i.review_id, 300);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const reply = str(i.owner_answer) ?? str(i.original_owner_answer);
    out.push({
      id,
      rating: num((i.rating as { value?: unknown } | null)?.value),
      text: str(i.review_text) ?? str(i.original_review_text),
      postedAt: isoOf(i.timestamp),
      author: str(i.profile_name, 200),
      reply,
      repliedAt: reply ? isoOf(i.owner_timestamp) : null,
      url: str(i.review_url, 1000),
    });
  }
  return out;
}

type Saved = Pick<SavedReview, "id" | "text" | "rating" | "reply" | "repliedAt" | "postedAt" | "removedAt">;

/**
 * What a pull changes. `complete` is true when the pull returned every review the business has (fewer than asked
 * for); then a saved review missing from it was removed. Otherwise only reviews newer than the oldest one pulled can
 * be called removed, since older ones weren't asked for.
 */
export function mergeReviews(saved: Saved[], pulled: Review[], complete: boolean): { add: Review[]; change: { review: Review; retheme: boolean }[]; removed: string[] } {
  const have = new Map(saved.map((s) => [s.id, s]));
  const got = new Map(pulled.map((r) => [r.id, r]));
  const add: Review[] = [];
  const change: { review: Review; retheme: boolean }[] = [];
  for (const r of got.values()) {
    const s = have.get(r.id);
    if (!s) add.push(r);
    else if (s.text !== r.text || s.rating !== r.rating || s.reply !== r.reply || (r.reply && s.repliedAt !== r.repliedAt) || s.removedAt) change.push({ review: r, retheme: s.text !== r.text });
  }
  const dates = pulled.map((r) => r.postedAt).filter((d): d is string => Boolean(d)).sort();
  const oldest = dates[0] ?? null;
  const removed = pulled.length
    ? saved.filter((s) => !s.removedAt && !got.has(s.id) && (complete || (oldest !== null && s.postedAt !== null && s.postedAt > oldest))).map((s) => s.id)
    : [];
  return { add, change, removed };
}

// ─────────────── themes: Haiku picks, code proves ───────────────

export const THEMES = [
  "Staff and friendliness",
  "Customer service",
  "Quality of work",
  "Results",
  "Expertise",
  "Communication",
  "Wait time",
  "Speed",
  "Booking and scheduling",
  "Price and value",
  "Billing and insurance",
  "Cleanliness",
  "Comfort",
  "Location and parking",
] as const;

const THEME_KEY = new Map(THEMES.map((t) => [t.toLowerCase(), t]));

/** Keeps a theme only when it's on the list, has a tone, and its quote (2 words or more) is really in the review. Up to 5. */
export function checkThemes(text: string | null, raw: unknown): ThemeHit[] {
  if (!text) return [];
  const full = normQuote(text);
  const out: ThemeHit[] = [];
  const seen = new Set<string>();
  for (const item of Array.isArray(raw) ? raw : []) {
    const x = (item ?? {}) as Record<string, unknown>;
    const theme = THEME_KEY.get(String(x.theme ?? "").trim().toLowerCase());
    const tone = x.tone === "praise" || x.tone === "complaint" ? x.tone : null;
    const quote = String(x.quote ?? "").replace(/\s+/g, " ").trim().replace(/^["'“‘]+|["'”’]+$/g, "");
    const q = normQuote(quote);
    if (!theme || !tone || q.split(" ").length < 2 || !full.includes(q)) continue;
    const key = `${theme}:${tone}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ theme, tone, quote: quote.slice(0, 300) });
    if (out.length === 5) break;
  }
  return out;
}

export const THEME_SCHEMA = {
  type: "object",
  properties: {
    reviews: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          themes: {
            type: "array",
            items: { type: "object", properties: { theme: { type: "string", enum: [...THEMES] }, tone: { type: "string", enum: ["praise", "complaint"] }, quote: { type: "string" } }, required: ["theme", "tone", "quote"], additionalProperties: false },
          },
        },
        required: ["id", "themes"],
        additionalProperties: false,
      },
    },
  },
  required: ["reviews"],
  additionalProperties: false,
} as const;

export function themePrompt(business: string, reviews: { id: string; text: string }[]) {
  return `These are Google reviews of ${business}. For each review, list what the reviewer praises or complains about.

Themes (use these names exactly): ${THEMES.join(", ")}.

Rules:
- Up to 5 themes per review. Only themes the review really talks about. A review can have none.
- tone is "praise" or "complaint".
- quote: copy 2 to 12 words from the review exactly as written, the words that show the theme. Never change, fix or shorten words inside the quote.
- Return every review id.

Reviews:
${reviews.map((r) => `[${r.id}] ${r.text.replace(/\s+/g, " ").slice(0, 1500)}`).join("\n")}`;
}

// ─────────────── numbers ───────────────

const DAY = 864e5;
const live = (r: SavedReview[]) => r.filter((x) => !x.removedAt);
const within = (r: SavedReview[], days: number, now: number) => live(r).filter((x) => x.postedAt && now - Date.parse(x.postedAt) <= days * DAY);
const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** Reviews posted in each of the last `months` calendar months, oldest first, as "2026-06". */
export function monthly(reviews: SavedReview[], months = 6, now = Date.now()): { month: string; count: number }[] {
  const d = new Date(now);
  const keys = Array.from({ length: months }, (_, i) => {
    const m = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - (months - 1 - i), 1));
    return m.toISOString().slice(0, 7);
  });
  const count = new Map(keys.map((k) => [k, 0]));
  for (const r of live(reviews)) {
    const k = r.postedAt?.slice(0, 7);
    if (k && count.has(k)) count.set(k, count.get(k)! + 1);
  }
  return keys.map((month) => ({ month, count: count.get(month)! }));
}

export type ReviewStats = { in90: number; rating90: number | null; replyShare: number | null; replyDays: number | null; unanswered: number };

/** One business's numbers: new reviews and their rating in 90 days, share answered and median reply time in 12 months. */
export function reviewStats(reviews: SavedReview[], now = Date.now()): ReviewStats {
  const r90 = within(reviews, 90, now);
  const rated = r90.map((r) => r.rating).filter((v): v is number => v !== null);
  const year = within(reviews, 365, now);
  const waits = year.filter((r) => r.reply && r.repliedAt && r.postedAt).map((r) => Math.max(0, (Date.parse(r.repliedAt!) - Date.parse(r.postedAt!)) / DAY));
  return {
    in90: r90.length,
    rating90: rated.length ? Math.round((rated.reduce((a, b) => a + b, 0) / rated.length) * 10) / 10 : null,
    replyShare: year.length ? Math.round((year.filter((r) => r.reply).length / year.length) * 100) : null,
    replyDays: median(waits),
    unanswered: year.filter((r) => !r.reply).length,
  };
}

/** The business's own reviews with no reply from the last 12 months: 1 to 3 stars first, then the rest, each oldest first. */
export function toAnswer(reviews: SavedReview[], now = Date.now()): SavedReview[] {
  const low = (r: SavedReview) => (r.rating !== null && r.rating <= 3 ? 0 : 1);
  return within(reviews, 365, now)
    .filter((r) => r.you && !r.reply)
    .sort((a, b) => low(a) - low(b) || (a.postedAt ?? "").localeCompare(b.postedAt ?? ""));
}

export type ThemeRow = { theme: string; tone: ThemeHit["tone"]; you: { n: number; of: number }; leaders: { n: number; of: number }; quotes: string[] };

/**
 * Each theme's share of read reviews (12 months), yours against the leaders together, with up to 2 of your quotes.
 * A side needs 5 read reviews or its share isn't shown. Rows with too little to say are left out.
 */
export function themeTable(you: SavedReview[], leaders: SavedReview[], now = Date.now()): ThemeRow[] {
  const read = (r: SavedReview[]) => within(r, 365, now).filter((x) => x.text && x.themes);
  const mine = read(you);
  const theirs = read(leaders);
  const rows = new Map<string, ThemeRow>();
  const row = (h: ThemeHit) => {
    const k = `${h.theme}:${h.tone}`;
    if (!rows.has(k)) rows.set(k, { theme: h.theme, tone: h.tone, you: { n: 0, of: mine.length }, leaders: { n: 0, of: theirs.length }, quotes: [] });
    return rows.get(k)!;
  };
  for (const r of mine)
    for (const h of r.themes!) {
      const x = row(h);
      x.you.n++;
      if (x.quotes.length < 2 && !x.quotes.some((q) => normQuote(q) === normQuote(h.quote))) x.quotes.push(h.quote);
    }
  for (const r of theirs) for (const h of r.themes!) row(h).leaders.n++;
  const share = (s: { n: number; of: number }) => (s.of >= 5 ? s.n / s.of : 0);
  return [...rows.values()]
    .filter((r) => r.you.n + r.leaders.n >= 2 && Math.max(share(r.you), share(r.leaders)) >= 0.03)
    .sort((a, b) => Math.max(share(b.you), share(b.leaders)) - Math.max(share(a.you), share(a.leaders)));
}

/** A share as a whole percent, or null when the side has fewer than 5 read reviews. */
export const themeShare = (s: { n: number; of: number }) => (s.of >= 5 ? Math.round((s.n / s.of) * 100) : null);

const STOP = new Set(["near", "best", "with", "from", "open", "cheap", "local", "service", "services", "company", "the", "and", "for", "that", "this", "your", "today", "now"]);

/** The words of the tracked keywords worth looking for in reviews: 4 letters or more, no filler. */
export function keywordWords(keywords: string[], city?: string | null): string[] {
  const skip = new Set((city ?? "").toLowerCase().split(/\s+/));
  return [...new Set(keywords.flatMap((k) => k.toLowerCase().split(/[^a-z0-9']+/)))].filter((w) => w.length >= 4 && !STOP.has(w) && !skip.has(w)).slice(0, 20);
}

/**
 * How many reviews of each business use each keyword word (12 months): "'emergency' appears in 12 of the leader's
 * reviews and 1 of yours." Rows are kept when a leader uses the word in 3 reviews or more, and more often than you.
 */
export function keywordMentions(words: string[], groups: { title: string; you: boolean; reviews: SavedReview[] }[], now = Date.now()) {
  const texts = groups.map((g) => ({ ...g, texts: within(g.reviews, 365, now).map((r) => (r.text ?? "").toLowerCase()) }));
  return words
    .map((w) => {
      const clean = w.replace(/[^a-z0-9']/g, "");
      const stem = clean.replace(/(ies|es|s|y)$/, "");
      const re = new RegExp(`\\b${stem.length >= 4 ? stem : clean}`, "i"); // "emergency" finds "emergencies" too
      const counts = texts.map((g) => ({ title: g.title, you: g.you, n: g.texts.filter((t) => re.test(t)).length, of: g.texts.length }));
      const you = counts.find((c) => c.you) ?? { title: "", you: true, n: 0, of: 0 };
      const top = counts.filter((c) => !c.you).sort((a, b) => b.n - a.n)[0];
      return { word: w, you, top: top ?? null, all: counts };
    })
    .filter((r) => r.top && r.top.n >= 3 && r.top.n > r.you.n)
    .sort((a, b) => b.top!.n - b.you.n - (a.top!.n - a.you.n));
}

/** Google's "Write a review" link for a place id: free, for asking customers. */
export const writeReviewUrl = (placeId: string) => `https://search.google.com/local/writereview?placeid=${encodeURIComponent(placeId)}`;

/** How many reviews to ask for: the newest 200 on the first pull, then the newest 50 each week. */
export const pullDepth = (saved: number) => (saved ? 50 : 200);

/** The prompt for a reply the owner edits and posts themselves. */
export function replyPrompt(p: { business: string; review: Pick<Review, "rating" | "text" | "author">; voice: string; phone?: string | null }) {
  const low = p.review.rating !== null && p.review.rating <= 3;
  return `Write the owner's reply to this Google review of ${p.business}. The owner will read it, change it and post it.

Review (${p.review.rating ?? "no"} stars, by ${p.review.author ?? "a customer"}):
${p.review.text ?? "(no text, rating only)"}

Rules:
- 25 to 70 words. Plain text, no emoji, no hashtags, no sign-off with a made-up name.
- Write in the review's language.
- Thank them by first name only when the author name looks like a real first name.
- Mention one specific thing they wrote, in your own words.
${low ? `- Apologize once, without excuses. Don't argue with the review or say it's wrong.\n- Invite them to get in touch to put it right${p.phone ? ` (phone ${p.phone})` : ""}.` : "- Keep it warm and short. Invite them back."}
- Never confirm they are a customer or patient beyond what they wrote, and never mention health, treatment, price or account details they didn't write.
- Never offer money, refunds or discounts. Never promise anything the business hasn't said.
${p.voice ? `\nBrand voice:\n${p.voice}\n` : ""}
Reply with the text only.`;
}
