// The words for the states of Zippie's change sets and audit issues. Pure, so tests can cover them.

const LABEL: Record<string, string> = {
  ready: "Waiting",
  proposed: "Waiting",
  approved: "Approved",
  applied: "Live",
  undone: "Undone",
  rejected: "Skipped",
  failed: "Failed",
  partly: "Partly live",
  preparing: "Preparing",
  applying: "Making live",
  running: "Running",
  done: "Done",
};

/** A status as people read it, in sentence case: "partly" is "Partly live", "high" is "High". Missing prints "–". */
export function statusLabel(s: string | null | undefined): string {
  if (!s) return "–";
  return LABEL[s] ?? s[0].toUpperCase() + s.slice(1).replace(/_/g, " ");
}
