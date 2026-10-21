// The Keyword Deep Dive's steps. They read the same status the Editorial Calendar shows, so the two always agree.
// The writer moves that status on when a brief or draft is finished (writerServer.ts). Pure, shared with tests.

export const WORKFLOW = [
  { id: "planned", label: "Planned" },
  { id: "brief", label: "Brief" },
  { id: "draft", label: "Draft" },
  { id: "review", label: "Review" },
  { id: "published", label: "Published" },
] as const;
export type WorkflowStep = (typeof WORKFLOW)[number]["id"];

/** The step for a piece's Editorial Calendar status. */
export function workflowStep(status: "planned" | "brief" | "writing" | "review" | "published"): WorkflowStep {
  return status === "writing" ? "draft" : status;
}

// ─────────────── the Content status picker ───────────────
// The Keyword Deep Dive and the Library grid both use these, so the status reads and changes the same in both.
export type ContentStatus = "planned" | "brief" | "writing" | "review" | "published";

/** The picker's value: a planned piece with no day is still an idea. */
export const statusChoice = (i: { status: ContentStatus; due_date: string | null }) => (i.status === "planned" && !i.due_date ? "idea" : i.status);

/**
 * What picking a status changes. Idea clears the day; Planned on a piece with no day puts it on `monday`
 * (an ISO date the caller picks, the next Monday). Every other status keeps the day.
 */
export function statusPatch(choice: string, dueDate: string | null, monday: string): { status: ContentStatus; due_date?: string | null } {
  if (choice === "idea") return { status: "planned", due_date: null };
  if (choice === "planned" && !dueDate) return { status: "planned", due_date: monday };
  return { status: choice as ContentStatus };
}
