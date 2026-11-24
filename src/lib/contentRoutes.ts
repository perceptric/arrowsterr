// The content pages' addresses (docs/content-v3-plan.md, section 1). Pure, so tests can cover the forwarding.
// Brand moved into Settings; its old addresses are forwarded in App.tsx. Opportunities was the same list as the
// Calendar, so it folded into Calendar; Writer is Zippie writing from the Calendar.

export type ContentPage = "calendar" | "writer" | "library";

export const CONTENT_SLUGS: Record<ContentPage, string> = {
  calendar: "/calendar",
  writer: "/writer",
  library: "/drafts",
};

/** Older addresses: Opportunities and every Content Plan name open Calendar; Content, the Library and the Agentic Writer open Drafts. */
export const CONTENT_ALIASES: Record<string, ContentPage> = {
  "/opportunities": "calendar",
  "/content-plan": "calendar",
  "/agentic-research": "calendar",
  "/topic-bank": "calendar",
  "/planner": "calendar",
  "/inkwell": "calendar",
  "/editorial-calendar": "calendar",
  "/content-calendar": "calendar",
  "/content-intelligence": "calendar",
  "/performance": "calendar",
  "/reports/content": "calendar",
  "/library": "library",
  "/agentic-writer": "library",
  "/content": "library",
};

/** The Content page an address opens, or null when it isn't one. */
export function contentPageFromPath(path: string): ContentPage | null {
  const p = path.replace(/\/+$/, "") || "/";
  return (Object.entries(CONTENT_SLUGS).find(([, slug]) => slug === p)?.[0] as ContentPage | undefined) ?? CONTENT_ALIASES[p] ?? null;
}
