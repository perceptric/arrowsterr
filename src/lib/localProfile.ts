// Local Research, phase 2 (docs/local-research-plan.md, 4.4): the Google profile of a location's business and of the
// three competitors that hold the most top 3 spots, read weekly. A side-by-side table, the gaps against the leaders, a
// profile score, and the changes Google made to the business's own listing, counted only when two reads agree.
// Pure: DataForSEO answers in, facts out.

export type Profile = {
  cid: string | null;
  placeId: string | null;
  title: string;
  category: string | null;
  categories: string[]; // second categories
  phone: string | null;
  website: string | null;
  address: string | null;
  description: string | null;
  /** Opening hours as one line per day, like "monday 09:00-17:00"; empty when not set. */
  hours: string[];
  photos: number | null;
  rating: number | null;
  reviews: number | null;
  attributes: string[];
  bookingUrl: string | null;
  claimed: boolean | null;
  /** Posts (Google Business Profile updates), newest first: their dates. Null when posts weren't read. */
  posts: string[] | null;
  /** Questions and answers. Null when they weren't read. */
  questions: { total: number; unanswered: number } | null;
};

const str = (v: unknown, n = 2000) => (typeof v === "string" && v.trim() ? v.trim().slice(0, n) : null);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() && Number.isFinite(Number(v)) ? Number(v) : null);
const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
const hm = (t: unknown) => {
  const x = t as { hour?: number; minute?: number } | null;
  return x && typeof x.hour === "number" ? `${String(x.hour).padStart(2, "0")}:${String(x.minute ?? 0).padStart(2, "0")}` : null;
};

/** Hours from DataForSEO's work_time.work_hours.timetable: { monday: [{ open: {hour, minute}, close: {...} }], ... }. */
export function hoursOf(work: unknown): string[] {
  const t = (work as { work_hours?: { timetable?: Record<string, unknown> | null } } | null)?.work_hours?.timetable;
  if (!t || typeof t !== "object") return [];
  return DAYS.flatMap((d) => {
    const slots = (t as Record<string, unknown>)[d];
    if (!Array.isArray(slots) || !slots.length) return [`${d} closed`];
    return [`${d} ${slots.map((s) => `${hm((s as { open?: unknown }).open) ?? "?"}-${hm((s as { close?: unknown }).close) ?? "?"}`).join(", ")}`];
  });
}

/** Attribute names from available_attributes: { group: ["has_wheelchair_accessible_entrance", ...] }. */
function attributesOf(a: unknown): string[] {
  const avail = (a as { available_attributes?: Record<string, unknown> } | null)?.available_attributes;
  if (!avail || typeof avail !== "object") return [];
  return [...new Set(Object.values(avail).flatMap((v) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [])))].slice(0, 60);
}

/** One business from DataForSEO's my_business_info item. Field names follow its docs; check the first real answer. */
export function parseInfo(item: Record<string, unknown> | null | undefined): Profile | null {
  if (!item || !str(item.title)) return null;
  const rating = item.rating as { value?: unknown; votes_count?: unknown } | null | undefined;
  return {
    cid: str(item.cid, 60),
    placeId: str(item.place_id, 200),
    title: str(item.title, 200)!,
    category: str(item.category, 100),
    categories: Array.isArray(item.additional_categories) ? (item.additional_categories as unknown[]).map((c) => str(c, 100)).filter((c): c is string => Boolean(c)) : [],
    phone: str(item.phone, 60),
    website: str(item.url, 500),
    address: str(item.address, 300),
    description: str(item.description, 3000),
    hours: hoursOf(item.work_time),
    photos: num(item.total_photos),
    rating: num(rating?.value),
    reviews: num(rating?.votes_count),
    attributes: attributesOf(item.attributes),
    bookingUrl: str(item.book_online_url, 500),
    claimed: typeof item.is_claimed === "boolean" ? item.is_claimed : null,
    posts: null,
    questions: null,
  };
}

/** Post dates from my_business_updates items (newest first). */
export function parsePosts(items: unknown[] | null | undefined): string[] {
  return (items ?? [])
    .map((i) => str((i as { timestamp?: unknown; post_date?: unknown }).timestamp ?? (i as { post_date?: unknown }).post_date, 40))
    .filter((d): d is string => Boolean(d) && !Number.isNaN(Date.parse(d!)))
    .sort((a, b) => Date.parse(b) - Date.parse(a));
}

/** Question counts from questions_and_answers: answered ones in `items`, open ones in `items_without_answers`. */
export function parseQuestions(result: { items?: unknown[] | null; items_without_answers?: unknown[] | null } | null | undefined): { total: number; unanswered: number } {
  const withAnswers = (result?.items ?? []).filter((q) => {
    const answers = (q as { items?: unknown[] }).items;
    return Array.isArray(answers) && answers.length > 0;
  }).length;
  const open = (result?.items ?? []).length - withAnswers + (result?.items_without_answers ?? []).length;
  return { total: withAnswers + open, unanswered: open };
}

/** Posts in the last `days` days. */
export const postsWithin = (p: Pick<Profile, "posts">, days: number, now = Date.now()) => (p.posts === null ? null : p.posts.filter((d) => now - Date.parse(d) <= days * 864e5).length);

const median = (xs: number[]) => {
  const v = [...xs].sort((a, b) => a - b);
  return v.length ? (v.length % 2 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2) : null;
};

export type Gap = { id: string; title: string; why: string };

const nice = (attr: string) => attr.replace(/^(has|is|offers|accepts|serves)_/, "").replace(/_/g, " ");

/**
 * What the leaders have that the business doesn't, most useful first. A gap needs at least 2 of the 3 leaders to have
 * the thing, so one odd competitor never sets the bar.
 */
export function profileGaps(you: Profile, rivals: Profile[], now = Date.now()): Gap[] {
  const out: Gap[] = [];
  const need = Math.min(2, rivals.length);
  if (!rivals.length) return out;
  const yourCats = new Set([you.category, ...you.categories].filter(Boolean).map((c) => c!.toLowerCase()));
  const catCount = new Map<string, number>();
  for (const r of rivals) for (const c of new Set([r.category, ...r.categories].filter(Boolean).map((x) => x!.toLowerCase()))) catCount.set(c, (catCount.get(c) ?? 0) + 1);
  for (const [c, n] of [...catCount.entries()].sort((a, b) => b[1] - a[1])) {
    if (n >= need && !yourCats.has(c)) out.push({ id: `category:${c}`, title: `Add "${c}" as a category`, why: `${n} of the top ${rivals.length} list it.` });
  }
  if (you.questions && you.questions.unanswered > 0) out.push({ id: "questions", title: `Answer the ${you.questions.unanswered} open ${you.questions.unanswered === 1 ? "question" : "questions"}`, why: "Unanswered questions sit on your profile for anyone to see." });
  const yourPosts = postsWithin(you, 30, now);
  const theirPosts = rivals.map((r) => postsWithin(r, 30, now)).filter((x): x is number => x !== null);
  if (yourPosts !== null && theirPosts.filter((x) => x > 0).length >= need && yourPosts === 0) out.push({ id: "posts", title: "Post on your profile", why: `The leaders posted ${theirPosts.reduce((a, b) => a + b, 0)} times in 30 days. You posted 0.` });
  if (!you.bookingUrl && rivals.filter((r) => r.bookingUrl).length >= need) out.push({ id: "booking", title: "Add an online booking link", why: `${rivals.filter((r) => r.bookingUrl).length} of the top ${rivals.length} have one. It adds a Book button on Maps.` });
  const photos = median(rivals.map((r) => r.photos).filter((x): x is number => x !== null));
  if (photos !== null && you.photos !== null && you.photos < photos / 2) out.push({ id: "photos", title: "Add photos", why: `You have ${you.photos}. The leaders have about ${Math.round(photos)}.` });
  if (!you.hours.length && rivals.filter((r) => r.hours.length).length >= need) out.push({ id: "hours", title: "Set your opening hours", why: "The leaders all show theirs." });
  const desc = median(rivals.map((r) => r.description?.length ?? 0));
  if (desc && desc >= 200 && (you.description?.length ?? 0) < desc / 2) out.push({ id: "description", title: "Write a longer description", why: `Yours is ${you.description?.length ?? 0} characters. The leaders' are about ${Math.round(desc)}.` });
  const yourAttrs = new Set(you.attributes);
  const attrCount = new Map<string, number>();
  for (const r of rivals) for (const a of new Set(r.attributes)) attrCount.set(a, (attrCount.get(a) ?? 0) + 1);
  const missing = [...attrCount.entries()].filter(([a, n]) => n >= need && !yourAttrs.has(a)).map(([a]) => nice(a));
  if (missing.length) out.push({ id: "attributes", title: `Add ${missing.length === 1 ? "the attribute" : `${missing.length} attributes`} the leaders show`, why: missing.slice(0, 5).join(", ") + (missing.length > 5 ? ` and ${missing.length - 5} more` : "") + "." });
  if (you.claimed === false) out.unshift({ id: "claim", title: "Claim your profile", why: "Google shows it as not claimed, so anyone can suggest edits and you can't answer reviews." });
  return out;
}

/**
 * A score from 0 to 100 for how complete the profile is next to the leaders. The parts that help in Maps weigh most.
 * Parts that couldn't be read count as met, so a missing read never lowers the score.
 */
export function profileScore(you: Profile, rivals: Profile[], now = Date.now()): number {
  const photos = median(rivals.map((r) => r.photos).filter((x): x is number => x !== null)) ?? 30;
  const posts = postsWithin(you, 30, now);
  const parts: [number, boolean][] = [
    [10, Boolean(you.category)],
    [10, you.categories.length >= 2 || profileGaps(you, rivals, now).every((g) => !g.id.startsWith("category:"))],
    [10, you.hours.length > 0],
    [10, (you.description?.length ?? 0) >= 250],
    [15, you.photos === null || you.photos >= Math.min(photos, 100) * 0.75],
    [5, Boolean(you.website)],
    [5, Boolean(you.phone)],
    [5, Boolean(you.bookingUrl)],
    [10, posts === null || posts >= 2],
    [10, you.questions === null || you.questions.unanswered === 0],
    [5, you.rating === null || you.rating >= 4.5],
    [5, you.claimed !== false],
  ];
  return parts.reduce((a, [w, ok]) => a + (ok ? w : 0), 0);
}

export type Change = { field: string; label: string; before: string; now: string; seenAt: string; confirmedAt: string };

const FIELDS: { key: keyof Profile; label: string }[] = [
  { key: "title", label: "Name" },
  { key: "category", label: "Main category" },
  { key: "categories", label: "Second categories" },
  { key: "phone", label: "Phone" },
  { key: "website", label: "Website" },
  { key: "address", label: "Address" },
  { key: "hours", label: "Hours" },
];
const show = (v: unknown) => (Array.isArray(v) ? (v.length ? v.join("; ") : "None") : v === null || v === undefined || v === "" ? "None" : String(v));

/**
 * Changes to the business's own listing, newest reads first. A field counts as changed only when the two newest reads
 * agree on a new value that differs from the read before them, so one odd read never shows as a change.
 */
export function profileChanges(reads: { at: string; profile: Profile }[]): Change[] {
  if (reads.length < 3) return [];
  const [now, seen, before] = reads;
  const out: Change[] = [];
  for (const f of FIELDS) {
    const a = show(now.profile[f.key]);
    const b = show(seen.profile[f.key]);
    const c = show(before.profile[f.key]);
    if (a === b && b !== c) out.push({ field: f.key, label: f.label, before: c, now: a, seenAt: seen.at, confirmedAt: now.at });
  }
  return out;
}

/** True when the newest read differs from the one before on a field that's watched: worth a second read soon. */
export function needsConfirm(reads: { profile: Profile }[]): boolean {
  if (reads.length < 2) return false;
  return FIELDS.some((f) => show(reads[0].profile[f.key]) !== show(reads[1].profile[f.key]));
}

/** The 3 competitors that held the most top 3 spots across a location's latest scans. */
export function leaders(scans: { rivals: { title: string; cid: string | null; top3: number }[] }[], n = 3): { title: string; cid: string }[] {
  const by = new Map<string, { title: string; cid: string; top3: number }>();
  for (const s of scans)
    for (const r of s.rivals) {
      if (!r.cid) continue;
      const cur = by.get(r.cid) ?? { title: r.title, cid: r.cid, top3: 0 };
      cur.top3 += r.top3;
      by.set(r.cid, cur);
    }
  return [...by.values()].filter((r) => r.top3 > 0).sort((a, b) => b.top3 - a.top3).slice(0, n).map(({ title, cid }) => ({ title, cid }));
}
