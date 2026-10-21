"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { contentPairs, letter, notesFor, pairCount, partNodes, partOfPair, replacePart, type CellSummary, type Pair } from "@/lib/articleGrid";
import type { PmNode } from "@/lib/docHtml";
import { updateCalendarItem, type Site } from "@/lib/db";
import { listGrid, saveGridDoc, saveGridMeta, startDoc, type GridRow } from "@/lib/gridData";
import { statusChoice, statusPatch } from "@/lib/library";
import { nextMonday } from "@/lib/research";
import type { RunAuth } from "@/lib/runner";
import { useStash } from "@/lib/stash";
import { Dropdown, Pop } from "../Pickers";
import { post, STATUS_PICK } from "../research/shared";
import { Thinking } from "../ui";
import { usePoll, type LibraryOpen } from "./parts";
import { SectionPanel } from "./SectionPanel";

// The Library as a grid (docs/content-grid.md): one row per article, columns lettered like a sheet.
// Metadata: Status (the same Content status as the Keyword Deep Dive), Meta title, Meta description, Slug.
// Content: H1 and Section 1, H2 and Section 2, up to H20 and Section 20, and more with +. Generate brief fills the
// headings and metadata. Writers fill the sections: each opens in the side panel with the brief's notes for it,
// and Full view opens the whole article, with Publish.

const W = { check: 36, keyword: 220, status: 190, title: 220, description: 280, slug: 170, heading: 200, section: 260, add: 44 };
const ADDED = (siteId: string) => `arrowsterr.grid.pairs.${siteId}`;
const STEP: Record<string, string> = { research: "Researching", writing: "Planning", sections: "Writing", check: "Checking", modules: "Building modules", save: "Saving" };
const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const making = (r: GridRow) => r.topic.brief?.status === "generating" || r.topic.draft?.status === "generating";

/** What the writer is doing on a row right now, if anything, or why it stopped. */
function jobOf(r: GridRow): { label: string; tone: string; error?: string } | null {
  const { brief, draft } = r.topic;
  if (draft?.status === "generating") return { label: STEP[draft.step] ?? "Writing", tone: "tw-tag--orange" };
  if (brief?.status === "generating") return { label: STEP[brief.step] ?? "Planning", tone: "tw-tag--orange" };
  if (draft?.status === "failed") return { label: "Failed", tone: "tw-tag--red", error: draft.error ?? undefined };
  if (brief?.status === "failed" || (brief?.error && !r.doc)) return { label: "Failed", tone: "tw-tag--red", error: brief.error ?? undefined };
  return null;
}

export function ContentGrid({ sb, auth, site, canEdit, onOpen }: { sb: SupabaseClient; auth: RunAuth; site: Site; canEdit: boolean; onOpen: (open: LibraryOpen) => void }) {
  // A saved copy from an older grid can have another shape, so only a list counts.
  const [saved, setRows] = useStash<GridRow[] | null>(`library:${site.id}:rows`, null);
  const rows = Array.isArray(saved) ? saved : null;
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [edit, setEdit] = useState<{ itemId: string; key: "metaTitle" | "description" | "slug"; anchor: DOMRect } | null>(null);
  const [panel, setPanel] = useState<{ itemId: string; pair: number } | null>(null);
  const [starting, setStarting] = useState("");
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [added, setAdded] = useState(() => {
    try {
      return Number(localStorage.getItem(ADDED(site.id))) || 0;
    } catch {
      return 0;
    }
  });
  const rowsRef = useRef(rows);
  useEffect(() => {
    rowsRef.current = rows;
  });

  const load = useCallback(async () => {
    try {
      setRows(await listGrid(sb, site.id));
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setRows((r) => (Array.isArray(r) ? r : []));
    }
  }, [sb, site.id, setRows]);
  useEffect(() => {
    // Loading the grid once the site is known is the point of this effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);
  usePoll(Boolean(rows?.some(making)), 5000, load);

  const list = useMemo(() => rows ?? [], [rows]);
  const pairs = useMemo(() => new Map(list.map((r) => [r.topic.id, contentPairs(r.doc, r.plan)])), [list]);
  const count = pairCount(Math.max(0, ...[...pairs.values()].map((p) => p.length)), added);

  const rowOf = (id: string) => rowsRef.current?.find((r) => r.topic.id === id) ?? null;
  const patchRow = (id: string, fn: (r: GridRow) => GridRow) => setRows((rs) => (Array.isArray(rs) ? rs.map((r) => (r.topic.id === id ? fn(r) : r)) : rs));
  const run = (p: Promise<unknown>) => p.catch((e) => setError(e instanceof Error ? e.message : String(e)));

  function addPair() {
    const next = added + 1;
    setAdded(next);
    try {
      localStorage.setItem(ADDED(site.id), String(next));
    } catch {
      // The extra columns stay for this visit.
    }
  }

  async function setStatus(r: GridRow, choice: string) {
    const patch = statusPatch(choice, r.topic.due_date, isoDay(nextMonday()));
    patchRow(r.topic.id, (x) => ({ ...x, topic: { ...x.topic, ...patch } }));
    await updateCalendarItem(sb, r.topic.id, patch);
  }

  async function saveMeta(itemId: string, key: "metaTitle" | "description" | "slug", value: string) {
    const r = rowOf(itemId);
    if (!r?.doc) return;
    const meta = { ...r.doc.meta, [key]: key === "slug" ? value.toLowerCase().replace(/[^a-z0-9/-]+/g, "-").replace(/^-+|-+$/g, "") : value };
    patchRow(itemId, (x) => (x.doc ? { ...x, doc: { ...x.doc, meta } } : x));
    await saveGridMeta(sb, r.doc.id, meta);
  }

  async function generate(ids: string[]) {
    setError("");
    setBusy((b) => new Set([...b, ...ids]));
    try {
      const out = await post<{ results: { itemId: string; ok: boolean; error?: string }[] }>(auth, "/api/agentic-writer/grid", { action: "generate", itemIds: ids });
      const failed = out.results.filter((x) => !x.ok);
      if (failed.length) setError(failed.map((f) => `${rowOf(f.itemId)?.topic.keyword ?? "A row"}: ${f.error}`).join(" "));
      setSelected(new Set());
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy((b) => new Set([...b].filter((x) => !ids.includes(x))));
    }
  }
  const fullView = (r: GridRow) => (r.doc ? onOpen({ kind: "doc", id: r.doc.id }) : undefined);

  /** Open a section in the side panel. The first time, the doc is made from the brief and the piece moves to Writing. */
  async function write(r: GridRow, pair: number) {
    if (r.doc) return setPanel({ itemId: r.topic.id, pair });
    if (!r.plan || !canEdit) return;
    setStarting(r.topic.id);
    try {
      const doc = await startDoc(sb, { workspaceId: auth.workspaceId, siteId: site.id, itemId: r.topic.id, plan: r.plan });
      patchRow(r.topic.id, (x) => ({ ...x, doc }));
      if (["idea", "planned", "brief"].includes(statusChoice(r.topic))) await setStatus(r, "writing");
      setPanel({ itemId: r.topic.id, pair });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setStarting("");
    }
  }

  /** Save one section from the panel into the latest copy of its doc. */
  async function saveSection(itemId: string, pair: number, nodes: PmNode[]) {
    const r = rowOf(itemId);
    if (!r?.doc) return;
    const content = replacePart(r.doc.content, partOfPair(pair), nodes);
    patchRow(itemId, (x) => (x.doc ? { ...x, doc: { ...x.doc, content } } : x));
    const words = await saveGridDoc(sb, r.doc.id, content);
    patchRow(itemId, (x) => (x.doc ? { ...x, doc: { ...x.doc, words } } : x));
  }

  if (!rows) return <Thinking text="Opening the Library..." />;

  // Letters: A Keyword, B to E Metadata, then the content pairs.
  const metaCols = [
    { key: "status", name: "Status", width: W.status },
    { key: "metaTitle", name: "Meta title", width: W.title },
    { key: "description", name: "Meta description", width: W.description },
    { key: "slug", name: "Slug", width: W.slug },
  ] as const;
  const contentCols = Array.from({ length: count }, (_, i) => [
    { key: `h${i}`, name: `H${i + 1}`, width: W.heading, pair: i, heading: true },
    { key: `s${i}`, name: `Section ${i + 1}`, width: W.section, pair: i, heading: false },
  ]).flat();
  const width = W.check + W.keyword + metaCols.reduce((n, c) => n + c.width, 0) + contentCols.reduce((n, c) => n + c.width, 0) + W.add;
  const allOn = list.length > 0 && list.every((r) => selected.has(r.topic.id));
  const picked = [...selected];
  const editRow = edit ? rows.find((r) => r.topic.id === edit.itemId) : null;
  const panelRow = panel ? rows.find((r) => r.topic.id === panel.itemId) : null;
  const panelPairs = panel ? (pairs.get(panel.itemId) ?? []) : [];
  const panelPair = panel ? panelPairs[panel.pair] : undefined;

  const head = "sticky z-20 border-r border-b border-rule bg-[var(--bg-secondary)] px-2 text-left font-medium text-muted";
  const cell = "border-r border-b border-rule bg-white px-2 py-1.5 align-top group-hover:bg-[var(--bg-secondary)]";
  const tag = (l: string) => <span className="tw-tag shrink-0">{l}</span>;
  const muted = (t: string) => (t ? <span className="line-clamp-3 text-muted">{t}</span> : <span className="text-faint">–</span>);

  function metaCell(r: GridRow, key: "status" | "metaTitle" | "description" | "slug") {
    if (key === "status") {
      const job = jobOf(r);
      return (
        <span className="flex flex-col gap-1.5">
          <span className="flex items-center gap-1">
            <Dropdown
              label="Content status"
              value={statusChoice(r.topic)}
              disabled={!canEdit}
              onChange={(v) => void run(setStatus(r, v))}
              className="aw-dropdown--field h-7! min-w-0 flex-1 text-[12px]!"
              options={STATUS_PICK.map((x) => ({ id: x.id as string, label: x.label, tone: x.tone }))}
            />
              {canEdit && !making(r) && (!r.topic.brief || r.topic.brief.status === "failed") ? (
              <button type="button" className="aw-iconbtn shrink-0" disabled={busy.has(r.topic.id)} title="Generate brief" aria-label="Generate brief" onClick={() => void generate([r.topic.id])}>
                <svg className="aw-icon" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M7 5v14l11-7z" />
                </svg>
              </button>
            ) : null}
          </span>
          {job ? (
            <span className={`tw-tag self-start ${job.tone}`} title={job.error}>
              {job.label}
            </span>
          ) : null}
        </span>
      );
    }
    const value = r.doc ? String(r.doc.meta[key] ?? "") : "";
    const fallback = key === "metaTitle" ? (r.plan?.title ?? "") : key === "description" ? (r.plan?.description ?? "") : (r.plan?.slug ?? "");
    const face = value ? <span className="line-clamp-3 text-ink">{value}</span> : muted(fallback);
    return canEdit && r.doc ? (
      <button type="button" className="flex h-full w-full items-start text-left" onClick={(e) => setEdit({ itemId: r.topic.id, key, anchor: e.currentTarget.getBoundingClientRect() })}>
        {face}
      </button>
    ) : (
      face
    );
  }

  function contentCell(r: GridRow, c: (typeof contentCols)[number]) {
    const p: Pair | undefined = pairs.get(r.topic.id)?.[c.pair];
    if (!p) return muted("");
    if (c.heading)
      return r.doc ? (
        <button type="button" className="line-clamp-3 text-left font-medium text-ink" onClick={() => setPanel({ itemId: r.topic.id, pair: c.pair })}>
          {p.heading || "–"}
        </button>
      ) : (
        <span className="line-clamp-3 text-muted">{p.heading || "–"}</span>
      );
    // A section with words opens as it is; an empty one (or one with no doc yet) offers Write.
    if (p.body && (p.body.words || p.body.has.length)) return <Section body={p.body} onOpen={() => setPanel({ itemId: r.topic.id, pair: c.pair })} />;
    return canEdit && (r.doc || r.plan) ? (
      <button type="button" className="aw-text-link text-[12px]" disabled={starting === r.topic.id} onClick={() => void write(r, c.pair)}>
        {starting === r.topic.id ? "Opening..." : "Write"}
      </button>
    ) : (
      muted("")
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="aw-h2 mr-auto">Library</h1>
        {picked.length ? <span className="text-[12px] text-muted">{picked.length} selected</span> : null}
        {canEdit ? (
          <button type="button" className="aw-btn aw-btn--primary aw-btn--sm" disabled={!picked.length || picked.every((id) => busy.has(id))} onClick={() => void generate(picked)}>
            Generate brief
          </button>
        ) : null}
      </div>
      {error ? <p className="aw-error">{error}</p> : null}

      <div className="aw-frame overflow-auto" style={{ maxHeight: "calc(100vh - 200px)" }}>
        <table className="border-separate border-spacing-0 text-[13px]" style={{ tableLayout: "fixed", width }}>
          <colgroup>
            <col style={{ width: W.check }} />
            <col style={{ width: W.keyword }} />
            {metaCols.map((c) => (
              <col key={c.key} style={{ width: c.width }} />
            ))}
            {contentCols.map((c) => (
              <col key={c.key} style={{ width: c.width }} />
            ))}
            <col style={{ width: W.add }} />
          </colgroup>
          <thead>
            <tr>
              <th rowSpan={2} className={`${head} top-0 left-0 z-30 px-2`}>
                <input type="checkbox" aria-label="Select all" checked={allOn} onChange={() => setSelected(allOn ? new Set() : new Set(list.map((r) => r.topic.id)))} />
              </th>
              <th rowSpan={2} className={`${head} top-0 z-30`} style={{ left: W.check }}>
                <span className="flex items-center gap-2">
                  {tag("A")}
                  Keyword
                </span>
              </th>
              <th colSpan={metaCols.length} className={`${head} top-0 h-8 text-ink`}>
                Metadata
              </th>
              <th colSpan={contentCols.length + 1} className={`${head} top-0 h-8 text-ink`}>
                Content
              </th>
            </tr>
            <tr>
              {[...metaCols, ...contentCols].map((c, i) => (
                <th key={c.key} className={`${head} top-8 h-8`}>
                  <span className="flex items-center gap-2">
                    {tag(letter(i + 1))}
                    <span className="truncate">{c.name}</span>
                  </span>
                </th>
              ))}
              <th className={`${head} top-8 h-8 px-1`}>
                {canEdit ? (
                  <button type="button" className="aw-iconbtn" title="Add a heading and section" aria-label="Add a heading and section" onClick={addPair}>
                    <svg className="aw-icon" viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M12 5v14M5 12h14" />
                    </svg>
                  </button>
                ) : null}
              </th>
            </tr>
          </thead>
          <tbody>
            {list.map((r) => (
              <tr key={r.topic.id} className="group">
                <td className={`${cell} sticky left-0 z-10`} style={{ height: 76 }}>
                  <input
                    type="checkbox"
                    className="mt-2"
                    aria-label={`Select ${r.topic.keyword}`}
                    checked={selected.has(r.topic.id)}
                    onChange={() =>
                      setSelected((s) => {
                        const n = new Set(s);
                        if (n.has(r.topic.id)) n.delete(r.topic.id);
                        else n.add(r.topic.id);
                        return n;
                      })
                    }
                  />
                </td>
                <td className={`${cell} sticky z-10`} style={{ left: W.check }}>
                  <div className="flex h-[63px] flex-col items-start gap-1 overflow-hidden">
                    <span className="w-full truncate font-medium text-ink">{r.topic.keyword}</span>
                    {r.doc ? (
                      <button type="button" className="aw-text-link text-[12px]" onClick={() => fullView(r)}>
                        Full view
                      </button>
                    ) : r.topic.brief && (r.topic.brief.status === "ready" || r.topic.brief.status === "approved") ? (
                      <button type="button" className="aw-text-link text-[12px]" onClick={() => onOpen({ kind: "brief", id: r.topic.brief!.id })}>
                        View brief
                      </button>
                    ) : null}
                  </div>
                </td>
                {metaCols.map((c) => (
                  <td key={c.key} className={cell}>
                    <div className="h-[63px] overflow-hidden">{metaCell(r, c.key)}</div>
                  </td>
                ))}
                {contentCols.map((c) => (
                  <td key={c.key} className={cell}>
                    <div className="h-[63px] overflow-hidden">{contentCell(r, c)}</div>
                  </td>
                ))}
                <td className={cell} />
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {edit && editRow?.doc ? (
        <EditPop
          anchor={edit.anchor}
          label={metaCols.find((c) => c.key === edit.key)?.name ?? ""}
          value={String(editRow.doc.meta[edit.key] ?? "")}
          long={edit.key === "description"}
          onSave={(v) => {
            void run(saveMeta(edit.itemId, edit.key, v));
            setEdit(null);
          }}
          onClose={() => setEdit(null)}
        />
      ) : null}
      {panel && panelRow?.doc ? (
        <SectionPanel
          key={`${panel.itemId}:${panel.pair}`}
          sb={sb}
          workspaceId={auth.workspaceId}
          docId={panelRow.doc.id}
          part={partOfPair(panel.pair)}
          label={`${letter(6 + panel.pair * 2)} · Section ${panel.pair + 1}${panelPair?.heading ? ` · ${panelPair.heading}` : ""}`}
          nodes={partNodes(panelRow.doc.content, partOfPair(panel.pair))}
          notes={notesFor(panelRow.plan, partOfPair(panel.pair), panelPair?.heading ?? "")}
          canEdit={canEdit}
          onSave={(nodes) => saveSection(panel.itemId, panel.pair, nodes)}
          onMove={(step) => setPanel({ itemId: panel.itemId, pair: panel.pair + step })}
          canBack={panel.pair > 0}
          canNext={panel.pair < panelPairs.length - 1}
          onFull={() => {
            setPanel(null);
            fullView(panelRow);
          }}
          onClose={() => setPanel(null)}
        />
      ) : null}
    </div>
  );
}

/** A section's face: the start of its text, what's inside and its words. Click to view the draft. */
function Section({ body, onOpen }: { body: CellSummary; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} className="flex h-full w-full flex-col items-start gap-1 text-left">
      <span className="line-clamp-2 w-full text-muted">{body.preview || "–"}</span>
      <span className="mt-auto flex flex-wrap items-center gap-1">
        {body.has.map((h) => (
          <span key={h} className="tw-tag">
            {h === "html" ? "Interactive" : h[0].toUpperCase() + h.slice(1)}
          </span>
        ))}
        <span className="aw-num text-[11px] text-faint">{body.words} words</span>
      </span>
    </button>
  );
}

/** Edit one metadata value in place. Enter saves; Shift+Enter makes a new line in the description. */
function EditPop({ anchor, label, value, long, onSave, onClose }: { anchor: DOMRect; label: string; value: string; long: boolean; onSave: (v: string) => void; onClose: () => void }) {
  const [v, setV] = useState(value);
  const keys = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !(long && e.shiftKey)) {
      e.preventDefault();
      onSave(v.trim());
    }
  };
  return (
    <Pop anchor={anchor} onClose={onClose} width={long ? 420 : 320} label={label}>
      <div className="flex flex-col gap-2 p-2">
        {long ? (
          <textarea autoFocus value={v} rows={4} onChange={(e) => setV(e.target.value)} onKeyDown={keys} aria-label={label} className="aw-input min-h-24 py-2" />
        ) : (
          <input autoFocus value={v} onChange={(e) => setV(e.target.value)} onKeyDown={keys} aria-label={label} className="aw-input" />
        )}
        <div className="flex items-center justify-between">
          {label === "Slug" ? <span /> : <span className="aw-num text-[11px] text-faint">{v.length}</span>}
          <button type="button" className="aw-btn aw-btn--primary aw-btn--sm" onClick={() => onSave(v.trim())}>
            Save
          </button>
        </div>
      </div>
    </Pop>
  );
}
