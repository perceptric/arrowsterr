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
