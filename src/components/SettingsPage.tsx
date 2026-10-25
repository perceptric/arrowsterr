import type { ReactNode } from "react";
import { SETTINGS_GROUPS, SETTINGS_TABS, type SettingsTab } from "@/lib/settingsTabs";

export { BRAND_TABS, isBrandTab, SETTINGS_GROUPS, SETTINGS_TABS, type BrandTab, type SettingsTab } from "@/lib/settingsTabs";

/** Settings: a menu of areas on the left and the chosen page on the right. The area's name is the screen's one h1. */
export function SettingsPage({ tab, onTab, children }: { tab: SettingsTab; onTab: (t: SettingsTab) => void; children: ReactNode }) {
  const title = SETTINGS_TABS.find((t) => t.id === tab)?.label ?? "Settings";
  return (
    <div className="flex flex-col gap-6 md:flex-row md:gap-10">
      <nav className="flex shrink-0 flex-col gap-4 md:sticky md:top-6 md:w-52 md:self-start" aria-label="Settings">
        <span className="px-2 text-[14px] font-medium text-ink">Settings</span>
        {SETTINGS_GROUPS.map((g) => (
          <div key={g.label} className="flex flex-col gap-0.5">
            <span className="px-2 pb-1 text-[12px] font-semibold text-muted">{g.label}</span>
            {g.tabs.map((t) => (
              <button key={t.id} type="button" aria-current={tab === t.id ? "page" : undefined} onClick={() => onTab(t.id)} className={`aw-mod__item ${tab === t.id ? "is-on" : ""}`}>
                {t.label}
              </button>
            ))}
          </div>
        ))}
      </nav>
      <div className="flex min-w-0 flex-1 flex-col gap-6">
        <h1 className="aw-h3 mb-0!">{title}</h1>
        {children}
      </div>
    </div>
  );
}
