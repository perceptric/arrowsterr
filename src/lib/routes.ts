// Every page's address, its tab addresses and the old addresses that still work. Pure, so tests can cover them.

import { CONTENT_ALIASES, CONTENT_SLUGS, type ContentPage } from "./contentRoutes.ts";
import type { SettingsTab } from "./settingsTabs.ts";

export type Page = "prompts" | "competitors" | "domains" | "urls" | "keywords" | "domain" | "gap" | ContentPage | "summary" | SettingsTab;

/** Each page's address. "/" opens Prompts. */
export const SLUGS: Record<Page, string> = {
  prompts: "/prompts",
  competitors: "/competitors",
  domains: "/sources",
  urls: "/sources/urls",
  keywords: "/keywords",
  domain: "/domain-research",
  gap: "/competitive-analysis",
  ...CONTENT_SLUGS,
  summary: "/reports",
  profile: "/settings/profile",
  security: "/settings/security",
  notifications: "/settings/notifications",
  settings: "/settings",
  members: "/settings/members",
  access: "/settings/access",
  ai: "/settings/ai",
  brandkit: "/settings/brand-kit",
  retention: "/settings/data-retention",
  integrations: "/settings/integrations",
  publishing: "/settings/publishing",
  google: "/settings/google-analytics",
  alerts: "/settings/alerts",
  billing: "/settings/billing",
  exports: "/settings/imports-exports",
  jobs: "/settings/background-actions",
};

/** Older addresses still open the right page. The Website pages are gone, so their links land on Prompts. */
export const ALIASES: Record<string, Page> = {
  "/zippie": "prompts",
  "/ask": "prompts",
  "/agent": "prompts",
  "/overview": "prompts",
  "/traffic": "prompts",
  "/visitors": "prompts",
  "/analytics": "prompts",
  "/domains": "domains",
  "/urls": "urls",
  "/keyword-research": "keywords",
  "/keyword-gap": "gap",
  "/industry-research": "gap",
  "/ai-gap": "gap",
  ...CONTENT_ALIASES,
  "/plan": "billing",
  "/billing": "billing",
};

/**
 * Tabs with their own address, after the page's: /brand/voice, /reports/links, /editorial-calendar/list.
 * The page's own address is its first tab. Sources' URLs view is its own page ("urls" at /sources/urls).
 */
export const SUBS: Partial<Record<Page, readonly string[]>> = {
  brand: ["voice", "kit", "guidelines"],
  summary: ["schedules", "links"],
  calendar: ["list"],
};

/** Zippie is a panel over any page. /zippie opens it; /zippie/knowledge and /zippie/skills open those tabs. */
export const ZIPPIE_PATHS = ["/zippie", "/ask", "/agent"];
export const ZIPPIE_SUBS = ["knowledge", "skills"] as const;

const clean = (path: string) => path.replace(/\/+$/, "") || "/";

/** The page and tab an address opens. Unknown addresses open Prompts; an unknown tab opens its page. */
export function routeFromPath(path: string): { page: Page; sub?: string } {
  const p = clean(path);
  const exact = (Object.entries(SLUGS).find(([, slug]) => slug === p)?.[0] as Page | undefined) ?? ALIASES[p];
  if (exact) return { page: exact };
  const cut = p.lastIndexOf("/");
  const base = p.slice(0, cut) || "/";
  const sub = p.slice(cut + 1);
  if (ZIPPIE_PATHS.includes(base)) return { page: "prompts" };
  const page = (Object.entries(SLUGS).find(([, slug]) => slug === base)?.[0] as Page | undefined) ?? ALIASES[base];
  if (!page) return { page: "prompts" };
  return SUBS[page]?.includes(sub) ? { page, sub } : { page };
}

/** The page an address opens. */
export const pageFromPath = (path: string): Page => routeFromPath(path).page;

/** The address of a page and one of its tabs. A tab the page doesn't have is left off. */
export function pathFor(page: Page, sub?: string): string {
  return sub && SUBS[page]?.includes(sub) ? `${SLUGS[page]}/${sub}` : SLUGS[page];
}

/** Whether an address opens Zippie, and which of its tabs. */
export function zippieFromPath(path: string): { open: boolean; sub?: string } {
  const p = clean(path);
  if (ZIPPIE_PATHS.includes(p)) return { open: true };
  const cut = p.lastIndexOf("/");
  const sub = p.slice(cut + 1);
  return p.slice(0, cut) === "/zippie" && (ZIPPIE_SUBS as readonly string[]).includes(sub) ? { open: true, sub } : { open: false };
}

/** The address for a Zippie tab. */
export const zippiePath = (sub?: string) => (sub && (ZIPPIE_SUBS as readonly string[]).includes(sub) ? `/zippie/${sub}` : "/zippie");
