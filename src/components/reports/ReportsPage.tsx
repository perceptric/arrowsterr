"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { useCallback, useEffect, useState } from "react";
import { fileLine, PDF_PAGES } from "@/lib/pdf/pages";
import type { ReportLimits } from "@/lib/plans";
import type { RunAuth } from "@/lib/runner";
import { ToolIntro } from "../ToolIntro";
import { Seg, Thinking } from "../ui";
import { Confirm } from "./Dialog";
import { LinksTab } from "./LinksTab";
import { errText, openFile, post } from "./reportApi";
import { SchedulesTab } from "./SchedulesTab";

// Reports (docs/reports.md, section 32.4): every PDF made from a page's Download PDF or a schedule, newest first;
// the schedules that email them; and the links shared from Prompts and Competitors.

type FileRow = { id: string; brand_id: string | null; page: string; title: string; design: "arrowsterr" | "brand"; params: Record<string, unknown>; status: "making" | "ready" | "failed"; error: string | null; source: "download" | "schedule"; created_at: string };
const COLS = "id, brand_id, page, title, design, params, status, error, source, created_at";
export const when = (t: string) => new Date(t).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
type Tab = "files" | "schedules" | "links";

export function ReportsPage({
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
  const [tab, setTab] = useState<Tab>("files");
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
        <Downloads sb={sb} auth={auth} brands={brands} canEdit={canEdit} />
      ) : tab === "schedules" ? (
        <SchedulesTab sb={sb} auth={auth} brands={brands} canEdit={canEdit} limits={limits} historyDays={historyDays} onUpgrade={onUpgrade} />
      ) : (
        <LinksTab sb={sb} auth={auth} brands={brands} canEdit={canEdit} secure={Boolean(limits?.secure)} />
      )}
    </div>
  );
}

function Downloads({ sb, auth, brands, canEdit }: { sb: SupabaseClient; auth: RunAuth; brands: { id: string; name: string }[]; canEdit: boolean }) {
  const [files, setFiles] = useState<FileRow[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [deleting, setDeleting] = useState<FileRow | null>(null);

  const load = useCallback(async () => {
    const { data, error: e } = await sb.from("report_files").select(COLS).eq("workspace_id", auth.workspaceId).order("created_at", { ascending: false }).limit(200);
    if (e) setError(/report_files/.test(e.message) ? "Run supabase/046_report_files.sql in Supabase." : e.message);
    else setFiles((data ?? []) as FileRow[]);
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
    setBusy(f.id);
    try {
      await post(auth, "/api/files", { action: "delete", fileId: f.id });
      setFiles((x) => x?.filter((y) => y.id !== f.id) ?? null);
      setDeleting(null);
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy("");
    }
  }

  if (!files) return error ? <p className="aw-error max-w-2xl">{error}</p> : <Thinking text="Loading your reports..." />;
  const brandName = (id: string | null) => brands.find((b) => b.id === id)?.name ?? "–";

  return (
    <>
      {error ? <p className="aw-error">{error}</p> : null}
      {!files.length ? (
        <ToolIntro
          title="Every PDF you download lands here"
          lead="Click Download PDF on any page. Pick the Arrowsterr design or your Brand Kit's, and the file is kept here to download again."
        />
      ) : (
        <section className="aw-frame overflow-x-auto">
          <table className="aw-table aw-table--compact">
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
            <tbody>
              {files.map((f) => (
                <tr key={f.id}>
                  <td className="font-medium text-ink">
                    {f.title || PDF_PAGES.find((p) => p.id === f.page)?.title}
                    {f.source === "schedule" ? <span className="aw-status aw-status--pending ml-2 align-middle">Scheduled</span> : null}
                  </td>
                  <td>{brandName(f.brand_id)}</td>
                  <td className="aw-num text-[13px]">{fileLine(f.page, f.params ?? {})}</td>
                  <td>{f.design === "brand" ? "Brand Kit" : "Arrowsterr"}</td>
                  <td className="text-[13px] text-muted">{when(f.created_at)}</td>
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
                        <button type="button" className="aw-btn aw-btn--ghost aw-btn--sm" disabled={busy === f.id} onClick={() => setDeleting(f)}>
                          Delete
                        </button>
                      ) : null}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
      {deleting ? <Confirm title="Delete this PDF?" text="The file goes for everyone in this workspace." action="Delete" busy={busy === deleting.id} onConfirm={() => remove(deleting)} onClose={() => setDeleting(null)} /> : null}
    </>
  );
}
