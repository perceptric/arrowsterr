import type { CalendarStatus } from "@/lib/db";

// What the Editorial Calendar and the keyword deep dive share about a content piece.

export const STATUSES: { id: CalendarStatus; label: string }[] = [
  { id: "planned", label: "Planned" },
  { id: "brief", label: "Outline ready" },
  { id: "writing", label: "Writing" },
  { id: "review", label: "In review" },
  { id: "published", label: "Published" },
];

/** Whether this workspace has the Agentic Writer, and how to get it. */
export type WriterAccess = { open: boolean; onUpgrade?: () => void };
