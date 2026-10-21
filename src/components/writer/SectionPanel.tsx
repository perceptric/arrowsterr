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
import type { Part, SectionNotes } from "@/lib/articleGrid";
import type { PmNode } from "@/lib/docHtml";
import { Modal } from "../reports/Dialog";
import { Embed, Note } from "../research/writerNodes";
import { SidePanel } from "../ui";

// One section of an article, open in the side panel so a writer can work section by section: what the brief
// says to write in it, then the editor (text, headings, lists, links, tables, images and HTML blocks).
// It saves a moment after typing stops. Back and Next move along the article; Full view opens the whole doc.

export function SectionPanel({
  sb,
  workspaceId,
  docId,
  part,
  label,
  nodes,
  notes,
  canEdit,
  onSave,
  onMove,
  canBack,
  canNext,
  onFull,
  onGenerate,
  onClose,
}: {
  sb: SupabaseClient;
  workspaceId: string;
  docId: string;
  part: Part;
  label: string;
  nodes: PmNode[];
  notes: SectionNotes | null;
  canEdit: boolean;
  onSave: (nodes: PmNode[]) => Promise<void>;
  onMove: (step: -1 | 1) => void;
  canBack: boolean;
  canNext: boolean;
  onFull: () => void;
  /** Open the Generate screen for this section, or null when it can't be used. */
  onGenerate: (() => void) | null;
  onClose: () => void;
}) {
  const [state, setState] = useState<{ s: "saved" | "saving" | "error"; note?: string }>({ s: "saved" });
  const [html, setHtml] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const saveRef = useRef(onSave);
  useEffect(() => {
    saveRef.current = onSave;
  });

  const nodesOf = (ed: Editor) => ((ed.getJSON() as PmNode).content ?? []) as PmNode[];
  const flush = async (ed: Editor) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setState({ s: "saving" });
    try {
      await saveRef.current(nodesOf(ed));
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
      Placeholder.configure({ placeholder: ({ node }) => (node.type.name === "heading" ? "Heading" : part === "intro" ? "Write the intro" : "Write this section") }),
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
  // Save what's pending when the panel closes or moves to another section.
  useEffect(
    () => () => {
      if (timer.current && editor) {
        clearTimeout(timer.current);
        void saveRef.current(nodesOf(editor)).catch(() => {});
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
      const path = `${workspaceId}/${docId}/${Date.now()}-${f.name.toLowerCase().replace(/[^a-z0-9.]+/g, "-")}`;
      const { error } = await sb.storage.from("doc-images").upload(path, f, { contentType: f.type, upsert: false });
      if (error) {
        setState({ s: "error", note: /bucket|not found/i.test(error.message) ? "Run supabase/028_doc_images.sql in Supabase to turn on images." : error.message });
        continue;
      }
      const src = sb.storage.from("doc-images").getPublicUrl(path).data.publicUrl;
      editor.chain().focus().insertContent({ type: "image", attrs: { src, alt: f.name.replace(/\.[a-z0-9]+$/i, "").replace(/[-_]+/g, " ") } }).run();
    }
  }

  const arrow = (d: string, label: string, run: () => void, on: boolean) => (
    <button type="button" className="aw-iconbtn" title={label} aria-label={label} disabled={!on} onClick={run}>
      <svg className="aw-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d={d} />
      </svg>
    </button>
  );

  return (
    <SidePanel title={label} kicker={state.note || (state.s === "error" ? "Not saved" : state.s === "saving" ? "Saving" : "Saved")} onClose={onClose}>
      <div className="flex min-h-full flex-col">
        <div className="sticky top-0 z-10 flex flex-wrap items-center gap-1 border-b border-rule bg-white px-3 py-2">
          {editor && canEdit ? <Tools editor={editor} onImage={() => fileInput.current?.click()} onHtml={() => setHtml(true)} /> : null}
          <span className="flex-1" />
          {arrow("M15 6l-6 6 6 6", "Previous section", () => onMove(-1), canBack)}
          {arrow("M9 6l6 6-6 6", "Next section", () => onMove(1), canNext)}
          <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm" onClick={onFull}>
            Full view
          </button>
          {onGenerate ? (
            <button
              type="button"
              className="aw-btn aw-btn--primary aw-btn--sm"
              onClick={async () => {
                // Save what's typed first, so the writer builds on it.
                if (editor && timer.current) await flush(editor);
                onGenerate();
              }}
            >
              Generate
            </button>
          ) : null}
        </div>
        {notes && (notes.points.length || notes.sources.length || notes.images.length) ? (
          <div className="mx-6 mt-5 flex flex-col gap-2 border border-rule bg-[var(--bg-secondary)] px-4 py-3 text-[13px]">
            <span className="text-[12px] font-medium text-muted">Brief</span>
            {notes.points.length ? (
              <ul className="flex list-disc flex-col gap-1 pl-4 text-ink">
                {notes.points.map((p, i) => (
                  <li key={i}>{p}</li>
                ))}
              </ul>
            ) : null}
            {notes.images.length ? (
              <span className="flex flex-col gap-1">
                <span className="text-[12px] font-medium text-muted">Images</span>
                <ul className="flex list-disc flex-col gap-1 pl-4 text-ink">
                  {notes.images.map((m, i) => (
                    <li key={i}>{m}</li>
                  ))}
                </ul>
              </span>
            ) : null}
            {notes.sources.length ? (
              <span className="flex flex-wrap gap-x-3 gap-y-1">
                {notes.sources.map((s) => (
                  <a key={s.n} href={s.url} target="_blank" rel="noopener noreferrer" className="aw-text-link max-w-[260px] truncate text-[12px]">
                    [{s.n}] {s.title}
                  </a>
                ))}
              </span>
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
      {html && editor ? (
        <HtmlDialog
          onDone={(code) => {
            editor.chain().focus().insertContent({ type: "embed", attrs: { html: code } }).run();
            setHtml(false);
          }}
          onClose={() => setHtml(false)}
        />
      ) : null}
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
  code: svg(<path d="m8 8-4 4 4 4M16 8l4 4-4 4M13.5 5l-3 14" />),
  table: svg(
    <>
      <rect x={3.5} y={4.5} width={17} height={15} rx={1} />
      <path d="M3.5 9.5h17M3.5 14.5h17M9.5 9.5v10M15 9.5v10" />
    </>,
  ),
};

/** Formatting buttons for a section. */
function Tools({ editor, onImage, onHtml }: { editor: Editor; onImage: () => void; onHtml: () => void }) {
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
      {b(ICON.image, false, onImage, "Image")}
      {b(ICON.code, false, onHtml, "HTML block")}
    </span>
  );
}

/** Paste HTML: an embed, a chart, an interactive block. It runs in a sandbox here and goes out as written. */
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
