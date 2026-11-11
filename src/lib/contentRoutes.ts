// The Content group's addresses (docs/content-v2.md and docs/drafts-plan.md, The sidebar). Pure, so tests can cover
// the forwarding. Brand moved into Settings; its old addresses are forwarded in App.tsx.

export type ContentPage = "calendar" | "library";

export const CONTENT_SLUGS: Record<ContentPage, string> = {
  calendar: "/editorial-calendar",
  library: "/drafts",
};

/** Older addresses: Opportunities, the Calendar and every Content Plan name open the Editorial Calendar; Content, the Library and the Agentic Writer open Drafts. */
export const CONTENT_ALIASES: Record<string, ContentPage> = {
  "/opportunities": "calendar",
  "/calendar": "calendar",
  "/content-calendar": "calendar",
  "/content-plan": "calendar",
  "/agentic-research": "calendar",
  "/topic-bank": "calendar",
  "/planner": "calendar",
  "/inkwell": "calendar",
  "/content-intelligence": "calendar",
  "/performance": "calendar",
  "/reports/content": "calendar",
  "/library": "library",
  "/writer": "library",
  "/agentic-writer": "library",
  "/content": "library",
};

/** The Content page an address opens, or null when it isn't one. */
export function contentPageFromPath(path: string): ContentPage | null {
  const p = path.replace(/\/+$/, "") || "/";
  return (Object.entries(CONTENT_SLUGS).find(([, slug]) => slug === p)?.[0] as ContentPage | undefined) ?? CONTENT_ALIASES[p] ?? null;
}
