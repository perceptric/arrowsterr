"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import Table from "@tiptap/extension-table";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import TableRow from "@tiptap/extension-table-row";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useEffect, useRef, useState } from "react";
import type { Part } from "@/lib/articleGrid";
import type { PmNode } from "@/lib/docHtml";
import type { RunAuth } from "@/lib/runner";
import { Confirm, Modal } from "../reports/Dialog";
import { post } from "../research/shared";
import { Embed, Note } from "../research/writerNodes";
import { SidePanel } from "../ui";

// One cell of the Library grid, open in the side panel: the intro or one section, with everything the editor does.
// Text, headings, lists, links, tables, images (upload or AI) and HTML blocks. It saves a moment after typing stops,
// and saving by hand locks the cell, so a regenerated article keeps it. Write again asks the writer for a new take.

export type CellSave = { nodes: PmNode[]; lock: boolean };

export function CellPanel({
  sb,
  auth,
  itemId,
  docId,
  part,
  label,
  nodes,
  locked,
  canEdit,
  onSave,
  onLock,
  onAddAfter,
  onDelete,
  onClose,
}: {
  sb: SupabaseClient;
  auth: RunAuth;
  itemId: string;
  docId: string;
  part: Part;
  label: string;
  nodes: PmNode[];
  locked: boolean;
  canEdit: boolean;
  onSave: (s: CellSave) => Promise<void>;
  onLock: (on: boolean) => void;
  onAddAfter: (() => void) | null;
  onDelete: (() => void) | null;
  onClose: () => void;
}) {
  const [state, setState] = useState<{ s: "saved" | "saving" | "error"; note?: string }>({ s: "saved" });
  const [ask, setAsk] = useState<"again" | "image" | "html" | null>(null);
  const [removing, setRemoving] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const saveRef = useRef(onSave);
  useEffect(() => {
    saveRef.current = onSave;
  });

  const flush = async (ed: Editor, lock = true) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setState({ s: "saving" });
    try {
      await saveRef.current({ nodes: ((ed.getJSON() as PmNode).content ?? []) as PmNode[], lock });
      setState({ s: "saved" });
    } catch (e) {
      setState({ s: "error", note: e instanceof Error ? e.message : String(e) });
    }
  };

  const editor = useEditor({
    immediatelyRender: false,
    editable: canEdit,
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3, 4] } }),
      Link.configure({ openOnClick: false }),
      Image.configure({ inline: false, allowBase64: false }),
      Placeholder.configure({ placeholder: part === "intro" ? "Write the intro" : "Write this section" }),
      Note,
      Embed,
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
    ],
    content: { type: "doc", content: nodes.length ? nodes : [{ type: "paragraph" }] },
    onUpdate: ({ editor: ed }) => {
      if (!canEdit) return;
      if (timer.current) clearTimeout(timer.current);
      setState({ s: "saving" });
      timer.current = setTimeout(() => void flush(ed), 1000);
    },
  });
  // Save what's pending when the panel closes.
  useEffect(
    () => () => {
      if (timer.current && editor) {
        clearTimeout(timer.current);
        void saveRef.current({ nodes: ((editor.getJSON() as PmNode).content ?? []) as PmNode[], lock: true }).catch(() => {});
      }
    },
    [editor],
  );

  async function upload(files: File[]) {
    if (!editor) return;
    for (const f of files) {
      if (f.size > 10 * 1024 * 1024) {
        setState({ s: "error", note: `${f.name} is over 10 MB.` });
        continue;
      }
      setState({ s: "saving", note: `Uploading ${f.name}...` });
      const path = `${auth.workspaceId}/${docId}/${Date.now()}-${f.name.toLowerCase().replace(/[^a-z0-9.]+/g, "-")}`;
      const { error } = await sb.storage.from("doc-images").upload(path, f, { contentType: f.type, upsert: false });
      if (error) {
        setState({ s: "error", note: /bucket|not found/i.test(error.message) ? "Run supabase/028_doc_images.sql in Supabase to turn on images." : error.message });
        continue;
      }
      const src = sb.storage.from("doc-images").getPublicUrl(path).data.publicUrl;
      editor.chain().focus().insertContent({ type: "image", attrs: { src, alt: f.name.replace(/\.[a-z0-9]+$/i, "").replace(/[-_]+/g, " ") } }).run();
    }
  }

  const title = (
    <span className="flex items-center gap-2">
      {label}
      {locked ? <span className="tw-tag">Locked</span> : null}
    </span>
  );

  return (
    <SidePanel title={title} kicker={state.note || (state.s === "error" ? "Not saved" : state.s === "saving" ? "Saving" : "Saved")} onClose={onClose}>
      <div className="flex min-h-full flex-col">
        {editor && canEdit ? (
          <div className="sticky top-0 z-10 flex flex-wrap items-center gap-1 border-b border-rule bg-white px-3 py-2">
            <Tools editor={editor} onImage={() => fileInput.current?.click()} onAiImage={() => setAsk("image")} onHtml={() => setAsk("html")} />
            <span className="flex-1" />
            <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm" onClick={() => setAsk("again")}>
              Write again
            </button>
            <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm" onClick={() => onLock(!locked)} title={locked ? "A regenerated article will write this cell again" : "A regenerated article keeps this cell as it is"}>
              {locked ? "Unlock" : "Lock"}
            </button>
            {onAddAfter ? (
              <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm" onClick={onAddAfter}>
                Add section after
              </button>
            ) : null}
            {onDelete ? (
              <button type="button" className="aw-btn aw-btn--danger aw-btn--sm" onClick={() => setRemoving(true)}>
                Delete
              </button>
            ) : null}
          </div>
        ) : null}
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            const files = [...(e.target.files ?? [])];
            e.target.value = "";
            if (files.length) void upload(files);
          }}
        />
        <div className="aw-editor aw-editor--draft flex-1 px-6 py-6 [&_img]:h-auto [&_img]:max-w-full">
          <EditorContent editor={editor} />
        </div>
      </div>

      {ask === "again" && editor ? (
        <AgainDialog
          auth={auth}
          itemId={itemId}
          part={part}
          editor={editor}
          onDone={(next) => {
            editor.commands.setContent({ type: "doc", content: next });
            setAsk(null);
            void flush(editor, false);
          }}
          onClose={() => setAsk(null)}
        />
      ) : null}
      {ask === "image" && editor ? (
        <ImageDialog
          auth={auth}
          itemId={itemId}
          docId={docId}
          onDone={(img) => {
            editor.chain().focus().insertContent({ type: "image", attrs: img }).run();
            setAsk(null);
          }}
          onClose={() => setAsk(null)}
        />
      ) : null}
      {ask === "html" && editor ? (
        <HtmlDialog
          onDone={(html) => {
            editor.chain().focus().insertContent({ type: "embed", attrs: { html } }).run();
            setAsk(null);
          }}
          onClose={() => setAsk(null)}
        />
      ) : null}
      {removing && onDelete ? <Confirm title="Delete this section?" text="The section and everything in it come out of the article." action="Delete" onConfirm={onDelete} onClose={() => setRemoving(false)} /> : null}
    </SidePanel>
  );
}

const svg = (d: React.ReactNode) => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {d}
  </svg>
);
const ICON = {
  image: svg(
    <>
      <rect x={3.5} y={4.5} width={17} height={15} rx={1} />
      <path d="m3.5 16 5-5 4 4 3-3 5 5" />
    </>,
  ),
  spark: svg(<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" />),
  code: svg(<path d="m8 8-4 4 4 4M16 8l4 4-4 4M13.5 5l-3 14" />),
  table: svg(
    <>
      <rect x={3.5} y={4.5} width={17} height={15} rx={1} />
      <path d="M3.5 9.5h17M3.5 14.5h17M9.5 9.5v10M15 9.5v10" />
    </>,
  ),
};

/** Formatting buttons for a cell. */
function Tools({ editor, onImage, onAiImage, onHtml }: { editor: Editor; onImage: () => void; onAiImage: () => void; onHtml: () => void }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const on = () => tick((n) => n + 1);
    editor.on("transaction", on);
    return () => {
      editor.off("transaction", on);
    };
  }, [editor]);
  const c = () => editor.chain().focus();
  const b = (label: React.ReactNode, on: boolean, run: () => void, title: string) => (
    <button key={title} type="button" title={title} aria-label={title} aria-pressed={on} onMouseDown={(e) => e.preventDefault()} onClick={run} className={`aw-tool ${on ? "is-on" : ""}`}>
      {label}
    </button>
  );
  return (
    <span className="flex flex-wrap items-center gap-1">
      {b("H2", editor.isActive("heading", { level: 2 }), () => c().toggleHeading({ level: 2 }).run(), "Heading 2")}
      {b("H3", editor.isActive("heading", { level: 3 }), () => c().toggleHeading({ level: 3 }).run(), "Heading 3")}
      {b("B", editor.isActive("bold"), () => c().toggleBold().run(), "Bold")}
      {b("I", editor.isActive("italic"), () => c().toggleItalic().run(), "Italic")}
      {b("•", editor.isActive("bulletList"), () => c().toggleBulletList().run(), "Bullet list")}
      {b("1.", editor.isActive("orderedList"), () => c().toggleOrderedList().run(), "Numbered list")}
      {b("❝", editor.isActive("blockquote"), () => c().toggleBlockquote().run(), "Quote")}
      {b(ICON.table, editor.isActive("table"), () => c().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(), "Table")}
      {b(ICON.image, false, onImage, "Upload image")}
      {b(ICON.spark, false, onAiImage, "AI image")}
      {b(ICON.code, false, onHtml, "HTML block")}
    </span>
  );
}

/** Write the cell again, with a note. The new text replaces the cell when it lands. */
function AgainDialog({ auth, itemId, part, editor, onDone, onClose }: { auth: RunAuth; itemId: string; part: Part; editor: Editor; onDone: (nodes: PmNode[]) => void; onClose: () => void }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function go() {
    setBusy(true);
    setError("");
    try {
      const first = editor.state.doc.firstChild;
      const h2 = part !== "intro" && first?.type.name === "heading" ? first.textContent : "";
      const out = await post<{ nodes: PmNode[] }>(auth, "/api/agentic-writer/grid", { action: "cell", itemId, part: part === "intro" ? "intro" : "section", h2, index: part === "intro" ? 0 : part, note, current: editor.getText() });
      onDone(out.nodes);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }
  return (
    <Modal title="Write again" onClose={onClose} width="max-w-md">
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void go();
        }}
      >
        <label className="flex flex-col gap-1.5 text-[13px] text-body">
          Note
          <input autoFocus value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} className="aw-input" placeholder="Shorter, with a table of prices" />
        </label>
        {error ? <p className="aw-error">{error}</p> : null}
        <div className="flex justify-end gap-2">
          <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="aw-btn aw-btn--primary aw-btn--sm" disabled={busy}>
            {busy ? "Writing..." : "Write again"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** An AI image from a short description, in the brand's colors. */
function ImageDialog({ auth, itemId, docId, onDone, onClose }: { auth: RunAuth; itemId: string; docId: string; onDone: (img: { src: string; alt: string }) => void; onClose: () => void }) {
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function go() {
    setBusy(true);
    setError("");
    try {
      onDone(await post<{ src: string; alt: string }>(auth, "/api/agentic-writer/grid", { action: "image", itemId, docId, prompt }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }
  return (
    <Modal title="AI image" onClose={onClose} width="max-w-md">
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (prompt.trim()) void go();
        }}
      >
        <label className="flex flex-col gap-1.5 text-[13px] text-body">
          Describe it
          <textarea autoFocus value={prompt} maxLength={500} rows={3} onChange={(e) => setPrompt(e.target.value)} className="aw-input min-h-20 py-2" placeholder="A marketing team comparing agency proposals on a whiteboard" />
        </label>
        {error ? <p className="aw-error">{error}</p> : null}
        <div className="flex justify-end gap-2">
          <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="aw-btn aw-btn--primary aw-btn--sm" disabled={busy || !prompt.trim()}>
            {busy ? "Making..." : "Make image"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** Paste HTML: an embed, a chart, a form. It runs in a sandbox here and goes out as written. */
function HtmlDialog({ onDone, onClose }: { onDone: (html: string) => void; onClose: () => void }) {
  const [html, setHtml] = useState("");
  return (
    <Modal title="HTML block" onClose={onClose} width="max-w-xl">
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (html.trim()) onDone(html.trim());
        }}
      >
        <textarea autoFocus value={html} rows={10} onChange={(e) => setHtml(e.target.value)} aria-label="HTML" className="aw-input min-h-48 py-2 font-mono text-[12px]" placeholder="<div>...</div>" />
        <div className="flex justify-end gap-2">
          <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="aw-btn aw-btn--primary aw-btn--sm" disabled={!html.trim()}>
            Add block
          </button>
        </div>
      </form>
    </Modal>
  );
}
