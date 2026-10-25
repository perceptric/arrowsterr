// Settings pages and their groups. Pure, so the address tests can read them.

export type SettingsTab = "profile" | "security" | "notifications" | "settings" | "members" | "access" | "ai" | "brandkit" | "retention" | "integrations" | "publishing" | "billing" | "exports" | "jobs" | BrandTab;

/** Settings each brand has of its own (docs/content-v2.md, Per brand and per workspace). */
export type BrandTab = "publishing" | "google" | "alerts";
export const BRAND_TABS: { id: BrandTab; label: string }[] = [
  { id: "publishing", label: "Publishing sites" },
  { id: "google", label: "Google Analytics" },
  { id: "alerts", label: "Slack and alerts" },
];
export const isBrandTab = (t: string): t is BrandTab => BRAND_TABS.some((b) => b.id === t);

/** Settings pages, grouped the way the settings menu shows them: the person, the brand on screen, the workspace, its tools, then jobs. No group passes 4 tabs. */
export const SETTINGS_GROUPS: {
  label: string;
  tabs: { id: SettingsTab; label: string }[];
}[] = [
  {
    label: "Account",
    tabs: [
      { id: "profile", label: "Profile" },
      { id: "security", label: "Password and security" },
      { id: "notifications", label: "Notifications" },
    ],
  },
  { label: "Brand", tabs: BRAND_TABS },
  {
    label: "Workspace",
    tabs: [
      { id: "settings", label: "General" },
      { id: "members", label: "Members" },
      { id: "access", label: "Identity and access" },
      { id: "retention", label: "Data retention" },
    ],
  },
  {
    label: "Tools",
    tabs: [
      { id: "ai", label: "AI" },
      { id: "brandkit", label: "Brand Kit" },
      { id: "integrations", label: "Slack, API and MCP" },
      { id: "billing", label: "Plans and billing" },
    ],
  },
  {
    label: "Jobs",
    tabs: [
      { id: "exports", label: "Imports and exports" },
      { id: "jobs", label: "Background actions" },
    ],
  },
];

export const SETTINGS_TABS = SETTINGS_GROUPS.flatMap((g) => g.tabs);
export const isSettingsTab = (p: string): p is SettingsTab => SETTINGS_TABS.some((t) => t.id === p);
