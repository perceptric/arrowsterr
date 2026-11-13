// The content pages' addresses (docs/content-v3-plan.md, section 1). Pure, so tests can cover the forwarding.
// Brand moved into Settings; its old addresses are forwarded in App.tsx.

export type ContentPage = "opportunities" | "calendar" | "library";

export const CONTENT_SLUGS: Record<ContentPage, string> = {
  opportunities: "/opportunities",
  calendar: "/calendar",
  library: "/drafts",
};

/** Older addresses: every Content Plan name opens Opportunities; the Editorial Calendar opens Calendar; Content, the Library and the Agentic Writer open Drafts. */
export const CONTENT_ALIASES: Record<string, ContentPage> = {
  "/content-plan": "opportunities",
  "/agentic-research": "opportunities",
  "/topic-bank": "opportunities",
  "/planner": "opportunities",
  "/inkwell": "opportunities",
  "/editorial-calendar": "calendar",
  "/content-calendar": "calendar",
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
