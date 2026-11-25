// Writing chats: Zippie's "Content writing" folder and the Calendar pieces each chat worked on (supabase/103_writing_chats.sql).
// Chats started on the Writer page and Autopilot's daily chats go into the folder; each writer tool records the piece it
// touched on the chat (writingChatsServer.ts). This file is the pure part, shared by the server and the screens.

/** Where a piece stands, from its Calendar row, its outline (writer_briefs) and its draft (writer_drafts). */
export type PieceState = "published" | "draft_ready" | "writing" | "outline_ready" | "failed" | "not_started";
export type WritingPiece = { item_id: string; keyword: string; state: PieceState };
/** Where a chat came from: the Writer page, Autopilot, or anywhere else (null). */
export type ChatKind = "writer" | "autopilot" | null;

export const PROJECT_NAME = "Content writing";

export const STATE_LABEL: Record<PieceState, string> = {
  published: "Published",
  draft_ready: "Draft ready",
  writing: "Writing",
  outline_ready: "Outline ready",
  failed: "Stopped",
  not_started: "Not started",
};

/** The dot's color class for each state. */
export const STATE_DOT: Record<PieceState, string> = {
  published: "bg-pos",
  draft_ready: "bg-pos",
  writing: "bg-warn",
  outline_ready: "bg-brand",
  failed: "bg-neg",
  not_started: "bg-faint",
};

/** The furthest step a piece reached: published, then the draft, then the outline. */
export function pieceState(x: { item?: string | null; brief?: string | null; draft?: string | null }): PieceState {
  if (x.item === "published") return "published";
  if (x.draft === "ready") return "draft_ready";
  if (x.draft === "generating" || x.brief === "generating") return "writing";
  if (x.draft === "failed") return "failed";
  if (x.brief === "ready" || x.brief === "approved") return "outline_ready";
  if (x.brief === "failed") return "failed";
  return "not_started";
}

type Link = { thread_id: string; item_id: string; created_at?: string | null };
type ItemRow = { id: string; keyword: string; status: string; extra?: Record<string, unknown> | null };
type StatusRow = { item_id: string; status: string };

/**
 * Each chat's pieces in the order it first touched them. Links come from ask_thread_pieces; an Autopilot run also
 * marks each piece it started with its chat (calendar_items.extra.autopilot_thread), which counts as a link too.
 */
export function piecesByThread(links: Link[], items: ItemRow[], briefs: StatusRow[], drafts: StatusRow[]): Record<string, WritingPiece[]> {
  const byId = new Map(items.map((i) => [i.id, i]));
  const brief = new Map(briefs.map((b) => [b.item_id, b.status]));
  const draft = new Map(drafts.map((d) => [d.item_id, d.status]));
  const all: Link[] = [...links].sort((a, b) => (a.created_at ?? "").localeCompare(b.created_at ?? ""));
  for (const i of items) {
    const t = i.extra?.autopilot_thread;
    if (typeof t === "string" && t) all.push({ thread_id: t, item_id: i.id });
  }
  const out: Record<string, WritingPiece[]> = {};
  for (const l of all) {
    const item = byId.get(l.item_id);
    if (!item) continue;
    const list = (out[l.thread_id] ??= []);
    if (list.some((p) => p.item_id === item.id)) continue;
    list.push({ item_id: item.id, keyword: item.keyword, state: pieceState({ item: item.status, brief: brief.get(item.id), draft: draft.get(item.id) }) });
  }
  return out;
}

/** Autopilot's chats, by their kind, or by their title for chats saved before kind existed. */
export function isAutopilot(t: { kind?: string | null; title: string }): boolean {
  return t.kind === "autopilot" || (!t.kind && /^Autopilot · /.test(t.title));
}

/** The kind a new chat gets from the page it starts on. */
export function kindOf(where: { page?: string | null } | null | undefined): ChatKind {
  return where?.page === "Writer" ? "writer" : null;
}

/** A writing chat sits in the Content writing folder, came from the Writer or Autopilot, or worked on a piece. */
export function isWritingChat(t: { id: string; title: string; kind?: string | null; project_id: string | null }, projectId: string | null, pieces: Record<string, WritingPiece[]>): boolean {
  return (projectId !== null && t.project_id === projectId) || t.kind === "writer" || isAutopilot(t) || Boolean(pieces[t.id]?.length);
}

/** The chats in the Content writing folder, then the rest, each newest first as given. */
export function splitChats<T extends { id: string; title: string; kind?: string | null; project_id: string | null }>(threads: T[], projectId: string | null, pieces: Record<string, WritingPiece[]>) {
  const writing: T[] = [];
  const other: T[] = [];
  for (const t of threads) (isWritingChat(t, projectId, pieces) ? writing : other).push(t);
  return { writing, other };
}

/** The line under a chat in the sidebar: its first piece's status, and how many more. */
export function chatLine(pieces: WritingPiece[] | undefined): { state: PieceState; text: string } | null {
  if (!pieces?.length) return null;
  const more = pieces.length - 1;
  return { state: pieces[0].state, text: `${STATE_LABEL[pieces[0].state]}${more ? ` · ${more} more` : ""}` };
}
