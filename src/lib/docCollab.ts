// Comments and saved versions of an article in Drafts (supabase/101_doc_comments_versions.sql), read and written
// by the browser as the signed-in member. Row-level security decides who may do what.
import type { SupabaseClient } from "@supabase/supabase-js";
import { getProfile } from "./db.ts";

export const COLLAB_NOT_RUN = "Comments and versions turn on once supabase/101_doc_comments_versions.sql has run.";
const check = <T>(r: { data: T; error: { message: string } | null }): T => {
  if (r.error) throw new Error(/doc_comments|doc_versions/.test(r.error.message) ? COLLAB_NOT_RUN : r.error.message);
  return r.data;
};

export type Me = { id: string; name: string };
/** The signed-in member, with the name others see on comments and versions. */
export async function whoAmI(sb: SupabaseClient): Promise<Me | null> {
  const { data } = await sb.auth.getUser();
  const u = data.user;
  if (!u) return null;
  const p = await getProfile(sb, u.id).catch(() => null);
  const meta = (u.user_metadata ?? {}) as Record<string, unknown>;
  const name = p?.full_name || (typeof meta.full_name === "string" ? meta.full_name : "") || (typeof meta.name === "string" ? meta.name : "") || u.email?.split("@")[0] || "Someone";
  return { id: u.id, name };
}

// ─────────────── comments ───────────────
export type DocComment = { id: string; doc_id: string; parent_id: string | null; quote: string; body: string; author_id: string | null; author_name: string; resolved_at: string | null; created_at: string };
const COMMENT_COLS = "id, doc_id, parent_id, quote, body, author_id, author_name, resolved_at, created_at";

export const listComments = async (sb: SupabaseClient, docId: string) => check(await sb.from("doc_comments").select(COMMENT_COLS).eq("doc_id", docId).order("created_at")) as DocComment[];

export async function addComment(sb: SupabaseClient, c: { workspaceId: string; docId: string; parentId?: string | null; quote?: string; body: string; me: Me }): Promise<DocComment> {
  return check(
    await sb
      .from("doc_comments")
      .insert({ workspace_id: c.workspaceId, doc_id: c.docId, parent_id: c.parentId ?? null, quote: (c.quote ?? "").slice(0, 1000), body: c.body.slice(0, 4000), author_id: c.me.id, author_name: c.me.name.slice(0, 200) })
      .select(COMMENT_COLS)
      .single(),
  ) as DocComment;
}

export const resolveComment = async (sb: SupabaseClient, id: string, resolved: boolean) => {
  check(await sb.from("doc_comments").update({ resolved_at: resolved ? new Date().toISOString() : null }).eq("id", id));
};

export const deleteComment = async (sb: SupabaseClient, id: string) => {
  check(await sb.from("doc_comments").delete().eq("id", id));
};

/** Threads, newest first: each first comment with its replies in order. */
export function threadsOf(rows: DocComment[]) {
  const tops = rows.filter((r) => !r.parent_id);
  return tops.map((t) => ({ ...t, replies: rows.filter((r) => r.parent_id === t.id) })).reverse();
}

// ─────────────── versions ───────────────
/** reason is "regenerate" for the copy the server saves before a draft is written again (053_library_review.sql). */
export type DocVersion = { id: string; title: string; words: number; label: string; reason: string; author_name: string; created_at: string };
const VERSION_COLS = "id, title, words, label, reason, author_name, created_at";
/** What a version is called in the list. */
export const versionName = (v: Pick<DocVersion, "label" | "reason">) => v.label || (v.reason === "regenerate" ? "Before the draft was written again" : "Saved while editing");
export const KEEP_VERSIONS = 50;
/** How long edits run before the next automatic version. */
export const AUTO_EVERY_MS = 10 * 60_000;

export const listVersions = async (sb: SupabaseClient, docId: string, limit = KEEP_VERSIONS) =>
  check(await sb.from("doc_versions").select(VERSION_COLS).eq("doc_id", docId).order("created_at", { ascending: false }).limit(limit)) as DocVersion[];

export const getVersion = async (sb: SupabaseClient, id: string) => check(await sb.from("doc_versions").select(`${VERSION_COLS}, content`).eq("id", id).single()) as DocVersion & { content: Record<string, unknown> };

export async function saveVersion(sb: SupabaseClient, v: { workspaceId: string; docId: string; title: string; content: Record<string, unknown>; words: number; label?: string; me: Me | null }) {
  check(
    await sb.from("doc_versions").insert({
      workspace_id: v.workspaceId,
      doc_id: v.docId,
      title: v.title.slice(0, 300),
      content: v.content,
      words: v.words,
      label: (v.label ?? "").slice(0, 120),
      reason: v.label ? "manual" : "auto",
      created_by: v.me?.id ?? null,
      author_name: (v.me?.name ?? "").slice(0, 200),
    }),
  );
  // Keep the newest KEEP_VERSIONS.
  const old = (await sb.from("doc_versions").select("id").eq("doc_id", v.docId).order("created_at", { ascending: false }).range(KEEP_VERSIONS, KEEP_VERSIONS + 50)).data as { id: string }[] | null;
  if (old?.length)
    await sb
      .from("doc_versions")
      .delete()
      .in(
        "id",
        old.map((o) => o.id),
      );
}

/** "just now", "5 min ago", "3 hr ago", then the date. */
export function ago(iso: string, now = Date.now()) {
  const s = Math.round((now - new Date(iso).getTime()) / 1000);
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hr ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: new Date(iso).getFullYear() === new Date(now).getFullYear() ? undefined : "numeric" });
}
