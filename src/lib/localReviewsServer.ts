import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { voiceText } from "./brandVoice";
import { loadBrandContext } from "./brandContext";
import { askClaude, askJson } from "./claude";
import { call } from "./dataforseo";
import { entitlement, take } from "./entitlements";
import { enqueue } from "./jobs";
import { scheduleOf, type Location } from "./local";
import { keywordFor, targets } from "./localProfileServer";
import { checkThemes, mergeReviews, parseReviews, pullDepth, replyPrompt, THEME_SCHEMA, themePrompt, type Review } from "./localReviews";
import { TASK_COST } from "./plans";

// Local Research, phase 3 (docs/local-research-plan.md, 4.5). A job asks DataForSEO's queue for the newest reviews of
// a location's business and its 3 leaders (200 the first time, 50 after), collects them in later rounds, saves them by
// review id, and then has Haiku tag themes on the ones not read yet. Draft replies are written on click.

const MIGRATION = "Run supabase/073_local_reviews.sql on the VPS database.";
const haiku = () => process.env.EXTRACT_MODEL || "claude-haiku-5-5";
type PullTask = { id: string; cid: string; title: string; you: boolean; depth: number };
type Ctx = { workspace_id: string; brand_id: string };

const keyOf = (t: { cid: string | null; placeId: string | null; title: string }) => t.cid ?? t.placeId ?? t.title;

/** The job: post the pulls (round 0), collect them (round 1 and on), then read themes. */
export async function runReviewPull(db: SupabaseClient, p: { locationId: string; round?: number; tasks?: PullTask[]; theme?: boolean }) {
  if (p.theme) return themeReviews(db, p.locationId);
  if (p.round && p.tasks) return collect(db, p.locationId, p.tasks, p.round);
  const t = await targets(db, p.locationId, false);
  if (!t) return;
  const { data: counts, error } = await db.from("local_reviews").select("cid").eq("location_id", p.locationId);
  if (error) throw new Error(/local_reviews/.test(error.message) ? MIGRATION : error.message);
  const saved = new Map<string, number>();
  for (const r of (counts ?? []) as { cid: string }[]) saved.set(r.cid, (saved.get(r.cid) ?? 0) + 1);
  const tasks: PullTask[] = [];
  await Promise.all(
    t.list.map(async (b) => {
      const depth = pullDepth(saved.get(keyOf(b)) ?? 0);
      try {
        const [task] = await call("business_data/google/reviews/task_post", [{ keyword: keywordFor(b), location_code: t.market.location, language_code: t.market.language, depth, sort_by: "newest" }]);
        if (task?.id && (task.status_code === 20100 || task.status_code === 20000)) tasks.push({ id: task.id, cid: keyOf(b), title: b.title, you: b.you, depth });
      } catch {
        /* this business is left out of this pull */
      }
    }),
  );
  if (!tasks.some((x) => x.you)) throw new Error("Google didn't take the request for the business's reviews.");
  await db.from("local_locations").update({ reviews_at: new Date().toISOString(), reviews_from: tasks.map((x) => ({ cid: x.cid, title: x.title, you: x.you })) }).eq("id", p.locationId);
  await enqueue("local_reviews", { locationId: p.locationId, round: 1, tasks }, { workspaceId: t.row.workspace_id, key: `local_reviews:${p.locationId}:${Date.now()}:1`, runAt: new Date(Date.now() + 120_000), maxAttempts: 3 });
}

async function collect(db: SupabaseClient, locationId: string, tasks: PullTask[], round: number) {
  const { data: loc } = await db.from("local_locations").select("workspace_id, brand_id").eq("id", locationId).maybeSingle();
  if (!loc) return;
  const left: PullTask[] = [];
  let saved = 0;
  for (const t of tasks) {
    try {
      const [r] = await call(`business_data/google/reviews/task_get/${t.id}`);
      if (r?.status_code === 20000) {
        const items = (r.result?.[0]?.items ?? []) as unknown[];
        saved += await save(db, loc as Ctx, locationId, t, parseReviews(items), items.length < t.depth);
      } else if (!r?.status_code || r.status_code < 40000 || (r.status_code >= 40601 && r.status_code <= 40602)) left.push(t); // still in the queue
    } catch {
      left.push(t);
    }
  }
  const ws = (loc.workspace_id as string) ?? null;
  // Up to about 45 minutes; a business that never answers is left out of this pull.
  if (left.length && round < 7) await enqueue("local_reviews", { locationId, round: round + 1, tasks: left }, { workspaceId: ws, key: `local_reviews:${locationId}:${left[0].id}:${round + 1}`, runAt: new Date(Date.now() + Math.min(15 * 60_000, 60_000 * 2 ** round)), maxAttempts: 3 });
  if (saved) await enqueue("local_reviews", { locationId, theme: true }, { workspaceId: ws, key: `local_reviews:${locationId}:theme:${Date.now()}`, maxAttempts: 2 });
}

/** Saves one business's pull: new reviews added, changed ones updated, missing ones marked removed. Returns how many it wrote. */
async function save(db: SupabaseClient, loc: Ctx, locationId: string, t: PullTask, pulled: Review[], complete: boolean): Promise<number> {
  const { data: rows, error } = await db.from("local_reviews").select("review_id, text, rating, reply, replied_at, posted_at, removed_at").eq("location_id", locationId).eq("cid", t.cid);
  if (error) throw new Error(/local_reviews/.test(error.message) ? MIGRATION : error.message);
  const have = ((rows ?? []) as { review_id: string; text: string | null; rating: number | null; reply: string | null; replied_at: string | null; posted_at: string | null; removed_at: string | null }[]).map((r) => ({
    id: r.review_id,
    text: r.text,
    rating: r.rating,
    reply: r.reply,
    repliedAt: r.replied_at ? new Date(r.replied_at).toISOString() : null,
    postedAt: r.posted_at ? new Date(r.posted_at).toISOString() : null,
    removedAt: r.removed_at,
  }));
  const { add, change, removed } = mergeReviews(have, pulled, complete);
  const now = new Date().toISOString();
  const cols = (r: Review) => ({ rating: r.rating, text: r.text, author: r.author, url: r.url, posted_at: r.postedAt, reply: r.reply, replied_at: r.repliedAt, removed_at: null, updated_at: now });
  for (let i = 0; i < add.length; i += 200) {
    const batch = add.slice(i, i + 200).map((r) => ({ workspace_id: loc.workspace_id, brand_id: loc.brand_id, location_id: locationId, cid: t.cid, title: t.title, you: t.you, review_id: r.id, ...cols(r), themes: r.text ? null : [] }));
    const { error: e } = await db.from("local_reviews").upsert(batch, { onConflict: "location_id,cid,review_id", ignoreDuplicates: true });
    if (e) throw new Error(e.message);
  }
  for (const c of change) await db.from("local_reviews").update({ ...cols(c.review), title: t.title, ...(c.retheme ? { themes: c.review.text ? null : [] } : {}) }).eq("location_id", locationId).eq("cid", t.cid).eq("review_id", c.review.id);
  if (removed.length) await db.from("local_reviews").update({ removed_at: now }).eq("location_id", locationId).eq("cid", t.cid).in("review_id", removed);
  return add.length + change.length;
}

/** Haiku reads up to 100 unread reviews per business from the last 12 months, 20 at a time; code keeps proven themes. */
async function themeReviews(db: SupabaseClient, locationId: string) {
  const since = new Date(Date.now() - 365 * 864e5).toISOString();
  const { data, error } = await db.from("local_reviews").select("id, cid, title, text").eq("location_id", locationId).is("themes", null).is("removed_at", null).gte("posted_at", since).order("posted_at", { ascending: false }).limit(1000);
  if (error) throw new Error(error.message);
  const byBiz = new Map<string, { id: string; title: string; text: string }[]>();
  for (const r of (data ?? []) as { id: string; cid: string; title: string; text: string | null }[]) {
    if (!r.text) continue;
    const list = byBiz.get(r.cid) ?? [];
    if (list.length < 100) list.push({ id: r.id, title: r.title, text: r.text });
    byBiz.set(r.cid, list);
  }
  const batches = [...byBiz.values()].flatMap((list) => Array.from({ length: Math.ceil(list.length / 20) }, (_, i) => list.slice(i * 20, i * 20 + 20)));
  for (let i = 0; i < batches.length; i += 4) {
    await Promise.all(
      batches.slice(i, i + 4).map(async (batch) => {
        const short = batch.map((r, n) => ({ id: `r${n + 1}`, text: r.text }));
        const reply = await askJson<{ reviews?: { id?: string; themes?: unknown }[] }>(themePrompt(batch[0].title, short), THEME_SCHEMA, { model: haiku(), maxTokens: 4000, effort: "low" }).catch(() => null);
        if (!reply) return; // tried again on the next pull
        const got = new Map((reply.reviews ?? []).map((r) => [String(r.id ?? ""), r.themes]));
        for (const [n, r] of batch.entries()) {
          if (!got.has(`r${n + 1}`)) continue;
          await db.from("local_reviews").update({ themes: checkThemes(r.text, got.get(`r${n + 1}`)) }).eq("id", r.id);
        }
      }),
    );
  }
}

/** A draft reply to one of the business's own reviews, in the brand's voice. The person edits and posts it. */
export async function draftReply(db: SupabaseClient, brandId: string, loc: Location & { id: string }, reviewRowId: string): Promise<string> {
  const { data: r, error } = await db.from("local_reviews").select("rating, text, author, you").eq("id", reviewRowId).eq("location_id", loc.id).maybeSingle();
  if (error) throw new Error(/local_reviews/.test(error.message) ? MIGRATION : error.message);
  if (!r || !r.you) throw new Error("Review not found.");
  const ctx = await loadBrandContext(db, brandId);
  const { text } = await askClaude(replyPrompt({ business: loc.title, review: { rating: r.rating as number | null, text: r.text as string | null, author: r.author as string | null }, voice: voiceText(ctx.voice), phone: loc.phone }), { maxTokens: 600, effort: "low" });
  return text.trim().replace(/^["“]|["”]$/g, "");
}

/** Pull reviews now: the editor pressed Read now on Reviews. */
export async function queueReviewPull(locationId: string, workspaceId: string) {
  await enqueue("local_reviews", { locationId }, { workspaceId, key: `local_reviews:${locationId}:now:${Math.floor(Date.now() / 600_000)}`, maxAttempts: 2 });
}

/** The daily tick: every location with scheduled scans gets its reviews pulled once a week. */
export async function queueReviewPulls(db: SupabaseClient) {
  const { data: rows, error } = await db.from("local_locations").select("id, workspace_id, data, reviews_at");
  if (error) return; // before 073
  const cutoff = Date.now() - 7 * 864e5 + 3 * 3600_000;
  for (const r of rows ?? []) {
    if (scheduleOf(r.data as Location) === "off") continue;
    if (r.reviews_at && Date.parse(r.reviews_at as string) > cutoff) continue;
    const e = await entitlement(r.workspace_id);
    if (e.readOnly || !e.open.seo) continue;
    const took = await take(r.workspace_id, "tasks", TASK_COST.localreviews, { refundIfFree: false });
    if (!took.ok) continue;
    await enqueue("local_reviews", { locationId: r.id }, { workspaceId: r.workspace_id, key: `local_reviews:${r.id}:week:${new Date().toISOString().slice(0, 10)}`, maxAttempts: 2 }).catch(async () => took.giveBack());
  }
}
