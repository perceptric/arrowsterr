// Agentic Writing's one button (docs/agentic-writing.md, section 1): what a piece's Write cell shows, from its
// Editorial Calendar status, its outline (writer_briefs) and its draft (writer_drafts). The Calendar, the Day panel,
// the Library grid and the Keyword Deep Dive all read it here, so they always show the same button. Pure.

type Brief = { id: string; status: "generating" | "ready" | "approved" | "failed"; step: string; error: string | null };
type Draft = { id: string; brief_id: string; doc_id: string | null; status: "generating" | "ready" | "failed"; step: string; error: string | null };

export type WriteState =
  | { kind: "outline" }
  | { kind: "busy"; label: string }
  | { kind: "draft"; briefId: string }
  | { kind: "publish"; docId: string; draftId: string; briefId: string }
  | { kind: "view"; url: string; docId: string | null }
  | { kind: "retry"; target: "outline" | "draft"; error: string; briefId: string | null };

const BRIEF_STEP: Record<string, string> = { research: "Researching", writing: "Outlining", done: "Outlining" };
const DRAFT_STEP: Record<string, string> = { sections: "Writing", style: "Reviewing", check: "Checking", images: "Images", modules: "Building modules", save: "Saving", done: "Saving" };

/** The busy tag for a brief or draft step. */
export const stepLabel = (kind: "brief" | "draft", step: string) => (kind === "brief" ? BRIEF_STEP[step] : DRAFT_STEP[step]) ?? (kind === "brief" ? "Outlining" : "Writing");

/**
 * The Write cell for one piece. A live post wins. Then the draft: being written, ready to publish, or failed.
 * Then the outline: being written, failed, or ready (an approved outline with no draft still offers Write draft).
 */
export function writeState({ item, brief, draft }: { item: { status: string; url: string | null }; brief: Brief | null; draft: Draft | null }): WriteState {
  if (item.status === "published" && item.url) return { kind: "view", url: item.url, docId: draft?.doc_id ?? null };
  if (draft) {
    if (draft.status === "generating") return { kind: "busy", label: stepLabel("draft", draft.step) };
    if (draft.status === "ready") return draft.doc_id ? { kind: "publish", docId: draft.doc_id, draftId: draft.id, briefId: draft.brief_id } : { kind: "busy", label: "Saving" };
    return { kind: "retry", target: "draft", error: draft.error || "The draft stopped.", briefId: draft.brief_id };
  }
  if (brief) {
    if (brief.status === "generating") return { kind: "busy", label: stepLabel("brief", brief.step) };
    if (brief.status === "failed") return { kind: "retry", target: "outline", error: brief.error || "The outline stopped.", briefId: brief.id };
    return { kind: "draft", briefId: brief.id };
  }
  return { kind: "outline" };
}

/** True while the writer works on the piece, so the screen keeps asking. */
export const isBusy = (s: WriteState) => s.kind === "busy";

/** Which Library filter a piece falls under. */
export function libraryGroup(s: WriteState): "outlines" | "drafts" | "published" | "none" {
  if (s.kind === "view") return "published";
  if (s.kind === "publish" || (s.kind === "retry" && s.target === "draft")) return "drafts";
  if (s.kind === "draft" || (s.kind === "retry" && s.target === "outline")) return "outlines";
  if (s.kind === "busy") return /^(Researching|Outlining)$/.test(s.label) ? "outlines" : "drafts";
  return "none";
}
