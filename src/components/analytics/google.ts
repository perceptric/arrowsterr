import { ENGINE_LOGOS } from "../Engines";

// Small helpers for the Google sign-in on Analytics and in Brand settings.

/** A POST to the app's API for this brand. */
export type Call = (path: string, body: Record<string, unknown>) => Promise<Record<string, unknown>>;

/** The brand's Google sign-in and picks, from /api/seo-analytics "status". */
export type Status = {
  ready: boolean;
  connected: boolean;
  email: string | null;
  gsc: boolean;
  gscProperty: string | null;
  ga4Property: string | null;
  ga4Name: string | null;
  state: { gsc_to: string | null; synced_at: string | null; syncing: boolean; backfilled: boolean; error: string | null } | null;
};

export const GSC_LOGO = "/logos/search-console.png";
export const GA4_LOGO = "/logos/google-analytics.svg";

/** Each AI assistant's logo, for visits from AI. */
export const AI_LOGO: Record<string, string> = { ...ENGINE_LOGOS, Copilot: "https://www.google.com/s2/favicons?domain=copilot.microsoft.com&sz=64" };

/** The GA4 properties the brand's Google sign-in can read: the property's name, with its account under it. */
export const ga4Properties = async (call: Call) =>
  ((await call("/api/ga4", { action: "properties" })).properties as { id: string; name: string; account: string }[]).map((p) => ({ id: p.id, label: p.name, sub: p.account }));

/** A Search Console property as people read it: "sc-domain:a.com" and "https://a.com/" both show a.com. */
export const propertyName = (p: string) => p.replace(/^sc-domain:/, "").replace(/^https?:\/\//, "").replace(/\/$/, "");
