import { ENGINE_LOGOS } from "../Engines";

// Small helpers for the Google sign-in on Analytics and in Brand settings.

type Call = (path: string, body: Record<string, unknown>) => Promise<Record<string, unknown>>;

/** Each AI assistant's logo, for visits from AI. */
export const AI_LOGO: Record<string, string> = { ...ENGINE_LOGOS, Copilot: "https://www.google.com/s2/favicons?domain=copilot.microsoft.com&sz=64" };

/** The GA4 properties the brand's Google sign-in can read: the property's name, with its account under it. */
export const ga4Properties = async (call: Call) =>
  ((await call("/api/ga4", { action: "properties" })).properties as { id: string; name: string; account: string }[]).map((p) => ({ id: p.id, label: p.name, sub: p.account }));

/** A Search Console property as people read it: "sc-domain:a.com" and "https://a.com/" both show a.com. */
export const propertyName = (p: string) => p.replace(/^sc-domain:/, "").replace(/^https?:\/\//, "").replace(/\/$/, "");
