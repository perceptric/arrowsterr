import "server-only";

// Writing chats on the server (writingChats.ts has the pure part): the workspace's "Content writing" folder, the link
// between a chat and each Calendar piece its writer tools touched, and each chat's pieces with where they stand.
// db is the admin client: every query is scoped to ws by hand. Before supabase/103_writing_chats.sql runs, the folder is
// found by its name and links come only from Autopilot's mark on each piece, so nothing breaks.

import type { SupabaseClient } from "@supabase/supabase-js";
import { PROJECT_NAME, piecesByThread, type WritingPiece } from "./writingChats";

/** The error means 103_writing_chats.sql hasn't run yet. */
export const before103 = (e: { message: string } | null | undefined) => Boolean(e && /\bkind\b|ask_thread_pieces/.test(e.message));

/** Find the workspace's Content writing folder: its id, whether 103 has run, and whether the lookup failed. */
async function findProject(db: SupabaseClient, ws: string) {
  const found = await db.from("ask_projects").select("id").eq("workspace_id", ws).eq("kind", "writing").limit(1).maybeSingle();
  const marked = !before103(found.error);
  if (marked) return { id: (found.data as { id: string } | null)?.id ?? null, marked, failed: Boolean(found.error) };
  // Before 103: the folder is the project with this name.
  const named = await db.from("ask_projects").select("id").eq("workspace_id", ws).eq("name", PROJECT_NAME).limit(1).maybeSingle();
  return { id: (named.data as { id: string } | null)?.id ?? null, marked, failed: Boolean(named.error) };
}

/** The workspace's Content writing folder, or null before the first writing chat makes it. */
export async function writingProjectId(db: SupabaseClient, ws: string): Promise<string | null> {
  return (await findProject(db, ws)).id;
}

/** The workspace's Content writing folder, made the first time it's needed. Null when Zippie's projects aren't set up. */
export async function writingProject(db: SupabaseClient, ws: string, userId: string | null): Promise<string | null> {
  const { id, marked, failed } = await findProject(db, ws);
  if (id || failed) return id;
  const row = { workspace_id: ws, name: PROJECT_NAME, created_by: userId, ...(marked ? { kind: "writing" } : {}) };
  const made = await db.from("ask_projects").insert(row).select("id").single();
  if (made.data) return (made.data as { id: string }).id;
  // Two chats started at once: the other one made it.
  if (made.error?.code === "23505") {
    const again = await db.from("ask_projects").select("id").eq("workspace_id", ws).eq("kind", "writing").limit(1).maybeSingle();
    return (again.data as { id: string } | null)?.id ?? null;
  }
  return null;
}

/** Start a chat row, with its kind when the column is there. */
export async function insertThread(db: SupabaseClient, row: { workspace_id: string; title: string; created_by: string | null; project_id: string | null; kind: string | null }) {
  const cols = "id, title, created_by, project_id";
  const first = await db.from("ask_threads").insert(row).select(cols).single();
  if (!before103(first.error)) return first;
  return db.from("ask_threads").insert({ workspace_id: row.workspace_id, title: row.title, created_by: row.created_by, project_id: row.project_id }).select(cols).single();
}

/** Record that a chat worked on a piece, and put a chat that wasn't in a folder into Content writing. Never throws. */
export async function linkPiece(db: SupabaseClient, ws: string, threadId: string, itemId: string, userId: string | null) {
  if (!threadId || !itemId) return;
  try {
    await db.from("ask_thread_pieces").upsert({ thread_id: threadId, item_id: itemId, workspace_id: ws }, { onConflict: "thread_id,item_id", ignoreDuplicates: true });
    const { data: t } = await db.from("ask_threads").select("project_id").eq("id", threadId).eq("workspace_id", ws).maybeSingle();
    if (t && !(t as { project_id: string | null }).project_id) {
      const project = await writingProject(db, ws, userId);
      if (project) await db.from("ask_threads").update({ project_id: project }).eq("id", threadId).is("project_id", null);
    }
  } catch (e) {
    console.error("Linking a chat to its piece failed:", e instanceof Error ? e.message : e);
  }
}

/** Each chat's pieces with where they stand, for the given chats. */
export async function writingPieces(db: SupabaseClient, ws: string, threadIds: string[]): Promise<Record<string, WritingPiece[]>> {
  if (!threadIds.length) return {};
  const [links, marked] = await Promise.all([
    db.from("ask_thread_pieces").select("thread_id, item_id, created_at").eq("workspace_id", ws).in("thread_id", threadIds).limit(1000),
    db.from("calendar_items").select("id").eq("workspace_id", ws).in("extra->>autopilot_thread", threadIds).limit(500),
  ]);
  const linkRows = (links.error ? [] : (links.data ?? [])) as { thread_id: string; item_id: string; created_at: string }[];
  const ids = [...new Set([...linkRows.map((l) => l.item_id), ...((marked.data ?? []) as { id: string }[]).map((i) => i.id)])];
  if (!ids.length) return {};
  const [items, briefs, drafts] = await Promise.all([
    db.from("calendar_items").select("id, keyword, status, extra").eq("workspace_id", ws).in("id", ids),
    db.from("writer_briefs").select("item_id, status").eq("workspace_id", ws).in("item_id", ids),
    db.from("writer_drafts").select("item_id, status").eq("workspace_id", ws).in("item_id", ids),
  ]);
  const wanted = new Set(threadIds);
  const out = piecesByThread(linkRows, (items.data ?? []) as { id: string; keyword: string; status: string; extra: Record<string, unknown> | null }[], (briefs.data ?? []) as { item_id: string; status: string }[], (drafts.data ?? []) as { item_id: string; status: string }[]);
  return Object.fromEntries(Object.entries(out).filter(([t]) => wanted.has(t)));
}

/** The chats that worked on one piece, newest first. */
export async function chatsOfItem(db: SupabaseClient, ws: string, itemId: string) {
  const [links, item] = await Promise.all([
    db.from("ask_thread_pieces").select("thread_id").eq("workspace_id", ws).eq("item_id", itemId).limit(100),
    db.from("calendar_items").select("extra").eq("workspace_id", ws).eq("id", itemId).maybeSingle(),
  ]);
  const auto = (item.data as { extra?: Record<string, unknown> | null } | null)?.extra?.autopilot_thread;
  const ids = [...new Set([...((links.error ? [] : links.data) ?? []).map((l) => (l as { thread_id: string }).thread_id), ...(typeof auto === "string" && auto ? [auto] : [])])];
  if (!ids.length) return [];
  const { data } = await db.from("ask_threads").select("id, title, updated_at").eq("workspace_id", ws).in("id", ids).order("updated_at", { ascending: false });
  return (data ?? []) as { id: string; title: string; updated_at: string }[];
}
