"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { useCallback, useEffect, useState } from "react";
import { fileLine, PDF_PAGES } from "@/lib/pdf/pages";
import type { ReportLimits } from "@/lib/plans";
import type { RunAuth } from "@/lib/runner";
import { ago } from "@/lib/dates";
import { pathFor } from "@/lib/routes";
import { askConfirm } from "../Dialogs";
import { BlockError, SkelRows } from "../states";
import { ToolIntro } from "../ToolIntro";
import { Seg } from "../ui";
import { LinksTab } from "./LinksTab";
import { errText, openFile, post } from "./reportApi";
import { SchedulesTab } from "./SchedulesTab";

// Reports (docs/reports.md, section 32.4): every PDF made from a page's Download PDF or a schedule, newest first;
// the schedules that email them; and the links shared from Prompts and Competitors.

type FileRow = { id: string; brand_id: string | null; page: string; title: string; design: "arrowsterr" | "brand"; params: Record<string, unknown>; status: "making" | "ready" | "failed"; error: string | null; source: "download" | "schedule"; created_at: string };
const COLS = "id, brand_id, page, title, design, params, status, error, source, created_at";
const LIMIT = 200;
type Tab = "files" | "schedules" | "links";
// The app follows the address: a new history entry with a popstate opens Prompts (as Zippie's setup card does).
const goToPrompts = () => {
  window.history.pushState(null, "", pathFor("prompts"));
  window.dispatchEvent(new PopStateEvent("popstate"));
};
const tabFrom = (sub?: string): Tab => (sub === "schedules" || sub === "links" ? sub : "files");

export function ReportsPage({
  sb,
  auth,
  brands,
  canEdit,
  limits,
  historyDays,
  onUpgrade,
  sub,
  onSub,
  onOpenPrompts,
}: {
  sb: SupabaseClient;
  auth: RunAuth;
  brands: { id: string; name: string }[];
  canEdit: boolean;
  limits: ReportLimits | null;
  historyDays: number;
  onUpgrade: () => void;
  /** The tab from the address (/reports/schedules, /reports/links) and how to change it. */
  sub?: string;
  onSub?: (sub?: string) => void;
  /** Opens Prompts, where Download PDF and Share live. */
  onOpenPrompts?: () => void;
}) {
  // The address leads; without onSub the tab still works on its own.
  const [own, setOwn] = useState<Tab>(tabFrom(sub));
  const tab = onSub ? tabFrom(sub) : own;
  const setTab = (t: Tab) => (onSub ? onSub(t === "files" ? undefined : t) : setOwn(t));
  const openPrompts = (
    <button type="button" className="aw-btn aw-btn--secondary" onClick={onOpenPrompts ?? goToPrompts}>
      Open Prompts
    </button>
  );
  return (
    <div className="flex flex-col gap-6">
      <h1 className="aw-h2">Reports</h1>
      <div className="flex">
        <Seg
          label="Reports"
          value={tab}
          onChange={setTab}
          options={[
            { id: "files", label: "Downloads" },
            { id: "schedules", label: "Schedules" },
            { id: "links", label: "Links" },
          ]}
        />
      </div>
      {tab === "files" ? (
        <Downloads sb={sb} auth={auth} brands={brands} canEdit={canEdit} openPrompts={openPrompts} />
      ) : tab === "schedules" ? (
        <SchedulesTab sb={sb} auth={auth} brands={brands} canEdit={canEdit} limits={limits} historyDays={historyDays} onUpgrade={onUpgrade} />
      ) : (
        <LinksTab sb={sb} auth={auth} brands={brands} canEdit={canEdit} secure={Boolean(limits?.secure)} openPrompts={openPrompts} />
      )}
    </div>
  );
}

const HEAD = (
  <thead>
    <tr>
      <th>Report</th>
      <th>Brand</th>
      <th>Dates</th>
      <th>Design</th>
      <th>Made</th>
      <th className="w-48" aria-label="Actions" />
    </tr>
  </thead>
);

function Downloads({ sb, auth, brands, canEdit, openPrompts }: { sb: SupabaseClient; auth: RunAuth; brands: { id: string; name: string }[]; canEdit: boolean; openPrompts: React.ReactNode }) {
  const [files, setFiles] = useState<FileRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    setFailed(false);
    const { data, error: e } = await sb.from("report_files").select(COLS).eq("workspace_id", auth.workspaceId).order("created_at", { ascending: false }).limit(LIMIT);
    if (e) {
      console.error("report_files", e.message);
      setFailed(true);
    } else setFiles((data ?? []) as FileRow[]);
  }, [sb, auth.workspaceId]);
  useEffect(() => {
    // Loading the files when the tab opens is the point of this effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function download(f: FileRow) {
    setBusy(f.id);
    setError("");
    try {
      const why = await openFile(auth, f.id);
      if (why) setError(why);
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy("");
    }
  }

  async function remove(f: FileRow) {
    if (!(await askConfirm({ title: "Delete this PDF?", text: "The file goes for everyone in this workspace.", action: "Delete", danger: true }))) return;
    setBusy(f.id);
    setError("");
    try {
      await post(auth, "/api/files", { action: "delete", fileId: f.id });
      setFiles((x) => x?.filter((y) => y.id !== f.id) ?? null);
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy("");
    }
  }

  const brandName = (id: string | null) => brands.find((b) => b.id === id)?.name ?? "–";

  if (files && !files.length)
    return <ToolIntro eyebrow="Reports" title="Every PDF you download lands here" lead="Click Download PDF on any page. Pick the Arrowsterr design or your Brand Kit's, and the file is kept here to download again." action={openPrompts} />;

  return (
    <div className="flex flex-col gap-3">
      {files ? (
        <p className="aw-small">
          <span className="aw-num">{files.length.toLocaleString("en-US")}</span> {files.length === 1 ? "PDF" : "PDFs"}
          {files.length >= LIMIT ? ", latest 200" : ""}
        </p>
      ) : null}
      {error ? <p className="aw-error">{error}</p> : null}
      <section className="aw-frame overflow-x-auto">
        {failed ? (
          <div className="p-4">
            <BlockError what="reports" onRetry={load} />
          </div>
        ) : (
          <table className="aw-table aw-table--compact">
            {HEAD}
            <tbody>
              {!files ? (
                <SkelRows rows={5} cols={6} />
              ) : (
                files.map((f) => (
                  <tr key={f.id}>
                    <td>
                      <span className="block font-medium text-ink">{f.title || PDF_PAGES.find((p) => p.id === f.page)?.title}</span>
                      {f.source === "schedule" ? <span className="block text-[12px] text-muted">From a schedule</span> : null}
                    </td>
                    <td>{brandName(f.brand_id)}</td>
                    <td className="aw-num text-[13px]">{fileLine(f.page, f.params ?? {})}</td>
                    <td>{f.design === "brand" ? "Brand Kit" : "Arrowsterr"}</td>
                    <td className="text-[13px] text-muted" title={new Date(f.created_at).toLocaleString("en-US")}>
                      {ago(f.created_at)}
                    </td>
                    <td className="text-right">
                      <span className="inline-flex items-center gap-2">
                        {f.status === "ready" ? (
                          <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm" disabled={busy === f.id} onClick={() => download(f)}>
                            Download
                          </button>
                        ) : f.status === "failed" ? (
                          <span className="aw-status aw-status--missed" title={f.error ?? undefined}>
                            Failed
                          </span>
                        ) : (
                          <span className="aw-status aw-status--pending">Making</span>
                        )}
                        {canEdit ? (
                          <button type="button" className="aw-btn aw-btn--ghost aw-btn--sm" disabled={busy === f.id} onClick={() => remove(f)}>
                            Delete
                          </button>
                        ) : null}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
