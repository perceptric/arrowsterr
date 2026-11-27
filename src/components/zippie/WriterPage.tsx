"use client";

// Plan & Create › Writer: Zippie, full width, as the content writer. It picks from the Calendar (pick_content), writes
// outlines and articles (write-outline, write-article) and shows each piece as a card that updates as it's written.
// Autopilot writes on a schedule from the same Calendar; its settings live on the brand's site (contentPicks.ts).

import type { SupabaseClient } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import { AUTOPILOT_OFF, cleanAutopilot, hourLabel, localClock, type Autopilot } from "@/lib/contentPicks";
import { getWorkspaceSettings, saveSite, type Brand, type Site } from "@/lib/db";
import { putStash } from "@/lib/stash";
import { Dropdown } from "../Pickers";
import { Modal } from "../reports/Dialog";
import { useBrandSite } from "../writer/parts";
import { I, Icon } from "./Cards";
import { ZippieHome, type Suggestion } from "./Chat";
import { RecentWriting } from "./WritingChats";
import { useZippie } from "./ZippieContext";
import { errorText } from "@/lib/errors";
import { ErrorNote } from "../ui";

const START: Suggestion[] = [
  { text: "Write today's top pick", skill: "system:write-article" },
  { text: "Outline the next 3 posts", skill: "system:write-outline" },
  "What's next on my Calendar?",
];

const cadenceLabel = (a: Autopilot) => (a.cadence === "weekdays" ? "Weekdays" : "Every day");

export function WriterPage({ sb, brand, canEdit, userId, workspaceId }: { sb: SupabaseClient; brand: Brand; canEdit: boolean; userId: string; workspaceId: string }) {
  const z = useZippie();
  const { site } = useBrandSite(sb, brand, canEdit);
  const [tz, setTz] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    getWorkspaceSettings(sb, workspaceId)
      .then((s) => setTz(s?.timezone ?? null))
      .catch(() => {});
  }, [sb, workspaceId]);
  const auto = cleanAutopilot(site?.profile.autopilot);
  const status = auto.on ? `${cadenceLabel(auto)}, ${hourLabel(auto.hour)}` : "Off";

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-end gap-2">
        <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm" disabled={!site} onClick={() => setEditing(true)}>
          <span className={`inline-block h-2 w-2 rounded-full ${auto.on ? "bg-pos" : "bg-faint"}`} aria-hidden="true" />
          Autopilot · {status}
        </button>
        {z.messages.length ? (
          <button type="button" className="zp-icon-btn" onClick={z.newChat} aria-label="New chat" title="New chat">
            <Icon d={I.plus} />
          </button>
        ) : null}
      </div>
      <ZippieHome
        hello="What should Zippie write?"
        intro="Zippie picks from your Calendar, researches the topic, outlines it from what people search and writes the draft."
        start={START}
        footer={
          <>
            {auto.on ? (
              <p className="flex items-center gap-2 text-[13px] text-muted">
                <span className="inline-block h-2 w-2 rounded-full bg-pos" aria-hidden="true" />
                Autopilot writes {auto.count === 1 ? "1 article" : `${auto.count} articles`} {auto.cadence === "weekdays" ? "every weekday" : "every day"} at {hourLabel(auto.hour)}.
              </p>
            ) : null}
            <RecentWriting />
          </>
        }
      />
      {editing && site ? <AutopilotDialog site={site} brand={brand} tz={tz} userId={userId} canEdit={canEdit} sb={sb} onClose={() => setEditing(false)} /> : null}
    </div>
  );
}

/** Autopilot's settings for one brand. Saving makes the person who saves it the one the runs start as. */
function AutopilotDialog({ sb, site, brand, tz, userId, canEdit, onClose }: { sb: SupabaseClient; site: Site; brand: Brand; tz: string | null; userId: string; canEdit: boolean; onClose: () => void }) {
  const saved = cleanAutopilot(site.profile.autopilot);
  const [a, setA] = useState<Autopilot>(site.profile.autopilot ? saved : { ...AUTOPILOT_OFF, on: true });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const clock = localClock(new Date(), tz);
  const laterToday = clock.hour < a.hour && saved.lastRun !== clock.day && (a.cadence === "daily" || (clock.weekday >= 1 && clock.weekday <= 5));
  const next = !a.on ? "Autopilot is off." : `Next run: ${laterToday ? "today" : "the next run day"} at ${hourLabel(a.hour)}${tz ? ` (${tz})` : " (UTC)"}. It stops when the month's drafts run out.`;

  async function save() {
    setBusy(true);
    setError("");
    try {
      const next: Site = { ...site, profile: { ...site.profile, autopilot: { ...a, by: userId, lastRun: saved.lastRun ?? null } } };
      await saveSite(sb, next);
      putStash(`site:${brand.id}`, next);
      onClose();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  const row = (label: string, control: React.ReactNode) => (
    <div className="flex min-h-12 items-center justify-between gap-4 border-t border-rule-faint">
      <span className="text-[14px] text-muted">{label}</span>
      {control}
    </div>
  );
  const tile = (on: boolean, title: string, note: string, pick: () => void) => (
    <button
      type="button"
      aria-pressed={on}
      disabled={!canEdit || !a.on}
      onClick={pick}
      className={`flex flex-col items-start gap-0.5 rounded-aw-lg border px-3.5 py-3 text-left ${on ? "border-brand bg-brand-bg" : "border-rule bg-white hover:border-brand"}`}
    >
      <span className={`text-[14px] font-medium ${on ? "text-brand" : "text-ink"}`}>{title}</span>
      <span className="text-[12px] text-muted">{note}</span>
    </button>
  );

  return (
    <Modal title="Autopilot" onClose={onClose} width="max-w-xl">
      <div className="flex flex-col gap-4">
        <label className="flex items-start justify-between gap-4">
          <span className="flex flex-col gap-0.5">
            <span className="text-[14px] font-medium text-ink">Write on a schedule</span>
            <span className="text-[13px] text-muted">Zippie picks the best pieces from {brand.name}&apos;s Calendar and writes them.</span>
          </span>
          <input type="checkbox" checked={a.on} disabled={!canEdit} onChange={(e) => setA({ ...a, on: e.target.checked })} aria-label="Write on a schedule" />
        </label>
        <div className="flex flex-col">
          {row(
            "How often",
            <Dropdown label="How often" value={a.cadence} disabled={!canEdit || !a.on} onChange={(v) => setA({ ...a, cadence: v })} options={[{ id: "daily" as const, label: "Every day" }, { id: "weekdays" as const, label: "Weekdays" }]} />,
          )}
          {row("Time", <Dropdown label="Time" value={a.hour} disabled={!canEdit || !a.on} onChange={(v) => setA({ ...a, hour: v })} options={Array.from({ length: 24 }, (_, h) => ({ id: h, label: hourLabel(h) }))} />)}
          {row("Articles each time", <Dropdown label="Articles each time" value={a.count} disabled={!canEdit || !a.on} onChange={(v) => setA({ ...a, count: v })} options={[1, 2, 3].map((n) => ({ id: n, label: String(n) }))} />)}
          <div className="flex flex-col gap-2.5 border-t border-rule-faint py-3.5">
            <span className="text-[14px] text-muted">Go as far as</span>
            <div className="grid grid-cols-2 gap-2">
              {tile(a.stop === "outline", "The outline", "You review it, then write the draft", () => setA({ ...a, stop: "outline" }))}
              {tile(a.stop === "draft", "The full draft", "Outline, then draft, no stop", () => setA({ ...a, stop: "draft" }))}
            </div>
          </div>
          {a.stop === "draft" ? (
            <div className="flex flex-col gap-2.5 border-t border-rule-faint py-3.5">
              <span className="text-[14px] text-muted">When the draft is done</span>
              <div className="grid grid-cols-3 gap-2">
                {tile(a.after === "keep", "Keep in Drafts", "You publish it", () => setA({ ...a, after: "keep" }))}
                {tile(a.after === "draft", "Send as a draft", "To your site, unpublished", () => setA({ ...a, after: "draft" }))}
                {tile(a.after === "live", "Publish live", "On its Calendar date", () => setA({ ...a, after: "live" }))}
              </div>
            </div>
          ) : null}
        </div>
        <p className="text-[13px] text-muted">
          {next}{" "}
          {a.stop === "outline" || a.after === "keep" ? "Finished pieces wait in Drafts for you to publish." : a.after === "draft" ? "Finished drafts go to the brand's first connected site as unpublished drafts." : "Finished drafts go live on the brand's first connected site on their Calendar date (9:00 UTC), or right away when the date has passed."}
        </p>
        {error ? <ErrorNote error={error} /> : null}
        <div className="flex justify-end gap-2">
          <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm" onClick={onClose}>
            Cancel
          </button>
          {canEdit ? (
            <button type="button" className="aw-btn aw-btn--primary aw-btn--sm" disabled={busy} onClick={() => void save()}>
              {busy ? "Saving..." : "Save"}
            </button>
          ) : null}
        </div>
      </div>
    </Modal>
  );
}
