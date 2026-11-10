"use client";

import { useEffect, useState } from "react";
import type { CrawlSettings } from "@/lib/tech/limits";
import { SidePanel, Thinking } from "../ui";
import { num } from "./shared";

// Crawl settings for the brand: how many pages (inside the plan's limit), how fast, which URLs, and two switches.
// Saved on the brand and copied onto each crawl when it starts.

export function SettingsPanel({ call, canEdit, onClose }: { call: (action: string, extra?: Record<string, unknown>) => Promise<Record<string, unknown>>; canEdit: boolean; onClose: () => void }) {
  const [s, setS] = useState<CrawlSettings | null>(null);
  const [max, setMax] = useState(0);
  const [include, setInclude] = useState("");
  const [exclude, setExclude] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  useEffect(() => {
    call("settings", { read: true })
      .then((r) => {
        const x = r.settings as CrawlSettings;
        setS(x);
        setMax(Number(r.max));
        setInclude(x.include.join("\n"));
        setExclude(x.exclude.join("\n"));
      })
      .catch((e) => setMsg(e instanceof Error ? e.message : String(e)));
  }, [call]);
  async function save() {
    if (!s) return;
    setSaving(true);
    setMsg("");
    try {
      const r = await call("settings", { settings: { ...s, include: include.split("\n"), exclude: exclude.split("\n") } });
      setS(r.settings as CrawlSettings);
      setMsg("Saved. The next crawl uses these settings.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }
  return (
    <SidePanel title="Crawl settings" onClose={onClose} narrow>
      {!s ? (
        msg ? <p className="aw-error">{msg}</p> : <Thinking text="Loading" />
      ) : (
        <form
          className="flex flex-col gap-5 text-[13.5px]"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <label className="flex flex-col gap-1.5">
            <span className="font-medium text-ink">Pages per crawl</span>
            <input id="crawl-limit" type="number" min={10} max={max} className="aw-input" value={s.limit} disabled={!canEdit} onChange={(e) => setS({ ...s, limit: Number(e.target.value) })} />
            <span className="text-[12px] text-muted">Up to {num(max)} on your plan.</span>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="font-medium text-ink">Speed</span>
            <input id="crawl-speed" type="range" min={1} max={10} value={s.speed} disabled={!canEdit} onChange={(e) => setS({ ...s, speed: Number(e.target.value) })} />
            <span className="text-[12px] text-muted">{s.speed} {s.speed === 1 ? "request" : "requests"} a second. Lower it if your server struggles.</span>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="font-medium text-ink">Only crawl URLs containing</span>
            <textarea id="crawl-include" className="aw-textarea min-h-20 font-mono text-[13px]" value={include} disabled={!canEdit} onChange={(e) => setInclude(e.target.value)} placeholder={"/blog/\n/docs/"} />
            <span className="text-[12px] text-muted">One per line. Leave empty to crawl everything. /a regex/ works too.</span>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="font-medium text-ink">Skip URLs containing</span>
            <textarea id="crawl-exclude" className="aw-textarea min-h-20 font-mono text-[13px]" value={exclude} disabled={!canEdit} onChange={(e) => setExclude(e.target.value)} placeholder={"/tag/\n/wp-admin/"} />
          </label>
          <label className="flex items-center gap-2.5">
            <input id="crawl-query" type="checkbox" className="h-4 w-4 accent-[var(--signal)]" checked={s.dropQuery} disabled={!canEdit} onChange={(e) => setS({ ...s, dropQuery: e.target.checked })} />
            <span>Ignore query parameters (?sort=, ?page=)</span>
          </label>
          <label className="flex items-center gap-2.5">
            <input id="crawl-subs" type="checkbox" className="h-4 w-4 accent-[var(--signal)]" checked={s.subdomains} disabled={!canEdit} onChange={(e) => setS({ ...s, subdomains: e.target.checked })} />
            <span>Include subdomains (blog.yoursite.com)</span>
          </label>
          {msg ? <p className="text-[13px] text-muted">{msg}</p> : null}
          {canEdit ? (
            <div>
              <button type="submit" className="aw-btn aw-btn--primary" disabled={saving}>
                {saving ? "Saving" : "Save settings"}
              </button>
            </div>
          ) : null}
        </form>
      )}
    </SidePanel>
  );
}
