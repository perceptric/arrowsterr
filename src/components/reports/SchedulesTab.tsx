"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { AiPage } from "@/lib/pdf/pages";
import { PDF_PAGES } from "@/lib/pdf/pages";
import type { ReportLimits } from "@/lib/plans";
import type { RunAuth } from "@/lib/runner";
import { MAX_MONTHDAY, recipientList, WEEKDAYS, whenLine, type Cadence } from "@/lib/schedules";
import { Dropdown } from "../Pickers";
import { ToolIntro } from "../ToolIntro";
import { Seg, Thinking } from "../ui";
import { Confirm, Modal } from "./Dialog";
import { errText, openFile, post } from "./reportApi";

// Reports → Schedules (docs/reports.md, section 32.4): a brand's pages emailed weekly or monthly as PDFs, one email
// per send. Editors add, change, pause and delete; everyone sees the history. Research pages are download-only.

type Schedule = {
  id: string;
  brand_id: string;
  name: string;
  pages: AiPage[];
  design: "arrowsterr" | "brand";
  params: { days?: number };
  cadence: Cadence;
  weekday: number | null;
  monthday: number | null;
  hour: number;
  timezone: string;
  recipients: string[];
  subject: string | null;
  active: boolean;
  next_run_at: string | null;
  last_run_at: string | null;
  created_at: string;
};
type Send = { id: string; due_at: string; status: "working" | "sent" | "failed"; sent_at: string | null; error: string | null; file_ids: string[]; recipients?: string[] };
const COLS = "id, brand_id, name, pages, design, params, cadence, weekday, monthday, hour, timezone, recipients, subject, active, next_run_at, last_run_at, created_at";
const AI_PAGES = PDF_PAGES.filter((p): p is { id: AiPage; title: string } => p.id === "prompts" || p.id === "competitors" || p.id === "sources");
const DAYS = [7, 30, 60, 90];
const browserZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
const at = (t: string, tz: string) => new Date(t).toLocaleString("en-US", { timeZone: tz, month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });

export function SchedulesTab({
  sb,
  auth,
  brands,
  canEdit,
  limits,
  historyDays,
  onUpgrade,
}: {
  sb: SupabaseClient;
  auth: RunAuth;
  brands: { id: string; name: string }[];
  canEdit: boolean;
  limits: ReportLimits | null;
  historyDays: number;
  onUpgrade: () => void;
}) {
  const [list, setList] = useState<Schedule[] | null>(null);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<Schedule | "new" | null>(null);
  const [history, setHistory] = useState<Schedule | null>(null);
  const [deleting, setDeleting] = useState<Schedule | null>(null);
  const [busy, setBusy] = useState("");
  const [limitHit, setLimitHit] = useState(false);

  const load = useCallback(async () => {
    const { data, error: e } = await sb.from("report_schedules").select(COLS).eq("workspace_id", auth.workspaceId).order("created_at");
    if (e) setError(/report_schedules/.test(e.message) ? "Run supabase/046_report_files.sql in Supabase." : e.message);
    else setList((data ?? []) as Schedule[]);
  }, [sb, auth.workspaceId]);
  useEffect(() => {
    // Loading the schedules when the tab opens is the point of this effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const fail = (e: unknown) => {
    setError(errText(e));
    setLimitHit(Boolean((e as { limit?: boolean }).limit));
  };

  async function pause(s: Schedule) {
    setBusy(s.id);
    setError("");
    try {
      const { schedule } = await post<{ schedule: Schedule }>(auth, "/api/schedules", { action: "pause", id: s.id, active: !s.active });
      setList((x) => x?.map((y) => (y.id === s.id ? schedule : y)) ?? null);
    } catch (e) {
      fail(e);
    } finally {
      setBusy("");
    }
  }

  async function remove(s: Schedule) {
    setBusy(s.id);
    try {
      await post(auth, "/api/schedules", { action: "delete", id: s.id });
      setList((x) => x?.filter((y) => y.id !== s.id) ?? null);
      setDeleting(null);
    } catch (e) {
      fail(e);
    } finally {
      setBusy("");
    }
  }

  if (!list) return error ? <p className="aw-error max-w-2xl">{error}</p> : <Thinking text="Loading your schedules..." />;
  const max = limits?.schedules ?? 0;
  const brandName = (id: string) => brands.find((b) => b.id === id)?.name ?? "–";
  const pageTitle = (p: string) => AI_PAGES.find((x) => x.id === p)?.title ?? p;
  const upgrade = (
    <button type="button" className="aw-btn aw-btn--primary aw-btn--sm" onClick={onUpgrade}>
      Upgrade
    </button>
  );
  const addButton =
    canEdit && max > 0 ? (
      <button type="button" className="aw-btn aw-btn--primary aw-btn--sm self-start" onClick={() => setEditing("new")}>
        New schedule
      </button>
    ) : null;

  return (
    <>
      {error ? (
        <div className="flex flex-wrap items-center gap-3">
          <p className="aw-error">{error}</p>
          {limitHit ? upgrade : null}
        </div>
      ) : null}
      {!list.length ? (
        <div className="flex flex-col gap-4">
          <ToolIntro title="Send reports on a schedule" lead="Pick a brand, its pages and who gets them. Each week or month, one email goes out with a PDF for each page." />
          {max > 0 ? (
            addButton
          ) : (
            <div className="aw-callout flex flex-wrap items-center gap-3 self-start">
              Scheduled reports are on Starter and up.
              {canEdit ? upgrade : null}
            </div>
          )}
        </div>
      ) : (
        <>
          {addButton}
          <section className="aw-frame overflow-x-auto">
            <table className="aw-table aw-table--compact">
              <thead>
                <tr>
                  <th>Schedule</th>
                  <th>Pages</th>
                  <th>When</th>
                  <th>To</th>
                  <th>Next send</th>
                  <th>State</th>
                  <th className="w-72" aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {list.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <span className="block font-medium text-ink">{s.name}</span>
                      <span className="text-[12px] text-muted">{brandName(s.brand_id)}</span>
                    </td>
                    <td className="text-[13px]">{s.pages.map(pageTitle).join(", ")}</td>
                    <td className="text-[13px]">
                      {whenLine(s)}
                      <span className="block text-[12px] text-muted">{s.timezone.replace(/_/g, " ")}</span>
                    </td>
                    <td className="text-[13px]" title={s.recipients.join(", ")}>
                      {s.recipients.length === 1 ? s.recipients[0] : `${s.recipients.length} people`}
                    </td>
                    <td className="text-[13px] text-muted">{s.active && s.next_run_at ? at(s.next_run_at, s.timezone) : "–"}</td>
                    <td>{s.active ? <span className="aw-status aw-status--ranked">Active</span> : <span className="aw-status aw-status--pending">Paused</span>}</td>
                    <td className="text-right">
                      <span className="inline-flex items-center gap-2">
                        <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm" onClick={() => setHistory(s)}>
                          History
                        </button>
                        {canEdit ? (
                          <>
                            <button type="button" className="aw-btn aw-btn--ghost aw-btn--sm" disabled={busy === s.id} onClick={() => pause(s)}>
                              {s.active ? "Pause" : "Resume"}
                            </button>
                            <button type="button" className="aw-btn aw-btn--ghost aw-btn--sm" onClick={() => setEditing(s)}>
                              Edit
                            </button>
                            <button type="button" className="aw-btn aw-btn--ghost aw-btn--sm" disabled={busy === s.id} onClick={() => setDeleting(s)}>
                              Delete
                            </button>
                          </>
                        ) : null}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}
      {editing ? (
        <Editor
          auth={auth}
          brands={brands}
          start={editing === "new" ? null : editing}
          whiteLabel={Boolean(limits?.whiteLabel)}
          historyDays={historyDays}
          onClose={() => setEditing(null)}
          onSaved={(s) => {
            setList((x) => (x?.some((y) => y.id === s.id) ? x.map((y) => (y.id === s.id ? s : y)) : [...(x ?? []), s]));
            setEditing(null);
          }}
          onUpgrade={onUpgrade}
        />
      ) : null}
      {history ? <History sb={sb} auth={auth} schedule={history} onClose={() => setHistory(null)} /> : null}
      {deleting ? (
        <Confirm title="Delete this schedule?" text="No more emails go out from it. PDFs it already made stay in Downloads." action="Delete" busy={busy === deleting.id} onConfirm={() => remove(deleting)} onClose={() => setDeleting(null)} />
      ) : null}
    </>
  );
}

/** Add a schedule, or change one. */
function Editor({
  auth,
  brands,
  start,
  whiteLabel,
  historyDays,
  onClose,
  onSaved,
  onUpgrade,
}: {
  auth: RunAuth;
  brands: { id: string; name: string }[];
  start: Schedule | null;
  whiteLabel: boolean;
  historyDays: number;
  onClose: () => void;
  onSaved: (s: Schedule) => void;
  onUpgrade: () => void;
}) {
  const [name, setName] = useState(start?.name ?? "");
  const [brandId, setBrandId] = useState(start?.brand_id ?? brands[0]?.id ?? "");
  const [pages, setPages] = useState<AiPage[]>(start?.pages ?? ["prompts"]);
  const [days, setDays] = useState(start?.params.days ?? 30);
  const [design, setDesign] = useState<"arrowsterr" | "brand">(start?.design ?? (whiteLabel ? "brand" : "arrowsterr"));
  const [cadence, setCadence] = useState<Cadence>(start?.cadence ?? "weekly");
  const [weekday, setWeekday] = useState(start?.weekday ?? 1);
  const [monthday, setMonthday] = useState(start?.monthday ?? 1);
  const [hour, setHour] = useState(start?.hour ?? 9);
  const [timezone, setTimezone] = useState(start?.timezone ?? browserZone());
  const [recipients, setRecipients] = useState((start?.recipients ?? []).join("\n"));
  const [subject, setSubject] = useState(start?.subject ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ text: string; limit: boolean } | null>(null);
  const zones = useMemo(() => {
    const all = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : ["UTC"];
    return [...new Set([timezone, ...all])].map((z) => ({ id: z, label: z.replace(/_/g, " ") }));
  }, [timezone]);
  const emails = recipientList(recipients);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const schedule = { brandId, name, pages, design, params: { days }, cadence, weekday, monthday, hour, timezone, recipients: emails.emails.concat(emails.bad), subject };
      const { schedule: s } = await post<{ schedule: Schedule }>(auth, "/api/schedules", { id: start?.id, schedule });
      onSaved(s);
    } catch (e) {
      setError({ text: errText(e), limit: Boolean((e as { limit?: boolean }).limit) });
    } finally {
      setBusy(false);
    }
  }

  const label = (text: string, field: React.ReactNode) => (
    <label className="flex flex-col gap-1.5">
      <span className="text-[12px] font-medium text-muted">{text}</span>
      {field}
    </label>
  );

  return (
    <Modal title={start ? "Edit schedule" : "New schedule"} onClose={onClose} width="max-w-2xl">
      <div className="grid gap-4 sm:grid-cols-2">
        {label("Name", <input value={name} onChange={(e) => setName(e.target.value)} placeholder={cadence === "weekly" ? "Weekly report" : "Monthly report"} maxLength={120} className="aw-input w-full" />)}
        {label("Brand", <Dropdown label="Brand" value={brandId} onChange={setBrandId} className="aw-dropdown--field w-full" options={brands.map((b) => ({ id: b.id, label: b.name }))} />)}
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="text-[12px] font-medium text-muted">Pages</span>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Pages">
          {AI_PAGES.map((p) => {
            const on = pages.includes(p.id);
            return (
              <button key={p.id} type="button" aria-pressed={on} className={`aw-chip aw-chip--btn ${on ? "aw-chip--brand" : ""}`} onClick={() => setPages((x) => (on ? x.filter((y) => y !== p.id) : AI_PAGES.map((q) => q.id).filter((id) => id === p.id || x.includes(id))))}>
                {p.title}
              </button>
            );
          })}
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {label("Dates", <Dropdown label="Dates" value={days} onChange={setDays} className="aw-dropdown--field w-full" options={DAYS.filter((d) => d <= historyDays).map((d) => ({ id: d, label: `Last ${d} days` }))} />)}
        {label(
          "Design",
          <Dropdown
            label="Design"
            value={design}
            onChange={setDesign}
            className="aw-dropdown--field w-full"
            options={[{ id: "arrowsterr" as const, label: "Arrowsterr" }, ...(whiteLabel ? [{ id: "brand" as const, label: "Brand Kit" }] : [])]}
          />,
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="text-[12px] font-medium text-muted">Repeats</span>
        <div className="flex">
          <Seg
            label="Repeats"
            value={cadence}
            onChange={setCadence}
            options={[
              { id: "weekly", label: "Weekly" },
              { id: "monthly", label: "Monthly" },
            ]}
          />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        {cadence === "weekly"
          ? label("Day", <Dropdown label="Day of the week" value={weekday} onChange={setWeekday} className="aw-dropdown--field w-full" options={WEEKDAYS.map((d, i) => ({ id: i, label: d }))} />)
          : label("Day", <Dropdown label="Day of the month" value={monthday} onChange={setMonthday} className="aw-dropdown--field w-full" options={Array.from({ length: MAX_MONTHDAY }, (_, i) => ({ id: i + 1, label: String(i + 1) }))} />)}
        {label("Time", <Dropdown label="Time" value={hour} onChange={setHour} className="aw-dropdown--field w-full" options={Array.from({ length: 24 }, (_, h) => ({ id: h, label: `${String(h).padStart(2, "0")}:00` }))} />)}
        {label("Time zone", <Dropdown label="Time zone" value={timezone} onChange={setTimezone} className="aw-dropdown--field w-full" options={zones} />)}
      </div>
      {label(
        "Email addresses",
        <textarea value={recipients} onChange={(e) => setRecipients(e.target.value)} rows={3} placeholder={"client@acme.com\nteam@acme.com"} className="aw-textarea w-full" aria-label="Email addresses, one per line" />,
      )}
      {label("Subject", <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder={`${brands.find((b) => b.id === brandId)?.name ?? "Brand"}: ${name || (cadence === "weekly" ? "Weekly report" : "Monthly report")}`} maxLength={200} className="aw-input w-full" />)}
      {error ? (
        <div className="flex flex-wrap items-center gap-3">
          <p className="aw-error">{error.text}</p>
          {error.limit ? (
            <button type="button" className="aw-btn aw-btn--primary aw-btn--sm" onClick={onUpgrade}>
              Upgrade
            </button>
          ) : null}
        </div>
      ) : null}
      <div className="tw-modal__actions">
        <button type="button" className="aw-btn aw-btn--secondary" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="aw-btn aw-btn--primary" disabled={busy || !brandId || !pages.length || !emails.emails.length} onClick={save}>
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
    </Modal>
  );
}

/** Every send of one schedule, newest first, with its PDFs. */
function History({ sb, auth, schedule, onClose }: { sb: SupabaseClient; auth: RunAuth; schedule: Schedule; onClose: () => void }) {
  const [sends, setSends] = useState<Send[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");

  useEffect(() => {
    let live = true;
    // "*" so the list still loads before supabase/056_report_schedules.sql adds who each send went to.
    sb.from("report_sends")
      .select("*")
      .eq("schedule_id", schedule.id)
      .order("due_at", { ascending: false })
      .limit(30)
      .then(({ data, error: e }) => {
        if (!live) return;
        if (e) setError(e.message);
        else setSends((data ?? []) as Send[]);
      });
    return () => {
      live = false;
    };
  }, [sb, schedule.id]);

  async function download(fileId: string) {
    setBusy(fileId);
    setError("");
    try {
      const why = await openFile(auth, fileId);
      if (why) setError(why);
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy("");
    }
  }

  return (
    <Modal title={schedule.name} onClose={onClose} width="max-w-2xl">
      {error ? <p className="aw-error">{error}</p> : null}
      {!sends ? (
        error ? null : <Thinking text="Loading the history..." />
      ) : !sends.length ? (
        <p className="text-[13px] text-muted">{schedule.active && schedule.next_run_at ? `First send ${at(schedule.next_run_at, schedule.timezone)}.` : "Nothing sent yet."}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="aw-table aw-table--compact">
            <thead>
              <tr>
                <th>Due</th>
                <th>State</th>
                <th>To</th>
                <th aria-label="PDFs" />
              </tr>
            </thead>
            <tbody>
              {sends.map((s) => (
                <tr key={s.id}>
                  <td className="whitespace-nowrap text-[13px]">{at(s.due_at, schedule.timezone)}</td>
                  <td>
                    {s.status === "sent" ? (
                      <span className="aw-status aw-status--ranked">Sent</span>
                    ) : s.status === "failed" ? (
                      <span className="aw-status aw-status--missed" title={s.error ?? undefined}>
                        Failed
                      </span>
                    ) : (
                      <span className="aw-status aw-status--pending">Sending</span>
                    )}
                    {s.status === "failed" && s.error ? <span className="block text-[12px] text-muted">{s.error}</span> : null}
                  </td>
                  <td className="whitespace-nowrap text-[13px]" title={s.recipients?.join(", ")}>
                    {s.recipients?.length ? (s.recipients.length === 1 ? s.recipients[0] : `${s.recipients.length} people`) : "–"}
                  </td>
                  <td className="text-right">
                    <span className="inline-flex flex-wrap justify-end gap-2">
                      {s.file_ids.map((id, i) => (
                        <button key={id} type="button" className="aw-btn aw-btn--secondary aw-btn--sm" disabled={busy === id} onClick={() => download(id)}>
                          {s.file_ids.length === schedule.pages.length ? (AI_PAGES.find((p) => p.id === schedule.pages[i])?.title ?? "PDF") : `PDF ${i + 1}`}
                        </button>
                      ))}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}
