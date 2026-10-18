"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import Link from "@tiptap/extension-link";
import Table from "@tiptap/extension-table";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import TableRow from "@tiptap/extension-table-row";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Brief } from "@/lib/briefTypes";
import { briefDocHtml, wordFile } from "@/lib/briefDoc";
import { getBrief, getGuideline, saveBrief, type CalendarItem, type Site } from "@/lib/db";
import type { RunAuth } from "@/lib/runner";
import type { BrandGuideline } from "@/lib/writerTypes";
import { Confirm, Modal } from "../reports/Dialog";
import { AiIcon, Thinking } from "../ui";
import { post, StopButton } from "./shared";

type Save = "saved" | "saving" | "error";

/**
 * A content brief in its own full-screen editor: the seven sections on the left, the document in the middle.
 * Every edit saves on its own. Generate Draft saves the brief first, so the draft follows what is on screen.
 */
export function BriefDocEditor({
  sb,
  auth,
  site,
  brandName,
  item,
  canEdit,
  hasDraft,
  drafting,
  onBack,
  onGenerateDraft,
  onOpenDraft,
  onItem,
}: {
  sb: SupabaseClient;
  auth: RunAuth;
  site: Site;
  brandName: string;
  item: CalendarItem;
  canEdit: boolean;
  hasDraft: boolean;
  /** A draft is being generated from this brief. */
  drafting: boolean;
  onBack: () => void;
  /** Called once the brief is saved. */
  onGenerateDraft: () => void;
  onOpenDraft: () => void;
  onItem: (p: Partial<CalendarItem>) => void;
}) {
  const [brief, setBrief] = useState<Awaited<ReturnType<typeof getBrief>> | null>(null);
  const [guideline, setGuideline] = useState<BrandGuideline | null | undefined>(undefined);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const b = await getBrief(sb, item.id);
      setBrief(b);
      if (b.brief_status !== item.brief_status) onItem({ brief_status: b.brief_status });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [sb, item.id, item.brief_status, onItem]);
  useEffect(() => {
    // Loading the brief and the brand guideline when the editor opens is the point of this effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    getGuideline(sb, item.site_id).then(setGuideline).catch(() => setGuideline(null));
    // Only when another brief opens.
  }, [item.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const running = brief?.brief_status === "running";
  useEffect(() => {
    if (!running) return;
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [running, load]);

  // The page behind does not scroll while the editor is open.
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  async function generate() {
    setError("");
    try {
      await post(auth, "/api/research/brief", { itemId: item.id });
      setBrief((b) => ({ ...(b ?? { brief: null, brief_error: null, brief_at: null }), brief_status: "running", brief_started_at: new Date().toISOString() }));
      onItem({ brief_status: "running" });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }
  async function stop() {
    try {
      await post(auth, "/api/research/brief", { itemId: item.id, action: "stop" });
      setBrief((b) => (b ? { ...b, brief_status: "failed", brief_error: "Stopped." } : b));
      onItem({ brief_status: "failed" });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  const shell = (body: React.ReactNode, actions?: React.ReactNode) => (
    <div className="aw-fullscreen fixed inset-0 z-[70] flex flex-col bg-surface" role="dialog" aria-modal="true" aria-label={`Content brief: ${item.keyword}`}>
      <header className="flex flex-wrap items-center gap-3 border-b border-rule bg-white px-5 py-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <nav className="flex items-center gap-1.5 text-[12px] text-muted" aria-label="Breadcrumb">
            <button type="button" className="aw-text-link" onClick={onBack}>
              Library
            </button>
            <span aria-hidden="true">/</span>
            <span className="truncate">{item.keyword}</span>
            <span aria-hidden="true">/</span>
            <span>Content Brief</span>
          </nav>
          <span className="flex items-center gap-2">
            <h1 className="aw-h3 truncate">{brief?.brief?.brief.h1 || item.keyword}</h1>
            <span className="aw-status aw-status--pending">Content Brief</span>
          </span>
        </div>
        <span className="ml-auto flex flex-wrap items-center gap-2">
          {actions}
          <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm" onClick={onBack}>
            Back to Library
          </button>
        </span>
      </header>
      {error ? <p className="aw-error mx-5 mt-3">{error}</p> : null}
      {body}
    </div>
  );

  if (!brief || guideline === undefined) return shell(<div className="p-8"><Thinking text="Opening the brief..." /></div>);
  if (running)
    return shell(
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center" role="status" aria-live="polite">
        <Thinking text={`Reading Google's top 10 and writing the brief for "${item.keyword}"...`} />
        {canEdit ? <StopButton onStop={stop} /> : null}
      </div>,
    );
  if (!brief.brief)
    return shell(
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8">
        {brief.brief_status === "failed" ? <p className="aw-error">{brief.brief_error}</p> : null}
        {canEdit ? (
          <button type="button" className="aw-btn aw-btn--primary" onClick={generate}>
            <AiIcon />
            Generate Brief
          </button>
        ) : null}
      </div>,
    );

  return (
    <BriefDoc
      key={brief.brief_at ?? "brief"}
      sb={sb}
      item={item}
      brief={brief.brief}
      html={brief.brief.doc ?? briefDocHtml(item, brief.brief, { name: brandName, country: site.profile.country }, guideline)}
      canEdit={canEdit}
      shell={shell}
      hasDraft={hasDraft}
      drafting={drafting}
      onSaved={(b) => setBrief({ ...brief, brief: b })}
      onRegenerate={generate}
      onGenerateDraft={onGenerateDraft}
      onOpenDraft={onOpenDraft}
    />
  );
}

function BriefDoc({
  sb,
  item,
  brief,
  html,
  canEdit,
  shell,
  hasDraft,
  drafting,
  onSaved,
  onRegenerate,
  onGenerateDraft,
  onOpenDraft,
}: {
  sb: SupabaseClient;
  item: CalendarItem;
  brief: Brief;
  html: string;
  canEdit: boolean;
  shell: (body: React.ReactNode, actions?: React.ReactNode) => React.ReactNode;
  hasDraft: boolean;
  drafting: boolean;
  onSaved: (b: Brief) => void;
  onRegenerate: () => void;
  onGenerateDraft: () => void;
  onOpenDraft: () => void;
}) {
  const [state, setState] = useState<Save>("saved");
  const [savedAt, setSavedAt] = useState<string | null>(brief.docAt ?? brief.at ?? null);
  const [outline, setOutline] = useState<{ pos: number; text: string; level: number }[]>([]);
  const [asking, setAsking] = useState<"" | "regenerate">("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(brief);
  const pending = useRef<string | null>(null);
  const scroller = useRef<HTMLDivElement | null>(null);
  // The latest callback, so saving keeps one identity and the debounce holds between renders.
  const savedCb = useRef(onSaved);
  useEffect(() => {
    savedCb.current = onSaved;
  });

  /** Save what is in the editor now. Waits for nothing else. */
  const flush = useCallback(async (): Promise<boolean> => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const doc = pending.current;
    if (doc === null) return true;
    pending.current = null;
    setState("saving");
    const next: Brief = { ...latest.current, doc, docAt: new Date().toISOString() };
    try {
      await saveBrief(sb, item.id, next);
      latest.current = next;
      savedCb.current(next);
      setSavedAt(next.docAt ?? null);
      setState("saved");
      return true;
    } catch {
      // Keep the edit so the next save tries again.
      if (pending.current === null) pending.current = doc;
      setState("error");
      return false;
    }
  }, [sb, item.id]);

  const readOutline = (ed: Editor) => {
    const out: { pos: number; text: string; level: number }[] = [];
    ed.state.doc.forEach((node, pos) => {
      if (node.type.name === "heading" && (node.attrs.level === 2 || node.attrs.level === 3) && node.textContent.trim()) out.push({ pos, text: node.textContent.trim(), level: node.attrs.level as number });
    });
    setOutline((prev) => (prev.length === out.length && prev.every((p, i) => p.text === out[i].text && p.pos === out[i].pos) ? prev : out));
  };

  const editor = useEditor({
    immediatelyRender: false,
    editable: canEdit,
    extensions: [StarterKit.configure({ heading: { levels: [1, 2, 3, 4] } }), Link.configure({ openOnClick: false }), Table.configure({ resizable: false }), TableRow, TableHeader, TableCell],
    content: html,
    onCreate: ({ editor: ed }) => readOutline(ed),
    onUpdate: ({ editor: ed }) => {
      readOutline(ed);
      if (!canEdit) return;
      pending.current = ed.getHTML();
      setState("saving");
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, 1200);
    },
  });

  // Save on the way out, and warn before closing the tab with an edit not yet saved.
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (pending.current !== null) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => {
      window.removeEventListener("beforeunload", warn);
      if (pending.current !== null) void flush();
    };
  }, [flush]);

  const title = `Content Brief - ${brief.brief.h1 || item.keyword}`;
  const when = savedAt ? new Date(savedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : "";

  const actions = (
    <>
      <span className="flex items-center gap-1.5 px-1 text-[12px] whitespace-nowrap text-muted" aria-live="polite">
        <i className={`inline-block h-1.5 w-1.5 ${state === "error" ? "bg-neg" : state === "saving" ? "bg-warn" : "bg-pos"}`} aria-hidden="true" />
        {state === "error" ? "Not saved" : state === "saving" ? "Saving..." : `Autosaved${when ? ` ${when}` : ""}`}
      </span>
      <button
        type="button"
        className="aw-iconbtn"
        title="Download .doc"
        aria-label="Download .doc"
        onClick={() => {
          const a = document.createElement("a");
          a.href = URL.createObjectURL(new Blob([wordFile(title, editor?.getHTML() ?? html)], { type: "application/msword" }));
          a.download = `${title.replace(/[^\w-]+/g, "-")}.doc`;
          a.click();
          URL.revokeObjectURL(a.href);
        }}
      >
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <path d="M12 4v11m-4.5-4.5L12 15l4.5-4.5M5 20h14" />
        </svg>
      </button>
      {canEdit ? (
        <button type="button" className="aw-iconbtn" title="Regenerate brief" aria-label="Regenerate brief" onClick={() => setAsking("regenerate")}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
            <path d="M20 12a8 8 0 1 1-2.3-5.7M20 4v4h-4" />
          </svg>
        </button>
      ) : null}
      {hasDraft ? (
        <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm" onClick={async () => (await flush()) && onOpenDraft()}>
          Open draft
        </button>
      ) : null}
      {canEdit ? (
        <button type="button" className="aw-btn aw-btn--primary aw-btn--sm" disabled={drafting || state === "error"} onClick={async () => (await flush()) && onGenerateDraft()}>
          <AiIcon />
          {drafting ? "Writing the draft..." : "Generate Draft"}
        </button>
      ) : null}
    </>
  );

  return shell(
    <>
      <div className="flex min-h-0 flex-1">
        <nav className="hidden w-60 shrink-0 flex-col gap-0.5 overflow-y-auto border-r border-rule bg-white p-3 md:flex" aria-label="Document outline">
          <span className="aw-label mb-1.5 px-2">Document outline</span>
          {outline.map((o) => (
            <button
              key={`${o.pos}:${o.text}`}
              type="button"
              className={`truncate rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-brand-pale ${o.level === 3 ? "pl-5 text-muted" : "text-ink"}`}
              onClick={() => (editor?.view.nodeDOM(o.pos) as HTMLElement | null)?.scrollIntoView({ behavior: "smooth", block: "start" })}
            >
              {o.text}
            </button>
          ))}
        </nav>
        <div ref={scroller} className="min-w-0 flex-1 overflow-y-auto">
          <section className="mx-auto my-5 max-w-4xl border border-rule bg-white">
            {editor && canEdit ? <BriefToolbar editor={editor} /> : null}
            <div className="aw-editor aw-doc px-6 py-8 sm:px-12">
              <EditorContent editor={editor} />
            </div>
          </section>
        </div>
      </div>
      {asking === "regenerate" ? (
        <Confirm
          title="Regenerate the brief?"
          text="A new brief replaces this one, with your edits. Drafts already written stay as they are."
          action="Regenerate"
          onClose={() => setAsking("")}
          onConfirm={() => {
            setAsking("");
            pending.current = null;
            onRegenerate();
          }}
        />
      ) : null}
    </>,
    actions,
  );
}

function BriefToolbar({ editor }: { editor: Editor }) {
  const [linking, setLinking] = useState<string | null>(null);
  const b = (label: string, on: boolean, run: () => void, title: string) => (
    <button type="button" title={title} aria-label={title} aria-pressed={on} onMouseDown={(e) => e.preventDefault()} onClick={run} className={`aw-tool ${on ? "is-on" : ""}`}>
      {label}
    </button>
  );
  const c = () => editor.chain().focus();
  return (
    <div className="sticky top-0 z-10 flex flex-wrap items-center gap-1 border-b border-rule bg-white px-3 py-2">
      {b("H2", editor.isActive("heading", { level: 2 }), () => c().toggleHeading({ level: 2 }).run(), "Section heading")}
      {b("H3", editor.isActive("heading", { level: 3 }), () => c().toggleHeading({ level: 3 }).run(), "Subheading")}
      {b("¶", editor.isActive("paragraph"), () => c().setParagraph().run(), "Paragraph")}
      <span className="mx-1 h-5 w-px bg-rule" />
      {b("B", editor.isActive("bold"), () => c().toggleBold().run(), "Bold")}
      {b("I", editor.isActive("italic"), () => c().toggleItalic().run(), "Italic")}
      {b("•", editor.isActive("bulletList"), () => c().toggleBulletList().run(), "Bullet list")}
      {b("1.", editor.isActive("orderedList"), () => c().toggleOrderedList().run(), "Numbered list")}
      {b("↗", editor.isActive("link"), () => (editor.isActive("link") ? c().unsetLink().run() : setLinking("")), "Link")}
      <span className="mx-1 h-5 w-px bg-rule" />
      {b("⊞", false, () => c().insertTable({ rows: 3, cols: 2, withHeaderRow: true }).run(), "Insert table")}
      {editor.isActive("table") ? (
        <>
          {b("+Row", false, () => c().addRowAfter().run(), "Add row")}
          {b("+Col", false, () => c().addColumnAfter().run(), "Add column")}
          {b("−Row", false, () => c().deleteRow().run(), "Delete row")}
        </>
      ) : null}
      <span className="mx-1 h-5 w-px bg-rule" />
      {b("↶", false, () => c().undo().run(), "Undo")}
      {b("↷", false, () => c().redo().run(), "Redo")}
      {linking !== null ? (
        <Modal title="Link" onClose={() => setLinking(null)} width="max-w-md">
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (linking.trim()) c().setLink({ href: linking.trim() }).run();
              setLinking(null);
            }}
          >
            <input autoFocus value={linking} onChange={(e) => setLinking(e.target.value)} placeholder="https://" aria-label="Link to" className="aw-input h-9 flex-1 rounded-md border border-rule px-2.5 text-[13px]" />
            <button type="submit" className="aw-btn aw-btn--primary aw-btn--sm">
              Add link
            </button>
          </form>
        </Modal>
      ) : null}
    </div>
  );
}
