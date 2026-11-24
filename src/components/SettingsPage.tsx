import type { ReactNode } from "react";
import { NavIcon } from "./NavIcon";

export type SettingsTab = "profile" | "security" | "notifications" | "settings" | "members" | "access" | "ai" | "brandkit" | "retention" | "integrations" | "publishing" | "billing" | "exports" | "jobs" | BrandTab;

/** Settings each brand has of its own (docs/content-v2.md, Per brand and per workspace). Brand's own page moved here. */
export type BrandTab = "voice" | "kit" | "guidelines" | "publishing" | "google" | "shopsettings" | "alerts";
/** Publishing sites moved to Publish › Sites (docs/content-v3-plan.md, section 1); the tab id stays for BrandSettings. */
export const BRAND_TABS: { id: BrandTab; label: string; icon: string }[] = [
  { id: "voice", label: "Tone of voice", icon: "voice" },
  { id: "kit", label: "Brand Kit", icon: "palette" },
  { id: "guidelines", label: "Guidelines", icon: "book" },
  { id: "google", label: "Google Analytics", icon: "trend" },
  { id: "shopsettings", label: "AI Shopping", icon: "bag" },
  { id: "alerts", label: "Slack and alerts", icon: "megaphone" },
];
export const isBrandTab = (t: string): t is BrandTab => BRAND_TABS.some((b) => b.id === t);

/** Settings pages, grouped the way the sidebar shows them: the person, the brand on screen, then the workspace. */
export const SETTINGS_GROUPS: {
  label: string;
  tabs: { id: SettingsTab; label: string; icon: string }[];
}[] = [
  {
    label: "Account",
    tabs: [
      { id: "profile", label: "Profile", icon: "user" },
      { id: "security", label: "Password and security", icon: "lock" },
      { id: "notifications", label: "Notifications", icon: "bell" },
    ],
  },
  { label: "Brand", tabs: BRAND_TABS },
  {
    label: "Workspace",
    tabs: [
      { id: "settings", label: "General", icon: "gear" },
      { id: "members", label: "Members", icon: "competitors" },
      { id: "access", label: "Identity and access", icon: "shield" },
      { id: "ai", label: "AI", icon: "bot" },
      { id: "brandkit", label: "Workspace Brand Kit", icon: "palette" },
      { id: "retention", label: "Data retention", icon: "archive" },
      { id: "integrations", label: "Slack, API and MCP", icon: "plug" },
      { id: "billing", label: "Plans & billing", icon: "card" },
    ],
  },
  {
    label: "Jobs",
    tabs: [
      { id: "exports", label: "Imports and exports", icon: "swap" },
      { id: "jobs", label: "Background actions", icon: "clock" },
    ],
  },
];

export const SETTINGS_TABS = SETTINGS_GROUPS.flatMap((g) => g.tabs);

/** Settings: a sidebar of areas on the left and the chosen page on the right. */
export function SettingsPage({ tab, onTab, children }: { tab: SettingsTab; onTab: (t: SettingsTab) => void; children: ReactNode }) {
  const title = SETTINGS_TABS.find((t) => t.id === tab)?.label ?? "Settings";
  return (
    <div className="flex flex-col gap-6 md:flex-row md:gap-10">
      <nav className="flex shrink-0 flex-col gap-4 md:sticky md:top-6 md:w-52 md:self-start" aria-label="Settings">
        <h1 className="aw-h2 mb-0!">Settings</h1>
        {SETTINGS_GROUPS.map((g) => (
          <div key={g.label} className="flex flex-col gap-0.5">
            <span className="px-2 pb-1 text-[12px] font-semibold text-muted">{g.label}</span>
            {g.tabs.map((t) => (
              <button key={t.id} type="button" aria-current={tab === t.id ? "page" : undefined} onClick={() => onTab(t.id)} className={`aw-mod__item ${tab === t.id ? "is-on" : ""}`}>
                <NavIcon name={t.icon} />
                {t.label}
              </button>
            ))}
          </div>
        ))}
      </nav>
      <div className="flex min-w-0 flex-1 flex-col gap-6">
        <h2 className="aw-h3 mb-0!">{title}</h2>
        {children}
      </div>
    </div>
  );
}
