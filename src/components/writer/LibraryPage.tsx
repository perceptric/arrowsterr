"use client";

import { track } from "@/lib/analytics";
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
import { briefIdForItem, getBrief, getDraftForBrief, listTopics, type FullBrief, type FullDraft, type Topic } from "@/lib/writerLibrary";
import type { BrandGuideline } from "@/lib/writerTypes";
import { PlainEditor, type SaveState } from "../content/PlainEditor";
import { ConnectWizard } from "../ConnectWizard";
import { Pop } from "../Pickers";
import { PublishPanel } from "../research/PublishPanel";
import { useZippieRecord } from "../zippie/ZippieContext";
import { ChatsAboutPiece } from "../zippie/WritingChats";
import { ArticleResults } from "../analytics/ArticleResults";
import { post } from "../research/shared";
import { brandTables } from "../research/Writer";
import { exportClean } from "../research/writerNodes";
import { EmptyScreen } from "../Drawing";
import { Seg, SidePanel, Thinking } from "../ui";
import { BLOCK_INFO, BLOCK_KINDS } from "@/lib/blockTemplates";
import { NEW_BLOCK_EVENT } from "../content/PlainEditor";
import { ArticleReview, type ReviewInput } from "./ArticleReview";
import { CommandMenu, modKey, type Command } from "./CommandMenu";
import { quoteFound, showComments } from "../content/commentHighlight";
import { AUTO_EVERY_MS, listComments, listVersions, saveVersion, whoAmI, type DocComment, type Me } from "@/lib/docCollab";
import { DocComments } from "./DocComments";
import { DocHistory } from "./DocHistory";
import { ContentGrid } from "./ContentGrid";
import { OutlineView } from "./OutlineView";
import { BriefProgress, DraftProgress, libraryKey, RegenerateDialog, StateTag, useBrandSite, usePoll, useWide, type LibraryOpen } from "./parts";

// Drafts (docs/drafts-plan.md): every keyword from the Editorial Calendar, as a grid of articles (ContentGrid).
// Write drafts starts there: the research and outline run in the background, then the draft. Each piece opens to one
// page that follows it from the outline to the article (PieceView). An article opens in the plain editor with its
// interactive modules running in sandboxed frames, its HTML, Markdown and Text views, Export and Publish.

const making = (t: Topic) => t.brief?.status === "generating" || t.draft?.status === "generating";

export function LibraryPage({ view, auth, canEdit, onCalendar }: { view: View; auth: RunAuth; canEdit: boolean; onCalendar?: () => void }) {
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

  // Links open one thing, then the address is tidied: /drafts?piece=<outline id> (?outline= in older links),
  // ?item=<Calendar item id> from Zippie's cards, or ?doc=<id> for an article started in the grid.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const doc = params.get("doc");
    const piece = params.get("piece") ?? params.get("outline");
    const item = params.get("item");
    if (!doc && !piece && !item) return;
    if (doc) setOpen({ kind: "doc", id: doc });
    else if (piece) setOpen({ kind: "piece", id: piece });
    else
      briefIdForItem(sb, item!)
        .then((id) => id && setOpen({ kind: "piece", id }))
        .catch(() => {});
    for (const k of ["doc", "piece", "outline", "item", "brand"]) params.delete(k);
    window.history.replaceState(null, "", window.location.pathname + (params.size ? `?${params}` : ""));
  }, [sb, setOpen]);

  if (site === undefined || (site && rows === null)) return <Thinking text="Opening Drafts..." />;
  if (!site)
    return siteError ? (
      <p className="aw-error">{siteError}</p>
    ) : (
      <EmptyScreen drawing="globe" title="Add this brand's website">
        Drafts need it to write in the brand&apos;s voice.
      </EmptyScreen>
    );

  const back = () => {
    setOpen(null);
    load();
  };
  // "outline" is how a piece was kept open before outline and draft became one page.
  const kind = open?.kind as string | undefined;
  if (open && (kind === "piece" || kind === "outline")) return <PieceView key={open.id} sb={sb} auth={auth} site={site} brandId={brand.id} id={open.id} canEdit={canEdit} onBack={back} />;
  if (open?.kind === "doc") return <DocView key={open.id} sb={sb} auth={auth} site={site} brandId={brand.id} id={open.id} canEdit={canEdit} onBack={back} />;

  const list = rows ?? [];
  return (
    <div className="flex flex-col gap-5">
      {list.length ? null : <h1 className="aw-h2">Drafts</h1>}
      {error ? <p className="aw-error">{error}</p> : null}
      {list.length ? (
        <ContentGrid sb={sb} auth={auth} site={site} brandId={brand.id} canEdit={canEdit} onOpen={setOpen} />
      ) : (
        <EmptyScreen
          drawing="drafts"
          title="Write drafts that get cited"
          action={
            onCalendar ? (
              <button type="button" className="aw-btn aw-btn--primary" onClick={onCalendar}>
                Open the Editorial Calendar
              </button>
            ) : undefined
          }
        >
          Add keywords from the Editorial Calendar to write them here.
        </EmptyScreen>
      )}
    </div>
  );
}

function Back({ onBack, title, children }: { onBack: () => void; title: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <span className="flex min-w-0 items-center gap-3">
        <button type="button" className="aw-text-link shrink-0 text-[13px]" onClick={onBack}>
          ← Drafts
        </button>
        <span className="truncate text-[15px] font-medium text-ink">{title}</span>
      </span>
      {children ? <span className="flex flex-wrap items-center gap-2">{children}</span> : null}
    </div>
  );
}

/**
 * One piece on one page, from start to finish: the research and outline while they're written, the outline to review,
 * the sections filling in while the draft is written, then the article to edit and publish. It moves on by itself as
 * the writer works, so every link to a piece (the grid, the Calendar, Zippie) lands here.
 */
function PieceView({ sb, auth, site, brandId, id, canEdit, onBack }: { sb: SupabaseClient; auth: RunAuth; site: Site; brandId: string; id: string; canEdit: boolean; onBack: () => void }) {
  const [brief, setBrief] = useState<FullBrief | null | undefined>(undefined);
  const [draft, setDraft] = useState<FullDraft | null>(null);
  const [doc, setDoc] = useState<Doc | null>(null);
  const [regen, setRegen] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [error, setError] = useState("");
  const docRef = useRef<string | null>(null);
  const [docKey, setDocKey] = useState("");

  const load = useCallback(async () => {
    try {
      const [b, d] = await Promise.all([getBrief(sb, id), getDraftForBrief(sb, id)]);
      setBrief(b);
      setDraft(d);
      // The doc loads once per version the job wrote, so the editor never jumps under someone typing.
      const stampOf = d ? `${d.doc_id}:${d.ready_at}` : "";
      if (d?.status === "ready" && d.doc_id && docRef.current !== stampOf) {
        const x = await getDoc(sb, d.doc_id);
        docRef.current = stampOf;
        setDocKey(stampOf);
        setDoc(x);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBrief((b) => b ?? null);
    }
  }, [sb, id]);
  useEffect(() => {
    // Loading the piece is the point of this effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);
  const working = brief?.status === "generating" || draft?.status === "generating";
  usePoll(working, 4000, load);
  // An outline waiting for review can have its draft started elsewhere (Zippie, the Calendar): look now and then.
  usePoll(!working && !draft && (brief?.status === "ready" || brief?.status === "approved"), 15000, load);

  if (brief === undefined) return <Thinking text="Opening..." />;
  if (!brief) return <Back onBack={onBack} title="This piece was deleted." />;
  const title = doc?.title || brief.brief?.h1 || brief.keyword;
  const regenerate =
    regen ? (
      <RegenerateDialog
        auth={auth}
        briefId={brief.id}
        onClose={() => setRegen(false)}
        onStarted={() => {
          setRegen(false);
          setDoc(null);
          docRef.current = null;
          load();
        }}
      />
    ) : null;

  // The article, once the draft is written.
  if (draft?.status === "ready")
    return doc ? (
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
          review={{
            keyword: brief.keyword,
            wordTarget: brief.brief?.wordTarget,
            meta: brief.brief?.metaDescription,
            links: [...(brief.brief?.internalLinks ?? []), ...(brief.brief?.cards ?? []).flatMap((c) => c.links)],
          }}
          banner={<ArticleResults itemId={brief.item_id} brandId={brandId} auth={auth} />}
          extra={
            <>
              <ChatsAboutPiece itemId={brief.item_id} />
              {canEdit ? (
                <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm" onClick={() => setRegen(true)}>
                  Regenerate
                </button>
              ) : null}
            </>
          }
        />
        {regenerate}
      </>
    ) : (
      <Thinking text="Opening the draft..." />
    );

  // The draft being written: the outline's headings fill in as their sections are done.
  if (draft?.status === "generating") return <Writing title={title} brief={brief} draft={draft} onBack={onBack} />;

  if (draft?.status === "failed")
    return (
      <Stage onBack={onBack} title={title} status="failed" note="The draft stopped before it finished.">
        {draft.error ? <p className="aw-error">{draft.error}</p> : null}
        {canEdit ? (
          <button type="button" className="aw-btn aw-btn--primary self-start" onClick={() => setRegen(true)}>
            Write the draft again
          </button>
        ) : null}
        {regenerate}
      </Stage>
    );

  // The research and the outline while they're written.
  if (brief.status === "generating")
    return (
      <Stage onBack={onBack} title={brief.keyword} status="generating" note="The outline shows here in a few minutes, with each heading built from what people search.">
        <BriefProgress step={brief.step} />
      </Stage>
    );

  if (brief.status === "failed")
    return (
      <Stage onBack={onBack} title={brief.keyword} status="failed" note="The outline stopped before it finished.">
        {brief.error ? <p className="aw-error">{brief.error}</p> : null}
        {error ? <p className="aw-error">{error}</p> : null}
        {canEdit ? (
          <button
            type="button"
            className="aw-btn aw-btn--primary self-start"
            disabled={retrying}
            onClick={async () => {
              setRetrying(true);
              setError("");
              try {
                await post(auth, "/api/agentic-writer", { action: "brief", itemId: brief.item_id });
                await load();
              } catch (e) {
                setError(e instanceof Error ? e.message : String(e));
              } finally {
                setRetrying(false);
              }
            }}
          >
            {retrying ? "Starting..." : "Write the outline again"}
          </button>
        ) : null}
      </Stage>
    );

  // The outline, ready to review and write.
  return <OutlineView key={brief.id} sb={sb} auth={auth} id={brief.id} canEdit={canEdit} domain={site.domain} onBack={onBack} onDraft={() => void load()} />;
}

/** A piece's page while the writer works on it, or after it stopped: the title, a line on where it is, then the rest. */
function Stage({ onBack, title, status, note, children }: { onBack: () => void; title: string; status: string; note: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-8">
      <Back onBack={onBack} title="">
        <StateTag status={status} />
      </Back>
      <header className="flex flex-col gap-3">
        <h1 className="text-[28px] leading-tight font-semibold tracking-tight text-ink [overflow-wrap:anywhere]">{title}</h1>
        <p className="text-[16px] leading-relaxed text-body">{note}</p>
      </header>
      {children}
    </div>
  );
}

/** The draft being written: the intro and each heading, done, being written or waiting, then the steps after them. */
function Writing({ title, brief, draft, onBack }: { title: string; brief: FullBrief; draft: FullDraft; onBack: () => void }) {
  const heads = ["Intro", ...(brief.brief?.outline ?? []).map((o) => o.h2)];
  const sections = draft.sections ?? [];
  const next = draft.step === "sections" ? heads.findIndex((_, i) => !sections[i]) : -1;
  return (
    <Stage onBack={onBack} title={title} status="generating" note="Zippie is writing the draft. The sections fill in here as they're done, then it checks the facts and builds the blocks.">
      <ol className="flex flex-col overflow-hidden rounded-aw-lg border border-rule bg-white" aria-live="polite">
        {heads.map((h, i) => {
          const done = Boolean(sections[i]) || (draft.step !== "sections" && i < heads.length);
          const now = i === next;
          return (
            <li key={`${i}:${h}`} className="flex items-center gap-4 px-6 py-4 not-first:border-t not-first:border-rule-faint">
              <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[12px] ${done ? "bg-pos-bg text-pos" : now ? "bg-brand-bg text-brand" : "bg-surface-2 text-muted"}`} aria-hidden="true">
                {done ? "✓" : now ? "●" : ""}
              </span>
              <span className={`flex-1 text-[16px] leading-snug [overflow-wrap:anywhere] ${i === 0 ? "text-muted" : done || now ? "font-medium text-ink" : "text-muted"}`}>{h}</span>
              <span className="sr-only">{done ? "written" : now ? "being written" : "waiting"}</span>
              {now ? <span className="text-[13px] text-brand">Writing…</span> : null}
            </li>
          );
        })}
      </ol>
      <DraftProgress draft={draft} brief={brief} />
    </Stage>
  );
}

/** An article's doc by its id: the one a writer started in the grid (Full view). */
function DocView({ sb, auth, site, brandId, id, canEdit, onBack }: { sb: SupabaseClient; auth: RunAuth; site: Site; brandId: string; id: string; canEdit: boolean; onBack: () => void }) {
  // Zippie reads this draft when someone asks about it from the chat bar.
  useZippieRecord(id);
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
  if (doc === undefined) return <Thinking text="Opening the article..." />;
  if (!doc) return <Back onBack={onBack} title={error || "This article was deleted."} />;
  return <ArticleView sb={sb} auth={auth} site={site} brandId={brandId} doc={doc} canEdit={canEdit} onBack={onBack} />;
}

/** The whole article: the plain editor with its modules, HTML, Markdown and Text views, Export and Publish, and the
 * review panel beside it (checks and outline, from the live text). */
function ArticleView({
  sb,
  auth,
  site,
  brandId,
  doc,
  canEdit,
  onBack,
  extra,
  banner,
  review,
}: {
  sb: SupabaseClient;
  auth: RunAuth;
  site: Site;
  brandId: string;
  doc: Doc;
  canEdit: boolean;
  onBack: () => void;
  extra?: React.ReactNode;
  /** Shown under the toolbar: the article's results since it went live (Analytics). */
  banner?: React.ReactNode;
  /** What the brief knows, for the checks: the keyword, the word target and the meta description. */
  review?: Omit<ReviewInput, "domain">;
}) {
  const wide = useWide();
  const [reviewOpen, setReviewOpen] = useState<boolean | null>(null);
  const showReview = reviewOpen ?? wide;
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
  const [sync, setSync] = useState<{ s: "idle" | "syncing" | "done"; url?: string | null }>({ s: "idle" });
  const [connecting, setConnecting] = useState(false);

  // The panel beside the article: the review, comment threads and saved versions (docCollab.ts).
  type PanelTab = "review" | "comments" | "history";
  const [panelTab, setPanelTab] = useState<PanelTab>("review");
  const [me, setMe] = useState<Me | null>(null);
  const [comments, setComments] = useState<DocComment[] | null>(null);
  const [commentsError, setCommentsError] = useState("");
  const [draftQuote, setDraftQuote] = useState<string | null>(null);
  const [activeComment, setActiveComment] = useState<string | null>(null);
  const [versionStamp, setVersionStamp] = useState(0);
  // When the newest version was saved: null until known, -1 when versions can't be saved yet.
  const lastVersion = useRef<number | null>(null);
  const visitSaved = useRef(false);
  useEffect(() => {
    let live = true;
    whoAmI(sb)
      .then((m) => live && setMe(m))
      .catch(() => {});
    listComments(sb, doc.id)
      .then((r) => live && setComments(r))
      .catch((e) => live && setCommentsError(e instanceof Error ? e.message : String(e)));
    listVersions(sb, doc.id, 1)
      .then((v) => {
        lastVersion.current = v[0] ? new Date(v[0].created_at).getTime() : 0;
      })
      .catch(() => {
        lastVersion.current = -1;
      });
    return () => {
      live = false;
    };
  }, [sb, doc.id]);
  const openCount = (comments ?? []).filter((c) => !c.parent_id && !c.resolved_at).length;
  // The open threads' quotes show as highlights in the article.
  useEffect(() => {
    showComments(
      editor,
      (comments ?? []).filter((c) => !c.parent_id && !c.resolved_at && c.quote).map((c) => ({ id: c.id, quote: c.quote })),
      activeComment,
    );
  }, [editor, comments, activeComment]);
  const openPanel = (t: PanelTab) => {
    setPanelTab(t);
    setReviewOpen(true);
  };
  const startComment = useCallback((quote: string) => {
    if (!quote) return;
    setDraftQuote(quote);
    setPanelTab("comments");
    setReviewOpen(true);
  }, []);
  const pickComment = (id: string) => {
    setActiveComment(id);
    editor?.view.dom.querySelector(`[data-comment="${id}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  };
  const selectionQuote = () => {
    if (!editor) return "";
    const { from, to } = editor.state.selection;
    return editor.state.doc.textBetween(from, to, " ", " ").replace(/\s+/g, " ").trim().slice(0, 1000);
  };
  // A click on a highlight opens its thread; ⌘⌥M (Ctrl Alt M) comments on the selected text.
  useEffect(() => {
    const dom = editor?.view.dom;
    if (!editor || !dom) return;
    const click = (e: MouseEvent) => {
      const el = (e.target as HTMLElement | null)?.closest?.("[data-comment]");
      if (!el || !editor.state.selection.empty) return;
      setActiveComment(el.getAttribute("data-comment"));
      setPanelTab("comments");
      setReviewOpen(true);
    };
    const key = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.altKey && e.code === "KeyM") {
        e.preventDefault();
        const { from, to } = editor.state.selection;
        startComment(editor.state.doc.textBetween(from, to, " ", " ").replace(/\s+/g, " ").trim().slice(0, 1000));
      }
    };
    dom.addEventListener("click", click);
    window.addEventListener("keydown", key);
    return () => {
      dom.removeEventListener("click", click);
      window.removeEventListener("keydown", key);
    };
  }, [editor, startComment]);
  // Versions save on their own: the text as it opened, before the first edit of a visit, then every ten minutes of edits.
  useEffect(() => {
    const last = lastVersion.current;
    if (!canEdit || !editor || last === null || last < 0) return;
    const now = Date.now();
    const bump = () => setVersionStamp((n) => n + 1);
    if (state.s === "saving" && !visitSaved.current) {
      visitSaved.current = true;
      const opened = doc.content as Record<string, unknown> | null;
      if (now - last > AUTO_EVERY_MS && opened && Object.keys(opened).length) {
        lastVersion.current = now;
        saveVersion(sb, { workspaceId: auth.workspaceId, docId: doc.id, title: doc.title, content: opened, words: doc.words, label: "Before this visit's edits", me })
          .then(bump)
          .catch(() => {});
      }
    } else if (state.s === "saved" && visitSaved.current && now - last > AUTO_EVERY_MS) {
      lastVersion.current = now;
      saveVersion(sb, { workspaceId: auth.workspaceId, docId: doc.id, title, content: editor.getJSON() as Record<string, unknown>, words, label: "", me })
        .then(bump)
        .catch(() => {});
    }
    // Only when the save state changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.s]);

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

  /** Sync the saved article to the brand's site: the same post each time, kept a draft unless it's live there. */
  async function syncToCms() {
    setError("");
    setSync({ s: "syncing" });
    try {
      const out = await post<{ published: { url: string | null } }>(auth, "/api/cms", { action: "push", docId: doc.id });
      setSync({ s: "done", url: out.published.url });
      track("article_synced", { from: "full_view" });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setSync({ s: "idle" });
      if (/connect a publishing site/i.test(message)) setConnecting(true);
      else setError(message);
    }
  }
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

  const commands = (): Command[] => {
    const heads = editor ? [...editor.view.dom.querySelectorAll("h2, h3")] : [];
    return [
      ...heads.map((h) => ({ group: "Sections", label: `${h.tagName === "H3" ? "  " : ""}${h.textContent?.trim() || "Untitled heading"}`, run: () => h.scrollIntoView({ behavior: "smooth", block: "center" }) })),
      ...(canEdit ? [{ group: "Actions", label: "Publish", run: () => setPublishing(true) }] : []),
      ...(canEdit ? [{ group: "Actions", label: "Sync to CMS", run: () => void syncToCms() }] : []),
      { group: "Actions", label: showReview ? "Close the panel" : "Open the review", run: () => (showReview ? setReviewOpen(false) : openPanel("review")) },
      ...(selectionQuote() ? [{ group: "Comments", label: "Comment on the selected text", hint: `${modKey()} Alt M`, run: () => startComment(selectionQuote()) }] : []),
      { group: "Comments", label: `Open comments${openCount ? ` (${openCount} open)` : ""}`, run: () => openPanel("comments") },
      { group: "Versions", label: "Version history", run: () => openPanel("history") },
      ...exports.map((x) => ({ group: "Export", label: `Download ${x.label}`, run: x.run })),
      ...(["edit", "html", "md", "text"] as const).map((v) => ({ group: "View", label: { edit: "Edit", html: "HTML", md: "Markdown", text: "Text" }[v], run: () => setView(v) })),
      ...(canEdit
        ? BLOCK_KINDS.map((k) => ({
            group: "Insert block",
            label: BLOCK_INFO[k].label,
            run: () => {
              setView("edit");
              window.dispatchEvent(new CustomEvent(NEW_BLOCK_EVENT, { detail: { kind: k } }));
            },
          }))
        : []),
      { group: "Go to", label: "Drafts", run: onBack },
    ];
  };

  const panelTabs = (
    <span className="flex min-w-0 items-center gap-1" role="tablist" aria-label="Panel">
      {(["review", "comments", "history"] as const).map((t) => (
        <button
          key={t}
          type="button"
          role="tab"
          aria-selected={panelTab === t}
          onClick={() => setPanelTab(t)}
          className={`border-b-2 px-2 py-1.5 text-[13px] whitespace-nowrap ${panelTab === t ? "border-brand font-medium text-ink" : "border-transparent text-muted hover:text-ink"}`}
        >
          {t === "review" ? "Review" : t === "comments" ? `Comments${openCount ? ` ${openCount}` : ""}` : "History"}
        </button>
      ))}
    </span>
  );
  const panelBody =
    panelTab === "review" ? (
      <ArticleReview sb={sb} brandId={brandId} editor={editor} title={title} input={{ ...review, domain: site.domain }} />
    ) : panelTab === "comments" ? (
      <DocComments
        sb={sb}
        workspaceId={auth.workspaceId}
        docId={doc.id}
        me={me}
        canEdit={canEdit}
        rows={comments}
        error={commentsError}
        draft={draftQuote}
        active={activeComment}
        found={(q) => quoteFound(editor, q)}
        onRows={setComments}
        onDraftDone={() => setDraftQuote(null)}
        onPick={pickComment}
      />
    ) : (
      <DocHistory sb={sb} workspaceId={auth.workspaceId} docId={doc.id} editor={editor} title={title} words={words} me={me} canEdit={canEdit} stamp={versionStamp} />
    );

  return (
    <div className="flex flex-col gap-4">
      <CommandMenu
        commands={commands}
        shortcuts={[
          {
            title: "Article",
            keys: [
              ["Insert a heading, list or interactive block", ["/"]],
              ["Bold", [modKey(), "B"]],
              ["Italic", [modKey(), "I"]],
              ["Undo", [modKey(), "Z"]],
              ["Comment on the selected text", [modKey(), "Alt", "M"]],
            ],
          },
        ]}
      />
      <Back onBack={onBack} title={title || "Article"}>
        <span className="aw-num px-1 text-[12px] whitespace-nowrap text-muted">
          {words.toLocaleString("en-US")} words · {Math.max(1, Math.round(words / 230))} min read
        </span>
        <span className="flex items-center gap-1.5 px-1 text-[12px] whitespace-nowrap text-muted">
          <i className={`inline-block h-1.5 w-1.5 rounded-full ${state.s === "error" ? "bg-neg" : state.s === "saving" ? "bg-warn" : "bg-pos"}`} aria-hidden="true" />
          {state.note || (state.s === "error" ? "Not saved" : state.s === "saving" ? "Saving" : "Saved")}
        </span>
        {extra}
        <button type="button" className="aw-btn aw-btn--ghost aw-btn--sm" aria-pressed={showReview && panelTab === "review"} onClick={() => (showReview && panelTab === "review" ? setReviewOpen(false) : openPanel("review"))}>
          Review
        </button>
        <button type="button" className="aw-btn aw-btn--ghost aw-btn--sm" aria-pressed={showReview && panelTab === "comments"} onClick={() => (showReview && panelTab === "comments" ? setReviewOpen(false) : openPanel("comments"))}>
          Comments{openCount ? <span className="aw-num ml-1.5 text-muted">{openCount}</span> : null}
        </button>
        <button type="button" className="aw-btn aw-btn--ghost aw-btn--sm" aria-haspopup="menu" disabled={!editor} onClick={(e) => setExportAt(e.currentTarget.getBoundingClientRect())}>
          Export
        </button>
        {canEdit ? (
          sync.s === "done" && sync.url ? (
            <a href={sync.url} target="_blank" rel="noopener noreferrer" className="aw-btn aw-btn--secondary aw-btn--sm">
              Synced ↗
            </a>
          ) : (
            <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm" disabled={state.s === "saving" || sync.s === "syncing"} onClick={() => void syncToCms()}>
              {sync.s === "syncing" ? "Syncing..." : sync.s === "done" ? "Synced" : "Sync to CMS"}
            </button>
          )
        ) : null}
        {canEdit ? (
          <button type="button" className="aw-btn aw-btn--primary aw-btn--sm" disabled={!editor} onClick={() => setPublishing(true)}>
            Publish
          </button>
        ) : null}
      </Back>
      {error ? <p className="aw-error">{error}</p> : null}
      {banner}

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
      <div className={wide && showReview ? "grid grid-cols-[minmax(0,1fr)_320px] items-start gap-6" : ""}>
        <div className="min-w-0">
          <div className={view === "edit" ? "" : "hidden"}>
            <PlainEditor sb={sb} workspaceId={auth.workspaceId} doc={doc} canEdit={canEdit} onSaved={saved} onEditor={setEditor} onState={onState} onComment={startComment} />
          </div>
          {view !== "edit" && editor ? (
            <Source
              text={view === "html" ? html() : view === "md" ? docToMarkdown(editor.getJSON()) : docToText(editor.getJSON())}
              copied={copied}
              onCopy={(t) => navigator.clipboard.writeText(t).then(() => setCopied(true), () => setError("Copy failed. Select the text and copy it."))}
            />
          ) : null}
        </div>
        {wide && showReview ? (
          <aside className="sticky top-4 flex max-h-[calc(100vh-2rem)] min-w-0 flex-col rounded-aw-lg border border-rule bg-white" aria-label="Review, comments and versions">
            <div className="flex items-center justify-between gap-2 border-b border-rule-faint py-1 pr-2 pl-2">
              {panelTabs}
              <button type="button" className="aw-icon-btn flex h-8 w-8 shrink-0 items-center justify-center" aria-label="Close the panel" title="Close" onClick={() => setReviewOpen(false)}>
                <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden="true">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">{panelBody}</div>
          </aside>
        ) : null}
      </div>
      {!wide && showReview ? (
        <SidePanel title={panelTab === "review" ? "Review" : panelTab === "comments" ? "Comments" : "Versions"} onClose={() => setReviewOpen(false)}>
          <div className="border-b border-rule-faint px-2 py-1">{panelTabs}</div>
          {panelBody}
        </SidePanel>
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
      {connecting ? <ConnectWizard auth={auth} brandId={brandId} onClose={() => setConnecting(false)} onConnected={() => {}} /> : null}
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
