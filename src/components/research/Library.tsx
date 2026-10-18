"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createDoc, deleteDoc, docForItem, getDoc, getGuideline, listBriefMeta, listCalendar, listDocs, updateCalendarItem, type CalendarItem, type CalendarStatus, type Doc, type DocMeta, type Site } from "@/lib/db";
import { briefState, draftState, type DocState } from "@/lib/library";
import type { RunAuth } from "@/lib/runner";
import { useStash } from "@/lib/stash";
import type { BrandGuideline } from "@/lib/writerTypes";
import { Confirm } from "../reports/Dialog";
import { Seg, Thinking } from "../ui";
import { BriefDocEditor } from "./BriefDocEditor";
import type { LibraryTarget, WriterAccess } from "./ContentPiece";
import { DocsEditor } from "./DocsEditor";
import { generateDraft } from "./libraryActions";
import { FIELD } from "./shared";

type Filter = "all" | "briefs" | "drafts";
type Ask = { kind: "replace"; item: CalendarItem } | { kind: "delete"; doc: DocMeta } | { kind: "remove"; item: CalendarItem };
type Row = { key: string; type: "brief" | "draft"; title: string; keyword: string | null; state: DocState; updated: string | null; item: CalendarItem | null; doc: DocMeta | null };

const fmtDay = (s: string | null) => (s ? new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "–");
const latest = (...xs: (string | null | undefined)[]) => xs.filter((x): x is string => Boolean(x)).sort().pop() ?? null;
const BLANK = { type: "doc", content: [{ type: "heading", attrs: { level: 1 } }, { type: "paragraph" }] };

/** The Library: each imported keyword's brief and draft as their own documents, and documents of their own. */
export function Library({ sb, auth, site, brandName, canEdit, writer = { open: true } }: { sb: SupabaseClient; auth: RunAuth; site: Site; brandName: string; canEdit: boolean; writer?: WriterAccess }) {
  const [items, setItems] = useStash<CalendarItem[] | null>(`cal:${site.id}:items`, null);
  const [docs, setDocs] = useState<DocMeta[] | null>(null);
  const [briefs, setBriefs] = useState<Record<string, { title: string | null; savedAt: string | null }>>({});
  const [open, setOpen] = useStash<LibraryTarget>(`lib:${site.id}:open`, { kind: "list" });
  const [drafting, setDrafting] = useState<Set<string>>(new Set());
  const [ask, setAsk] = useState<Ask | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const [cal, d, b] = await Promise.all([listCalendar(sb, site.id), listDocs(sb, site.id), listBriefMeta(sb, site.id).catch(() => ({}))]);
      setItems(cal);
      setDocs(d);
      setBriefs(b);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setDocs((d) => d ?? []);
    }
  }, [sb, site.id, setItems]);
  useEffect(() => {
    // Loading the Library from Supabase is the point of this effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  // Briefs being written show their progress here too.
  const running = (items ?? []).some((i) => i.brief_status === "running");
  useEffect(() => {
    if (!running || open.kind !== "list") return;
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [running, open.kind, load]);

  const patchLocal = useCallback((id: string, p: Partial<CalendarItem>) => setItems((xs) => (xs ? xs.map((i) => (i.id === id ? { ...i, ...p } : i)) : xs)), [setItems]);
  async function patchItem(id: string, p: Partial<CalendarItem>) {
    patchLocal(id, p);
    try {
      await updateCalendarItem(sb, id, p);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }
  const putDoc = (meta: DocMeta) => setDocs((d) => [meta, ...(d ?? []).filter((x) => x.id !== meta.id)]);

  const draftOf = useMemo(() => new Map((docs ?? []).filter((d) => d.calendar_item_id).map((d) => [d.calendar_item_id as string, d])), [docs]);

  /** Generate a draft from the saved brief. A draft that exists already is replaced only after asking, and kept as a version. */
  async function startDraft(item: CalendarItem, confirmed = false) {
    setError("");
    if (!writer.open) return writer.onUpgrade?.();
    if (!confirmed) {
      const existing = draftOf.get(item.id) ?? (await docForItem(sb, item.id).catch(() => null));
      if (existing) return setAsk({ kind: "replace", item });
    }
    setDrafting((s) => new Set(s).add(item.id));
    try {
      const { doc, status } = await generateDraft(sb, auth, item);
      putDoc(doc);
      patchLocal(item.id, { status });
      setOpen({ kind: "draft", docId: doc.id });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setDrafting((s) => {
        const n = new Set(s);
        n.delete(item.id);
        return n;
      });
    }
  }

  async function newDocument() {
    setError("");
    if (!writer.open) return writer.onUpgrade?.();
    try {
      const d = await createDoc(sb, { workspace_id: auth.workspaceId, site_id: site.id, title: "Untitled", content: BLANK });
      putDoc(d);
      setOpen({ kind: "draft", docId: d.id });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function confirm() {
    if (!ask) return;
    const a = ask;
    setAsk(null);
    if (a.kind === "replace") return startDraft(a.item, true);
    try {
      if (a.kind === "delete") {
        await deleteDoc(sb, a.doc.id);
        setDocs((d) => (d ?? []).filter((x) => x.id !== a.doc.id));
      } else await patchItem(a.item.id, { library_at: null });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  const askDialog = ask ? (
    <Confirm
      title={ask.kind === "replace" ? "Replace the draft?" : ask.kind === "delete" ? `Delete ${ask.doc.title || "this document"}?` : `Remove "${ask.item.keyword}" from the Library?`}
      text={
        ask.kind === "replace"
          ? "A new draft is written from the saved brief. Your current draft is kept in Versions, where you can restore it."
          : ask.kind === "delete"
            ? `It has ${ask.doc.words.toLocaleString("en-US")} words. This can't be undone.`
            : "The keyword and its brief stay on the Content Plan."
      }
      action={ask.kind === "replace" ? "Replace draft" : ask.kind === "delete" ? "Delete" : "Remove"}
      onClose={() => setAsk(null)}
      onConfirm={confirm}
    />
  ) : null;

  // ─────────────── full-screen editors ───────────────
  if (open.kind === "brief") {
    const item = items?.find((i) => i.id === open.itemId);
    if (!item) return items ? <Gone onBack={() => setOpen({ kind: "list" })} /> : <Thinking text="Opening the brief..." />;
    return (
      <>
        <BriefDocEditor
          key={item.id}
          sb={sb}
          auth={auth}
          site={site}
          brandName={brandName}
          item={item}
          canEdit={canEdit}
          hasDraft={draftOf.has(item.id)}
          drafting={drafting.has(item.id)}
          onBack={() => {
            setOpen({ kind: "list" });
            load();
          }}
          onGenerateDraft={() => startDraft(item)}
          onOpenDraft={() => {
            const d = draftOf.get(item.id);
            if (d) setOpen({ kind: "draft", docId: d.id });
          }}
          onItem={(p) => patchLocal(item.id, p)}
        />
        {/* Above the full-screen editor. */}
        <div className="relative z-[80]">
          {error ? <p className="aw-error fixed right-5 bottom-5 max-w-md bg-white p-3">{error}</p> : null}
          {askDialog}
        </div>
      </>
    );
  }
  if (open.kind === "draft") {
    return (
      <DraftScreen
        sb={sb}
        auth={auth}
        site={site}
        docId={open.docId}
        canEdit={canEdit}
        items={items ?? []}
        onBack={() => {
          setOpen({ kind: "list" });
          load();
        }}
        onSaved={putDoc}
        onStatus={(id, s) => patchItem(id, { status: s })}
        onPublished={(id) => patchLocal(id, { status: "published" })}
      />
    );
  }

  // ─────────────── the list ───────────────
  if (!items || !docs) return <Thinking text="Loading the Library..." />;
  const hasColumn = items.some((i) => i.library_at !== undefined);
  const pieces = items
    .filter((i) => draftOf.has(i.id) || (hasColumn ? Boolean(i.library_at) : Boolean(i.brief_status)))
    .map((i) => ({ item: i, draft: draftOf.get(i.id) ?? null, at: latest(i.library_at, briefs[i.id]?.savedAt, draftOf.get(i.id)?.updated_at, i.brief_at) }))
    .sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""));
  const own = docs.filter((d) => !d.calendar_item_id || !items.some((i) => i.id === d.calendar_item_id));

  const q = query.trim().toLowerCase();
  const show = (r: Row) => (filter === "all" || (filter === "briefs" ? r.type === "brief" : r.type === "draft")) && (!q || r.title.toLowerCase().includes(q) || (r.keyword ?? "").toLowerCase().includes(q));
  const groups = [
    ...pieces.map(({ item, draft }) => ({
      key: item.id,
      label: item.keyword,
      item,
      rows: [
        { key: `${item.id}:brief`, type: "brief" as const, title: briefs[item.id]?.title || item.keyword, keyword: item.keyword, state: briefState(item), updated: briefs[item.id]?.savedAt ?? item.brief_at, item, doc: null },
        { key: `${item.id}:draft`, type: "draft" as const, title: draft?.title || briefs[item.id]?.title || item.keyword, keyword: item.keyword, state: draftState(item, draft), updated: draft?.updated_at ?? null, item, doc: draft },
      ].filter(show),
    })),
    ...(own.length
      ? [
          {
            key: "own",
            label: "Other documents",
            item: null,
            rows: own.map((d): Row => ({ key: d.id, type: "draft", title: d.title || "Untitled", keyword: null, state: { label: d.words ? "Draft" : "Empty", tone: "warn" }, updated: d.updated_at, item: null, doc: d })).filter(show),
          },
        ]
      : []),
  ].filter((g) => g.rows.length);

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-end gap-3">
        <div className="mr-auto flex flex-col gap-0.5">
          <h1 className="aw-h2">Library</h1>
          <span className="text-[13px] text-muted">Briefs and drafts in one place</span>
        </div>
        {canEdit ? (
          <button type="button" className="aw-btn aw-btn--primary aw-btn--sm" onClick={newDocument}>
            + New document
          </button>
        ) : null}
      </header>
      {error ? <p className="aw-error">{error}</p> : null}

      <div className="flex flex-wrap items-center gap-3">
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search documents" aria-label="Search documents" className={`${FIELD} h-9 w-64 rounded-md`} />
        <Seg
          label="Show"
          value={filter}
          onChange={setFilter}
          options={[
            { id: "all", label: "All documents" },
            { id: "briefs", label: "Briefs" },
            { id: "drafts", label: "Drafts" },
          ]}
        />
      </div>

      {groups.length ? (
        <div className="aw-frame overflow-x-auto bg-white">
          <table className="w-full min-w-[760px] border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-rule text-left">
                {["Title", "Type", "Keyword", "Status", "Updated", "Actions", ""].map((h, n) => (
                  <th key={n} scope="col" className="aw-label px-4 py-2.5 font-semibold">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            {groups.map((g) => (
              <tbody key={g.key}>
                <tr className="border-b border-rule-faint bg-surface-2">
                  <th colSpan={7} scope="rowgroup" className="px-4 py-2 text-left text-[13px] font-semibold text-ink">
                    {g.label} <span className="aw-num font-normal text-muted">({g.rows.length})</span>
                  </th>
                </tr>
                {g.rows.map((r) => (
                  <tr key={r.key} className="border-b border-rule-faint last:border-b-0">
                    <td className="px-4 py-2.5">
                      <span className="flex items-center gap-2.5">
                        <DocIcon />
                        <span className="flex min-w-0 flex-col">
                          <span className="truncate font-medium text-ink">{r.title}</span>
                          <span className="text-[12px] text-muted">{r.type === "brief" ? "Content Brief" : r.item ? "Article Draft" : "Document"}</span>
                        </span>
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="aw-status aw-status--pending">{r.type === "brief" ? "Brief" : "Draft"}</span>
                    </td>
                    <td className="max-w-48 truncate px-4 py-2.5 text-muted">{r.keyword ?? "–"}</td>
                    <td className="px-4 py-2.5">
                      <span className={`aw-status aw-status--${r.state.tone}`}>{r.state.label}</span>
                    </td>
                    <td className="aw-num px-4 py-2.5 whitespace-nowrap text-muted">{fmtDay(r.updated)}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <RowAction row={r} canEdit={canEdit} drafting={Boolean(r.item && drafting.has(r.item.id))} onOpen={setOpen} onDraft={startDraft} />
                    </td>
                    <td className="px-2 py-2.5 text-right">
                      {canEdit && r.doc ? (
                        <button type="button" className="aw-iconbtn" title={r.item ? "Delete draft" : "Delete"} aria-label={r.item ? "Delete draft" : "Delete"} onClick={() => setAsk({ kind: "delete", doc: r.doc as DocMeta })}>
                          <TrashIcon />
                        </button>
                      ) : canEdit && r.type === "brief" && r.item && !draftOf.has(r.item.id) && hasColumn ? (
                        <button type="button" className="aw-iconbtn" title="Remove from Library" aria-label="Remove from Library" onClick={() => setAsk({ kind: "remove", item: r.item as CalendarItem })}>
                          <span aria-hidden="true" className="text-[16px] leading-none">×</span>
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            ))}
          </table>
        </div>
      ) : (
        <div className="aw-frame flex flex-col items-start gap-3 bg-white p-8">
          <p className="text-[14px] text-ink">{pieces.length || own.length ? "No documents match." : "No documents yet. Import a keyword from the Content Plan, or start a new document."}</p>
        </div>
      )}
      {askDialog}
    </div>
  );
}

function RowAction({ row, canEdit, drafting, onOpen, onDraft }: { row: Row; canEdit: boolean; drafting: boolean; onOpen: (t: LibraryTarget) => void; onDraft: (i: CalendarItem) => void }) {
  if (row.type === "brief" && row.item) {
    const item = row.item;
    if (item.brief_status === "done")
      return (
        <button type="button" className="aw-text-link" onClick={() => onOpen({ kind: "brief", itemId: item.id })}>
          Open brief
        </button>
      );
    if (item.brief_status === "running") return <span className="text-muted">Generating...</span>;
    return canEdit ? (
      <button type="button" className="aw-text-link" onClick={() => onOpen({ kind: "brief", itemId: item.id })}>
        Generate brief
      </button>
    ) : (
      <span className="text-muted">–</span>
    );
  }
  if (row.doc)
    return (
      <button type="button" className="aw-text-link" onClick={() => onOpen({ kind: "draft", docId: (row.doc as DocMeta).id })}>
        Open draft
      </button>
    );
  if (!row.item || !canEdit) return <span className="text-muted">–</span>;
  const item = row.item;
  return (
    <button type="button" className="aw-btn aw-btn--primary aw-btn--sm" disabled={drafting || item.brief_status !== "done"} title={item.brief_status !== "done" ? "Generate the brief first" : undefined} onClick={() => onDraft(item)}>
      {drafting ? "Writing..." : "Generate Draft"}
    </button>
  );
}

/** A draft in the full-screen editor, with its piece's status and a way back. */
function DraftScreen({
  sb,
  auth,
  site,
  docId,
  canEdit,
  items,
  onBack,
  onSaved,
  onStatus,
  onPublished,
}: {
  sb: SupabaseClient;
  auth: RunAuth;
  site: Site;
  docId: string;
  canEdit: boolean;
  items: CalendarItem[];
  onBack: () => void;
  onSaved: (meta: DocMeta) => void;
  onStatus: (itemId: string, s: CalendarStatus) => void;
  onPublished: (itemId: string) => void;
}) {
  const [doc, setDoc] = useState<Doc | null>(null);
  const [guideline, setGuideline] = useState<BrandGuideline | null | undefined>(undefined);
  const [error, setError] = useState("");
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    getDoc(sb, docId)
      .then((d) => live.current && setDoc(d))
      .catch((e) => live.current && setError(e instanceof Error ? e.message : String(e)));
    getGuideline(sb, site.id)
      .then((g) => live.current && setGuideline(g))
      .catch(() => live.current && setGuideline(null));
    return () => {
      live.current = false;
    };
  }, [sb, docId, site.id]);

  if (error) return <Gone onBack={onBack} text={error} />;
  if (!doc || guideline === undefined) return <Thinking text="Opening the draft..." />;
  const item = doc.calendar_item_id ? items.find((i) => i.id === doc.calendar_item_id) : undefined;
  const status = item ? (item.status === "review" || item.status === "published" ? item.status : "writing") : undefined;
  return (
    <DocsEditor
      key={doc.id}
      sb={sb}
      auth={auth}
      site={site}
      doc={doc}
      canEdit={canEdit}
      guideline={guideline}
      onSaved={onSaved}
      fixedFull
      onBack={onBack}
      status={status}
      onStatus={item ? (s) => onStatus(item.id, s) : undefined}
      onPublished={item ? () => onPublished(item.id) : undefined}
    />
  );
}

function Gone({ onBack, text = "This document is no longer here." }: { onBack: () => void; text?: string }) {
  return (
    <div className="aw-frame flex flex-col items-start gap-3 bg-white p-8">
      <p className="aw-error">{text}</p>
      <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm" onClick={onBack}>
        Back to Library
      </button>
    </div>
  );
}

function DocIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" className="shrink-0 text-brand" aria-hidden="true">
      <path d="M6 3h8l4 4v14H6z" />
      <path d="M14 3v4h4M9 12h6M9 16h6" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />
    </svg>
  );
}
