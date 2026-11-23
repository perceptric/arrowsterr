"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Editor } from "@tiptap/react";
import { useCallback, useEffect, useState } from "react";
import { docToHtml } from "@/lib/docHtml";
import { ago, getVersion, listVersions, saveVersion, type DocVersion, type Me } from "@/lib/docCollab";
import { Confirm, Modal } from "../reports/Dialog";

// An article's saved versions in Drafts: made on their own while someone edits (the article screen saves one before
// the first edit of a visit and then every ten minutes of edits) or by hand with a name. Any version can be read and
// restored; restoring saves the current text as a version first, so it can be undone the same way.

export function DocHistory({
  sb,
  workspaceId,
  docId,
  editor,
  title,
  words,
  me,
  canEdit,
  stamp,
}: {
  sb: SupabaseClient;
  workspaceId: string;
  docId: string;
  editor: Editor | null;
  title: string;
  words: number;
  me: Me | null;
  canEdit: boolean;
  /** Changes when a version was saved elsewhere (the automatic ones), so the list reloads. */
  stamp: number;
}) {
  const [rows, setRows] = useState<DocVersion[] | null>(null);
  const [error, setError] = useState("");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState("");
  const [view, setView] = useState<{ v: DocVersion; html: string } | null>(null);
  const [restoring, setRestoring] = useState<DocVersion | null>(null);

  const load = useCallback(async () => {
    try {
      setRows(await listVersions(sb, docId));
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [sb, docId]);
  useEffect(() => {
    // Loading the versions is the point of this effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load, stamp]);

  async function saveNow() {
    if (!editor) return;
    setBusy("save");
    try {
      await saveVersion(sb, { workspaceId, docId, title, content: editor.getJSON() as Record<string, unknown>, words, label: label.trim() || "Saved by hand", me });
      setLabel("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy("");
    }
  }
  async function open(v: DocVersion) {
    setBusy(v.id);
    try {
      const full = await getVersion(sb, v.id);
      setView({ v, html: docToHtml(full.content) });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy("");
    }
  }
  async function restore(v: DocVersion) {
    if (!editor) return;
    setBusy(v.id);
    try {
      const full = await getVersion(sb, v.id);
      await saveVersion(sb, { workspaceId, docId, title, content: editor.getJSON() as Record<string, unknown>, words, label: "Before restoring", me });
      // emitUpdate, so the editor saves the restored text like any edit.
      editor.commands.setContent(full.content, true);
      setRestoring(null);
      setView(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="flex flex-col gap-3 px-4 py-4">
      {canEdit ? (
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void saveNow();
          }}
        >
          <label className="flex min-w-0 flex-1 flex-col gap-1 text-[12px] text-muted">
            Name this version (optional)
            <input value={label} maxLength={120} onChange={(e) => setLabel(e.target.value)} placeholder="Sent to the client" className="aw-input" />
          </label>
          <button type="submit" className="aw-btn aw-btn--secondary aw-btn--sm" disabled={!editor || busy === "save"}>
            {busy === "save" ? "Saving..." : "Save version"}
          </button>
        </form>
      ) : null}
      {error ? <p className="text-[13px] text-muted">{error}</p> : null}
      {!rows && !error ? <p className="text-[13px] text-muted">Loading versions...</p> : null}
      {rows && !rows.length ? <p className="text-[13px] text-muted">No versions yet. One is saved before your first edit, then every ten minutes while you edit.</p> : null}
      {rows?.length ? (
        <ul className="flex flex-col">
          {rows.map((v, i) => {
            const older = rows[i + 1];
            const d = older ? v.words - older.words : 0;
            return (
              <li key={v.id} className={`flex flex-col gap-1 py-2.5 ${i ? "border-t border-rule-faint" : ""}`}>
                <span className="text-[13px] font-medium text-ink">{v.label || "Saved while editing"}</span>
                <span className="aw-num text-[12px] text-muted">
                  {v.author_name || "Someone"} · {ago(v.created_at)} · {v.words.toLocaleString("en-US")} words
                  {d ? ` (${d > 0 ? "+" : "−"}${Math.abs(d)})` : ""}
                </span>
                <span className="flex items-center gap-3 text-[12px]">
                  <button type="button" className="aw-text-link" disabled={busy === v.id} onClick={() => void open(v)}>
                    Read
                  </button>
                  {canEdit ? (
                    <button type="button" className="aw-text-link" disabled={busy === v.id || !editor} onClick={() => setRestoring(v)}>
                      Restore
                    </button>
                  ) : null}
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}

      {view ? (
        <Modal title={view.v.label || `Version from ${new Date(view.v.created_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`} onClose={() => setView(null)} width="max-w-3xl">
          <div className="flex flex-col gap-4">
            <div className="aw-editor aw-editor--draft max-h-[60vh] overflow-y-auto border border-rule-faint px-6 py-5 [&_img]:h-auto [&_img]:max-w-full">
              <h1 className="mb-4 text-[24px] font-semibold text-ink">{view.v.title}</h1>
              {/* A saved version of this workspace's own article, rendered by docToHtml (which escapes text and drops unsafe links). */}
              <div dangerouslySetInnerHTML={{ __html: view.html.replace(/<div data-aw-module="[^"]*"[^>]*><\/div>/g, '<p class="text-muted">[Interactive element]</p>') }} />
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm" onClick={() => setView(null)}>
                Close
              </button>
              {canEdit ? (
                <button type="button" className="aw-btn aw-btn--primary aw-btn--sm" disabled={!editor} onClick={() => setRestoring(view.v)}>
                  Restore this version
                </button>
              ) : null}
            </div>
          </div>
        </Modal>
      ) : null}
      {restoring ? (
        <Confirm
          title="Restore this version?"
          text="The article's text goes back to this version. Your current text is saved as a version first, so you can restore it later. The title stays as it is."
          action="Restore"
          busy={busy === restoring.id}
          error={error}
          onConfirm={() => restore(restoring)}
          onClose={() => setRestoring(null)}
        />
      ) : null}
    </div>
  );
}
