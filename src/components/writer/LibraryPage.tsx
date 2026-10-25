"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Editor } from "@tiptap/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { docToMarkdown } from "@/lib/articles";
import { docToText } from "@/lib/articleGrid";
import { wordFile } from "@/lib/briefDoc";
import { getDoc, getGuideline, type Doc, type DocMeta, type Site } from "@/lib/db";
import type { RunAuth } from "@/lib/runner";
import { useStash } from "@/lib/stash";
import { currentSupabase } from "@/lib/supa";
import type { View } from "@/lib/view";
import { getBrief, getDraft, listTopics, type FullBrief, type FullDraft, type Topic } from "@/lib/writerLibrary";
import type { BrandGuideline } from "@/lib/writerTypes";
import { PlainEditor, type SaveState } from "../content/PlainEditor";
import { Pop } from "../Pickers";
import { PublishPanel } from "../research/PublishPanel";
import { brandTables } from "../research/Writer";
import { exportClean } from "../research/writerNodes";
import { ToolIntro } from "../ToolIntro";
import { ArrowLeft } from "../Icons";
import { SkelBlock, SkelRows } from "../states";
import { Seg } from "../ui";
import { BriefEditor } from "./BriefEditor";
import { ContentGrid } from "./ContentGrid";
import { Back, DraftProgress, goToPath, libraryKey, RegenerateDialog, StateTag, useBrandSite, usePoll, type LibraryOpen } from "./parts";

// The Library: every keyword imported from the Editorial Calendar, as a grid of articles (ContentGrid).
// Write outline starts there. A finished outline opens editable; an article opens in the plain editor with its
// interactive modules running in sandboxed frames, its HTML, Markdown and Text views, Export and Publish.

const making = (t: Topic) => t.brief?.status === "generating" || t.draft?.status === "generating";

export function LibraryPage({ view, auth, canEdit }: { view: View; auth: RunAuth; canEdit: boolean }) {
  const [sb] = useState(() => currentSupabase());
  const brand = view.brand;
  const { site, error: siteError } = useBrandSite(sb, brand, canEdit);
  const [rows, setRows] = useStash<Topic[] | null>(`library:${brand.id}:topics`, null);
  const [open, setOpen] = useStash<LibraryOpen>(libraryKey(brand.id), null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!site) return;
    try {
      setRows(await listTopics(sb, site.id));
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setRows((r) => r ?? []);
    }
  }, [sb, site, setRows]);
  useEffect(() => {
    // Loading the Library once the brand's website is known is the point of this effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);
  usePoll(Boolean(!open && rows?.some(making)), 5000, load);

  // A draft opened in a new tab comes as /library?doc=<id>&brand=<id>: open that article, then tidy the address.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const doc = params.get("doc");
    if (!doc) return;
    setOpen({ kind: "doc", id: doc });
    params.delete("doc");
    params.delete("brand");
    window.history.replaceState(null, "", window.location.pathname + (params.size ? `?${params}` : ""));
  }, [setOpen]);

  if (site === undefined || (site && rows === null))
    return (
      <div className="flex flex-col gap-5" aria-busy="true">
        <h1 className="aw-h2">Library</h1>
        <div className="aw-frame overflow-hidden">
          <table className="aw-table">
            <tbody>
              <SkelRows rows={6} cols={5} />
            </tbody>
          </table>
        </div>
      </div>
    );
  if (!site) return <p className="aw-error">{siteError || "This brand has no website yet."}</p>;

  const back = () => {
    setOpen(null);
    load();
  };
  if (open?.kind === "brief") return <BriefEditor key={open.id} sb={sb} auth={auth} id={open.id} canEdit={canEdit} onBack={back} onDraft={(id) => setOpen({ kind: "draft", id })} />;
  if (open?.kind === "draft") return <DraftView key={open.id} sb={sb} auth={auth} site={site} brandId={brand.id} id={open.id} canEdit={canEdit} onBack={back} />;
  if (open?.kind === "doc") return <DocView key={open.id} sb={sb} auth={auth} site={site} brandId={brand.id} id={open.id} canEdit={canEdit} onBack={back} />;

  const list = rows ?? [];
  return (
    <div className="flex flex-col gap-5">
      {list.length ? null : <h1 className="aw-h2">Library</h1>}
      {error ? <p className="aw-error">{error}</p> : null}
      {list.length ? (
        <ContentGrid sb={sb} auth={auth} site={site} brandId={brand.id} canEdit={canEdit} onOpen={setOpen} />
      ) : (
        <ToolIntro
          title="Library"
          lead={`Import keywords from the Editorial Calendar. For each one, Arrowsterr researches Google and the AI answers and writes the outline. Your writers fill it in, section by section, in ${brand.name}'s voice.`}
          action={
            <button type="button" className="aw-btn aw-btn--primary" onClick={() => goToPath("/editorial-calendar")}>
              Open Editorial Calendar
            </button>
          }
          features={[
            { title: "Outline", text: "Headings, meta, sources, FAQs and internal links, from the top pages and the AI answers." },
            { title: "Write", text: "Open any section beside the grid with the outline's notes for it, or the whole article in full view." },
            { title: "Publish", text: "Send the article to WordPress or your CMS, with its meta title, description and slug." },
          ]}
        />
      )}
    </div>
  );
}

/** A draft the writer job made: its progress while it runs, then the article with Regenerate. */
function DraftView({ sb, auth, site, brandId, id, canEdit, onBack }: { sb: SupabaseClient; auth: RunAuth; site: Site; brandId: string; id: string; canEdit: boolean; onBack: () => void }) {
  const [draft, setDraft] = useState<FullDraft | null | undefined>(undefined);
  const [brief, setBrief] = useState<FullBrief | null>(null);
  const [doc, setDoc] = useState<Doc | null>(null);
  const [regen, setRegen] = useState(false);
  const [error, setError] = useState("");
  const docRef = useRef<string | null>(null);
  const [docKey, setDocKey] = useState("");

  const load = useCallback(async () => {
    try {
      const d = await getDraft(sb, id);
      setDraft(d);
      if (!d) return;
      if (!brief || brief.id !== d.brief_id) setBrief(await getBrief(sb, d.brief_id));
      // The doc loads once per version the job wrote, so the editor never jumps under someone typing.
      const stampOf = `${d.doc_id}:${d.ready_at}`;
      if (d.status === "ready" && d.doc_id && docRef.current !== stampOf) {
        const x = await getDoc(sb, d.doc_id);
        docRef.current = stampOf;
        setDocKey(stampOf);
        setDoc(x);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [sb, id, brief]);
  useEffect(() => {
    // Loading the draft is the point of this effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);
  usePoll(draft?.status === "generating", 4000, load);

  if (draft === undefined) return <Opening onBack={onBack} />;
  if (!draft) return <Back onBack={onBack} title="This draft was deleted." />;
  const head = doc?.title || brief?.brief?.h1 || brief?.keyword || "Draft";
  const regenerate =
    regen && brief ? (
      <RegenerateDialog
        auth={auth}
        kind="draft"
        briefId={brief.id}
        itemId={draft.item_id}
        onClose={() => setRegen(false)}
        onStarted={() => {
          setRegen(false);
          setDoc(null);
          load();
        }}
      />
    ) : null;

  if (draft.status !== "ready" || !doc)
    return (
      <div className="flex flex-col gap-5">
        <Back onBack={onBack} title={head}>
          <StateTag status={draft.status} />
          {canEdit && draft.status === "failed" && brief ? (
            <button type="button" className="aw-btn aw-btn--primary aw-btn--sm" onClick={() => setRegen(true)}>
              Regenerate
            </button>
          ) : null}
        </Back>
        {draft.error ? <p className="aw-error">{draft.error}</p> : null}
        {error ? <p className="aw-error">{error}</p> : null}
        {draft.status === "generating" ? <DraftProgress draft={draft} brief={brief} /> : null}
        {draft.status === "ready" && !doc ? <SkelBlock lines={8} /> : null}
        {regenerate}
      </div>
    );

  return (
    <>
      <ArticleView
        key={docKey || doc.id}
        sb={sb}
        auth={auth}
        site={site}
        brandId={brandId}
        doc={doc}
        canEdit={canEdit}
        onBack={onBack}
        extra={
          canEdit && brief ? (
            <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm" onClick={() => setRegen(true)}>
              Regenerate
            </button>
          ) : null
        }
      />
      {regenerate}
    </>
  );
}

/** An article's doc by its id: the one a writer started from the outline in the grid (Full view). */
function DocView({ sb, auth, site, brandId, id, canEdit, onBack }: { sb: SupabaseClient; auth: RunAuth; site: Site; brandId: string; id: string; canEdit: boolean; onBack: () => void }) {
  const [doc, setDoc] = useState<Doc | null | undefined>(undefined);
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    getDoc(sb, id)
      .then((d) => live && setDoc(d))
      .catch((e) => {
        if (!live) return;
        setError(e instanceof Error ? e.message : String(e));
        setDoc(null);
      });
    return () => {
      live = false;
    };
  }, [sb, id]);
  if (doc === undefined) return <Opening onBack={onBack} />;
  if (!doc) return <Back onBack={onBack} title={error || "This article was deleted."} />;
  return <ArticleView sb={sb} auth={auth} site={site} brandId={brandId} doc={doc} canEdit={canEdit} onBack={onBack} />;
}

/** The whole article: the plain editor with its modules, HTML, Markdown and Text views, Export and Publish. */
function ArticleView({ sb, auth, site, brandId, doc, canEdit, onBack, extra }: { sb: SupabaseClient; auth: RunAuth; site: Site; brandId: string; doc: Doc; canEdit: boolean; onBack: () => void; extra?: React.ReactNode }) {
  const [guideline, setGuideline] = useState<BrandGuideline | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [state, setState] = useState<{ s: SaveState; note?: string }>({ s: "saved" });
  const [title, setTitle] = useState(doc.title);
  const [words, setWords] = useState(doc.words);
  const [publishing, setPublishing] = useState(false);
  const [exportAt, setExportAt] = useState<DOMRect | null>(null);
  const [view, setView] = useState<"edit" | "html" | "md" | "text">("edit");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    getGuideline(sb, site.id)
      .then((g) => live && setGuideline(g))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [sb, site.id]);

  const saved = useCallback((m: DocMeta) => {
    setTitle(m.title);
    setWords(m.words);
  }, []);
  const onState = useCallback((s: SaveState, note?: string) => setState({ s, note }), []);

  const html = () => brandTables(exportClean(editor?.getHTML() ?? ""), guideline);

  const name = (title || "article").replace(/\W+/g, "-").replace(/^-|-$/g, "").toLowerCase() || "article";
  function download(file: string, body: string, type: string) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([body], { type }));
    a.download = file;
    a.click();
    URL.revokeObjectURL(a.href);
    setExportAt(null);
  }
  const exports = [
    { id: "html", label: "HTML", run: () => download(`${name}.html`, `<!doctype html><meta charset="utf-8"><title>${title}</title>\n${html()}`, "text/html") },
    { id: "md", label: "Markdown", run: () => editor && download(`${name}.md`, docToMarkdown(editor.getJSON()), "text/markdown") },
    { id: "doc", label: "Google Doc (.doc)", run: () => download(`${name}.doc`, wordFile(title, html()), "application/msword") },
  ];

  return (
    <div className="flex flex-col gap-4">
      <Back onBack={onBack} title={title || "Article"}>
        <span className="aw-num px-1 text-[12px] whitespace-nowrap text-muted">{words.toLocaleString("en-US")} words</span>
        <span className="flex items-center gap-1.5 px-1 text-[12px] whitespace-nowrap text-muted">
          <i className={`inline-block h-1.5 w-1.5 ${state.s === "error" ? "bg-neg" : state.s === "saving" ? "bg-warn" : "bg-pos"}`} aria-hidden="true" />
          {state.note || (state.s === "error" ? "Not saved" : state.s === "saving" ? "Saving" : "Saved")}
        </span>
        {extra}
        <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm" aria-haspopup="menu" disabled={!editor} onClick={(e) => setExportAt(e.currentTarget.getBoundingClientRect())}>
          Export
        </button>
        {canEdit ? (
          <button type="button" className="aw-btn aw-btn--primary aw-btn--sm" disabled={!editor} onClick={() => setPublishing(true)}>
            Publish
          </button>
        ) : null}
      </Back>
      {error ? <p className="aw-error">{error}</p> : null}

      <Seg
        label="View"
        value={view}
        onChange={(v) => {
          setView(v);
          setCopied(false);
        }}
        options={[
          { id: "edit", label: "Edit" },
          { id: "html", label: "HTML" },
          { id: "md", label: "Markdown" },
          { id: "text", label: "Text" },
        ]}
      />
      <div className={view === "edit" ? "" : "hidden"}>
        <PlainEditor sb={sb} workspaceId={auth.workspaceId} doc={doc} canEdit={canEdit} onSaved={saved} onEditor={setEditor} onState={onState} />
      </div>
      {view !== "edit" && editor ? (
        <Source
          text={view === "html" ? html() : view === "md" ? docToMarkdown(editor.getJSON()) : docToText(editor.getJSON())}
          copied={copied}
          onCopy={(t) => navigator.clipboard.writeText(t).then(() => setCopied(true), () => setError("Copy failed. Select the text and copy it."))}
        />
      ) : null}

      {exportAt ? (
        <Pop anchor={exportAt} onClose={() => setExportAt(null)} width={200} label="Export">
          <div className="aw-pop__list" role="menu">
            {exports.map((x) => (
              <button key={x.id} type="button" role="menuitem" className="aw-pop__opt" onClick={x.run}>
                {x.label}
              </button>
            ))}
          </div>
        </Pop>
      ) : null}
      {publishing ? <PublishPanel sb={sb} auth={auth} docId={doc.id} brandId={brandId} title={title} html={html} onClose={() => setPublishing(false)} /> : null}
    </div>
  );
}

/** An editor while it opens: the head at once, bars where the article goes. */
function Opening({ onBack }: { onBack: () => void }) {
  return (
    <div className="flex flex-col gap-5" aria-busy="true">
      <div className="flex items-center gap-3">
        <button type="button" className="aw-text-link inline-flex shrink-0 items-center gap-1 text-[13px]" onClick={onBack}>
          <ArrowLeft size={14} />
          Library
        </button>
      </div>
      <SkelBlock lines={8} />
    </div>
  );
}

/** The article as code or plain text, to read and copy. */
function Source({ text, copied, onCopy }: { text: string; copied: boolean; onCopy: (t: string) => void }) {
  return (
    <section className="aw-frame flex min-w-0 flex-col">
      <div className="flex items-center justify-end border-b border-rule px-3 py-2">
        <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm" onClick={() => onCopy(text)}>
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="max-h-[75vh] overflow-auto px-6 py-5 font-mono text-[12px] leading-relaxed whitespace-pre-wrap text-ink">{text}</pre>
    </section>
  );
}
