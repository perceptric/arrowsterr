"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { useEffect, useRef, useState } from "react";
import { guidelinesSavedAt } from "@/lib/brandStatus";
import { formatDate } from "@/lib/dates";
import { cleanGuidelines, cleanLinks, filePath, FILES_BUCKET, MAX_BODY, MAX_FILE_BYTES, MAX_FILES, type GuidelineFile, type GuidelinesRow } from "@/lib/brandGuidelines";
import { snack } from "./Snack";
import { SkelBlock } from "./states";
import { UploadIcon } from "./ui";

const SETUP = "Guidelines aren't set up for this workspace yet.";
const COLS = "brand_id, body, links, files, updated_at";
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
const size = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/** Brand › Guidelines: the brand's written rules in Markdown, links, and up to 10 reference files. onSaved gets each save. */
export function BrandGuidelines({ sb, workspaceId, brand, canEdit, onSaved }: { sb: SupabaseClient; workspaceId: string; brand: { id: string; name: string }; canEdit: boolean; onSaved?: (at: string | null) => void }) {
  const [row, setRow] = useState<GuidelinesRow | null | undefined>(undefined);
  const [setup, setSetup] = useState(false);
  const [body, setBody] = useState("");
  const [links, setLinks] = useState("");
  const [busy, setBusy] = useState<"" | "save" | "upload">("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  // The newest row, for an Undo that runs after other changes.
  const rowRef = useRef(row);
  useEffect(() => {
    rowRef.current = row;
  });

  useEffect(() => {
    let live = true;
    sb.from("brand_guidelines")
      .select(COLS)
      .eq("brand_id", brand.id)
      .maybeSingle()
      .then(({ data, error: e }) => {
        if (!live) return;
        if (e) {
          if (/brand_guidelines/.test(e.message)) setSetup(true);
          else setError(e.message);
          setRow(null);
          return;
        }
        const r = cleanGuidelines(data);
        setRow(r);
        setBody(r?.body ?? "");
        setLinks(r?.links.join("\n") ?? "");
      });
    return () => {
      live = false;
    };
  }, [sb, brand.id]);

  /** Write the given columns, making the row when there is none yet. */
  async function write(fields: Partial<Pick<GuidelinesRow, "body" | "links" | "files">>) {
    const { data, error: e } = await sb
      .from("brand_guidelines")
      .upsert({ brand_id: brand.id, workspace_id: workspaceId, ...fields, updated_at: new Date().toISOString() }, { onConflict: "brand_id" })
      .select(COLS)
      .single();
    if (e) throw new Error(/brand_guidelines/.test(e.message) ? SETUP : e.message);
    const r = cleanGuidelines(data);
    setRow(r);
    onSaved?.(guidelinesSavedAt(r));
    return r;
  }

  async function save() {
    const { links: list, bad } = cleanLinks(links);
    if (bad.length) return setError(`Not a web address: ${bad.slice(0, 3).join(", ")}`);
    setBusy("save");
    setError("");
    setSaved(false);
    try {
      const r = await write({ body: body.slice(0, MAX_BODY), links: list });
      setLinks(r?.links.join("\n") ?? "");
      setSaved(true);
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy("");
    }
  }

  async function upload(picked: File[]) {
    const files = row?.files ?? [];
    const room = MAX_FILES - files.length;
    if (picked.length > room) return setError(`Up to ${MAX_FILES} files.`);
    const big = picked.find((f) => f.size > MAX_FILE_BYTES);
    if (big) return setError(`${big.name} is over 10 MB.`);
    setBusy("upload");
    setError("");
    const added: GuidelineFile[] = [];
    try {
      for (const f of picked) {
        const path = filePath(workspaceId, brand.id, f.name);
        const { error: e } = await sb.storage.from(FILES_BUCKET).upload(path, f, { contentType: f.type || undefined, upsert: false });
        if (e) throw new Error(/bucket|not found/i.test(e.message) ? SETUP : e.message);
        added.push({ name: f.name.slice(0, 200), path, size: f.size, type: f.type, uploaded_at: new Date().toISOString() });
      }
    } catch (e) {
      setError(message(e));
    }
    try {
      if (added.length) await write({ files: [...files, ...added] });
    } catch (e) {
      setError(message(e));
      await sb.storage.from(FILES_BUCKET).remove(added.map((a) => a.path));
    } finally {
      setBusy("");
    }
  }

  // A delete happens at once. The stored copy waits 10 seconds for Undo, so Undo brings the file back whole.
  async function removeFile(f: GuidelineFile) {
    const was = row;
    setError("");
    if (was) setRow({ ...was, files: was.files.filter((x) => x.path !== f.path) });
    try {
      await write({ files: (was?.files ?? []).filter((x) => x.path !== f.path) });
    } catch (e) {
      setRow(was);
      snack(`Couldn't delete. ${message(e)}`);
      return;
    }
    let undone = false;
    const timer = setTimeout(() => {
      if (!undone) void sb.storage.from(FILES_BUCKET).remove([f.path]);
    }, 10_000);
    snack(`Deleted ${f.name}.`, {
      ms: 10_000,
      undo: async () => {
        undone = true;
        clearTimeout(timer);
        await write({ files: [...(rowRef.current?.files ?? []).filter((x) => x.path !== f.path), f] });
      },
    });
  }

  async function openFile(f: GuidelineFile) {
    const tab = window.open("", "_blank");
    const { data, error: e } = await sb.storage.from(FILES_BUCKET).createSignedUrl(f.path, 3600);
    if (e || !data) {
      tab?.close();
      return setError(e?.message ?? "That file is gone.");
    }
    if (tab) tab.location.href = data.signedUrl;
  }

  if (row === undefined) return <SkelBlock lines={8} />;
  if (setup) return <div className="aw-callout max-w-xl">{SETUP}</div>;
  const files = row?.files ?? [];
  const changed = body !== (row?.body ?? "") || links !== (row?.links.join("\n") ?? "");

  return (
    <section className="flex max-w-3xl flex-col gap-5">
      {error ? <p className="aw-error">{error}</p> : null}

      <div className="aw-frame flex flex-col gap-4 p-5">
        <label className="flex flex-col gap-1.5">
          <span className="aw-label">Guidelines</span>
          <textarea
            value={body}
            disabled={!canEdit}
            maxLength={MAX_BODY}
            onChange={(e) => {
              setBody(e.target.value);
              setSaved(false);
            }}
            rows={16}
            placeholder="Markdown"
            className="aw-textarea font-mono text-[13px]!"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="aw-label">Links</span>
          <textarea
            value={links}
            disabled={!canEdit}
            onChange={(e) => {
              setLinks(e.target.value);
              setSaved(false);
            }}
            rows={3}
            placeholder="https://"
            className="aw-textarea text-[13px]!"
          />
        </label>
        {canEdit ? (
          <span className="flex items-center gap-3">
            <button type="button" className="aw-btn aw-btn--primary aw-btn--sm" disabled={Boolean(busy) || !changed} onClick={save}>
              {busy === "save" ? "Saving..." : "Save"}
            </button>
            {saved ? <span className="aw-small">Saved</span> : changed ? <span className="aw-small">Not saved</span> : row?.updated_at ? <span className="aw-small">Saved {formatDate(row.updated_at)}</span> : null}
          </span>
        ) : null}
      </div>

      <div className="aw-frame flex flex-col">
        <div className="aw-frame__head justify-between">
          <h3 className="aw-h4">Reference files</h3>
          {canEdit ? (
            <label className={`aw-btn aw-btn--secondary aw-btn--sm ${busy || files.length >= MAX_FILES ? "pointer-events-none opacity-50" : "cursor-pointer"}`}>
              <UploadIcon />
              {busy === "upload" ? "Uploading..." : "Upload"}
              <input
                type="file"
                multiple
                className="hidden"
                disabled={Boolean(busy) || files.length >= MAX_FILES}
                onChange={(e) => {
                  const picked = [...(e.target.files ?? [])];
                  e.target.value = "";
                  if (picked.length) void upload(picked);
                }}
              />
            </label>
          ) : null}
        </div>
        {files.length ? (
          <ul>
            {files.map((f) => (
              <li key={f.path} className="flex items-center gap-3 border-t border-rule-faint px-5 py-2.5 first:border-t-0">
                <button type="button" className="aw-text-link min-w-0 flex-1 truncate text-left text-[14px]" onClick={() => openFile(f)}>
                  {f.name}
                </button>
                <span className="aw-num text-[12px] text-muted">{size(f.size)}</span>
                {canEdit ? (
                  <button type="button" className="aw-text-link text-[13px] text-neg!" disabled={Boolean(busy)} onClick={() => removeFile(f)}>
                    Delete
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-5 py-6 text-[13px] text-muted">No files yet</p>
        )}
      </div>

    </section>
  );
}
