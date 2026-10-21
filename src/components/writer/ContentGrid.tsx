"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { addSection, docToText, fillPrompt, letter, lockKey, moveSection, partNodes, removeSection, replacePart, splitDoc, summarize, type Part } from "@/lib/articleGrid";
import type { Site } from "@/lib/db";
import type { PmNode } from "@/lib/docHtml";
import { addColumn, deleteColumn, listGrid, saveCell, saveGridDoc, saveGridMeta, updateColumn, type GridColumn, type GridDoc, type GridRow } from "@/lib/gridData";
import type { RunAuth } from "@/lib/runner";
import { useStash } from "@/lib/stash";
import { Pop } from "../Pickers";
import { Confirm, Modal } from "../reports/Dialog";
import { post } from "../research/shared";
import { Seg, Thinking } from "../ui";
import { CellPanel, type CellSave } from "./CellPanel";
import { usePoll, type LibraryOpen } from "./parts";

// The Library as a grid (docs/content-grid.md): one row per article, one column per part, lettered like a sheet.
// Meta title, meta description, slug, H1, the intro, then one column per section, then the columns people add.
// Click a section to edit it in the side panel. Drag a section cell along its row to move it in that article;
// drag a column's header to move the column. Generate makes the whole article: research, brief, sections, check.

type Unit = "status" | "title" | "description" | "slug" | "h1" | "intro" | "sections" | `col:${string}`;
const BUILT: Unit[] = ["status", "title", "description", "slug", "h1", "intro", "sections"];
const NAME: Record<string, string> = { keyword: "Keyword", status: "Status", title: "Meta title", description: "Meta description", slug: "Slug", h1: "H1", intro: "Intro" };
const WIDTH: Record<string, number> = { keyword: 240, status: 150, title: 240, description: 300, slug: 180, h1: 260, intro: 280, section: 280, col: 240 };
const LAYOUT = (siteId: string) => `arrowsterr.grid.${siteId}`;

/** A column as shown: its letter, what it is, and for sections which one. */
type Shown = { key: string; letter: string; unit: Unit | "keyword"; name: string; width: number; section?: number; column?: GridColumn };

const STEP: Record<string, string> = { research: "Researching", writing: "Planning", sections: "Writing", check: "Checking", modules: "Building modules", save: "Saving" };
const making = (r: GridRow) => r.topic.brief?.status === "generating" || r.topic.draft?.status === "generating";

/** Where a row stands, in a word, with its tone. */
function stateOf(r: GridRow): { label: string; tone: string; error?: string } {
  const { brief, draft } = r.topic;
  if (draft?.status === "generating") return { label: STEP[draft.step] ?? "Writing", tone: "tw-tag--orange" };
  if (brief?.status === "generating") return { label: STEP[brief.step] ?? "Planning", tone: "tw-tag--orange" };
  if (draft?.status === "failed") return { label: "Failed", tone: "tw-tag--red", error: draft.error ?? undefined };
  if (brief?.status === "failed") return { label: "Failed", tone: "tw-tag--red", error: brief.error ?? undefined };
  if (r.doc) return { label: "Ready", tone: "tw-tag--green" };
  if (brief?.error) return { label: "Brief ready", tone: "", error: brief.error };
  if (brief) return { label: "Brief ready", tone: "" };
  return { label: "Not started", tone: "" };
}

const wordsOf = (content: unknown) => docToText(content).split(/\s+/).filter(Boolean).length;

export function ContentGrid({ sb, auth, site, canEdit, onOpen }: { sb: SupabaseClient; auth: RunAuth; site: Site; canEdit: boolean; onOpen: (open: LibraryOpen) => void }) {
  const [data, setData] = useStash<{ rows: GridRow[]; columns: GridColumn[]; columnsError: string } | null>(`library:${site.id}:grid`, null);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [panel, setPanel] = useState<{ itemId: string; part: Part } | null>(null);
  const [edit, setEdit] = useState<{ itemId: string; key: string; anchor: DOMRect } | null>(null);
  const [colMenu, setColMenu] = useState<{ column: GridColumn; anchor: DOMRect } | null>(null);
  const [colForm, setColForm] = useState<GridColumn | "new" | null>(null);
  const [removingCol, setRemovingCol] = useState<GridColumn | null>(null);
  const [regen, setRegen] = useState<string[] | null>(null);
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [order, setOrder] = useState<Unit[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(LAYOUT(site.id)) ?? "[]") as Unit[];
    } catch {
      return [];
    }
  });
  const dataRef = useRef(data);
  useEffect(() => {
    dataRef.current = data;
  });

  const load = useCallback(async () => {
    try {
      setData(await listGrid(sb, site.id));
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setData((d) => d ?? { rows: [], columns: [], columnsError: "" });
    }
  }, [sb, site.id, setData]);
  useEffect(() => {
    // Loading the grid once the site is known is the point of this effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);
  usePoll(Boolean(data?.rows.some(making) || data?.rows.some((r) => Object.values(r.cells).some((c) => c.status === "generating"))), 5000, load);

  const rows = useMemo(() => data?.rows ?? [], [data]);
  const columns = useMemo(() => data?.columns ?? [], [data]);

  // The units in the order this person set, with new columns at the end.
  const units = useMemo<Unit[]>(() => {
    const all: Unit[] = [...BUILT, ...columns.map((c) => `col:${c.id}` as Unit)];
    const kept = order.filter((u) => all.includes(u));
    return [...kept, ...all.filter((u) => !kept.includes(u))];
  }, [order, columns]);
  const sectionCount = useMemo(() => Math.max(1, ...rows.map((r) => (r.doc ? splitDoc(r.doc.content).sections.length + (canEdit ? 1 : 0) : (r.plan?.outline.length ?? 0)))), [rows, canEdit]);

  const shown = useMemo<Shown[]>(() => {
    const out: Omit<Shown, "letter">[] = [{ key: "keyword", unit: "keyword", name: NAME.keyword, width: WIDTH.keyword }];
    for (const u of units) {
      if (u === "sections") for (let i = 0; i < sectionCount; i++) out.push({ key: `s${i}`, unit: u, name: `Section ${i + 1}`, width: WIDTH.section, section: i });
      else if (u.startsWith("col:")) {
        const column = columns.find((c) => `col:${c.id}` === u);
        if (column) out.push({ key: u, unit: u, name: column.name, width: WIDTH.col, column });
      } else out.push({ key: u, unit: u, name: NAME[u], width: WIDTH[u] });
    }
    return out.map((c, i) => ({ ...c, letter: letter(i) }));
  }, [units, sectionCount, columns]);

  function moveUnit(from: Unit, to: Unit) {
    if (from === to) return;
    const next = units.filter((u) => u !== from);
    next.splice(next.indexOf(to), 0, from);
    setOrder(next);
    try {
      localStorage.setItem(LAYOUT(site.id), JSON.stringify(next));
    } catch {
      // The layout stays for this visit.
    }
  }

  // ─────────────── writing ───────────────
  const patchRow = useCallback(
    (itemId: string, fn: (r: GridRow) => GridRow) => setData((d) => (d ? { ...d, rows: d.rows.map((r) => (r.topic.id === itemId ? fn(r) : r)) } : d)),
    [setData],
  );
  const rowOf = (itemId: string) => dataRef.current?.rows.find((r) => r.topic.id === itemId) ?? null;

  /** Change an article's text from its latest saved state, and save it. */
  async function changeDoc(itemId: string, fn: (content: PmNode) => PmNode, meta?: (m: GridDoc["meta"]) => GridDoc["meta"]) {
    const r = rowOf(itemId);
    if (!r?.doc) return;
    const content = fn(r.doc.content);
    const next = { ...r.doc, content, words: wordsOf(content), meta: meta ? meta(r.doc.meta) : r.doc.meta };
    patchRow(itemId, (x) => ({ ...x, doc: next }));
    await saveGridDoc(sb, next.id, { content, words: next.words });
    if (meta) await saveGridMeta(sb, next.id, next.meta);
  }
  const run = (p: Promise<unknown>) => p.catch((e) => setError(e instanceof Error ? e.message : String(e)));

  async function saveCellEdit(itemId: string, part: Part, s: CellSave) {
    const r = rowOf(itemId);
    if (!r?.doc) return;
    const before = lockKey(part, r.doc.content);
    const content = replacePart(r.doc.content, part, s.nodes);
    const after = lockKey(part, content);
    await changeDoc(
      itemId,
      () => content,
      (m) => {
        const locked = (m.locked ?? []).filter((k) => k !== before);
        if (s.lock || (m.locked ?? []).includes(before)) locked.push(after);
        return { ...m, locked: [...new Set(locked.filter(Boolean))] };
      },
    );
  }
  async function setLock(itemId: string, part: Part, on: boolean) {
    const r = rowOf(itemId);
    if (!r?.doc) return;
    const key = lockKey(part, r.doc.content);
    const m = r.doc.meta;
    const locked = on ? [...new Set([...(m.locked ?? []), key])] : (m.locked ?? []).filter((k) => k !== key);
    patchRow(itemId, (x) => (x.doc ? { ...x, doc: { ...x.doc, meta: { ...m, locked } } } : x));
    await saveGridMeta(sb, r.doc.id, { ...m, locked });
  }

  async function saveField(itemId: string, key: string, value: string) {
    const r = rowOf(itemId);
    if (!r) return;
    if (key.startsWith("col:")) {
      const column_id = key.slice(4);
      patchRow(itemId, (x) => ({ ...x, cells: { ...x.cells, [column_id]: { value, status: "ready", error: null } } }));
      await saveCell(sb, { workspace_id: auth.workspaceId, column_id, item_id: itemId, value });
      return;
    }
    if (!r.doc) return;
    if (key === "h1") {
      patchRow(itemId, (x) => (x.doc ? { ...x, doc: { ...x.doc, title: value } } : x));
      await saveGridDoc(sb, r.doc.id, { title: value || "Untitled" });
      return;
    }
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
  const askGenerate = (ids: string[]) => (ids.some((id) => rowOf(id)?.doc) ? setRegen(ids) : void generate(ids));

  /** A row's value for a column as text, for AI columns that read it. */
  function textOf(r: GridRow, c: Shown): string {
    if (c.unit === "keyword") return r.topic.keyword;
    if (c.unit === "status") return stateOf(r).label;
    if (c.unit === "title") return r.doc?.meta.metaTitle || r.plan?.title || "";
    if (c.unit === "description") return r.doc?.meta.description || r.plan?.description || "";
    if (c.unit === "slug") return r.doc?.meta.slug || r.plan?.slug || "";
    if (c.unit === "h1") return r.doc?.title || r.plan?.h1 || "";
    if (c.unit === "intro") return r.doc ? docToText({ type: "doc", content: partNodes(r.doc.content, "intro") }) : "";
    if (c.section !== undefined) return r.doc ? docToText({ type: "doc", content: partNodes(r.doc.content, c.section) }) : (r.plan?.outline[c.section] ?? "");
    if (c.column) return r.cells[c.column.id]?.value ?? "";
    return "";
  }
  async function runColumn(column: GridColumn, ids: string[]) {
    for (const id of ids) {
      const r = rowOf(id);
      if (!r) continue;
      const prompt = fillPrompt(column.prompt, shown.filter((c) => c.column?.id !== column.id).map((c) => ({ letter: c.letter, name: c.name, value: textOf(r, c) })));
      patchRow(id, (x) => ({ ...x, cells: { ...x.cells, [column.id]: { value: x.cells[column.id]?.value ?? "", status: "generating", error: null } } }));
      try {
        const out = await post<{ value: string }>(auth, "/api/agentic-writer/grid", { action: "column", columnId: column.id, itemId: id, prompt });
        patchRow(id, (x) => ({ ...x, cells: { ...x.cells, [column.id]: { value: out.value, status: "ready", error: null } } }));
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        patchRow(id, (x) => ({ ...x, cells: { ...x.cells, [column.id]: { value: x.cells[column.id]?.value ?? "", status: "failed", error: message } } }));
      }
    }
  }

  // ─────────────── drawing ───────────────
  if (!data) return <Thinking text="Opening the Library..." />;
  const allOn = rows.length > 0 && rows.every((r) => selected.has(r.topic.id));
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  const panelRow = panel ? rows.find((r) => r.topic.id === panel.itemId) : null;
  const editRow = edit ? rows.find((r) => r.topic.id === edit.itemId) : null;
  const left = (i: number) => (i === 0 ? 36 : undefined);

  function cell(r: GridRow, c: Shown): React.ReactNode {
    const doc = r.doc;
    const muted = (t: string) => (t ? <span className="line-clamp-2 text-muted">{t}</span> : <span className="text-faint">–</span>);
    const editable = (key: string, value: string, fallback: string) =>
      canEdit && doc ? (
        <button type="button" className="flex h-full w-full items-start text-left" onClick={(e) => setEdit({ itemId: r.topic.id, key, anchor: e.currentTarget.getBoundingClientRect() })}>
          {value ? <span className="line-clamp-2 text-ink">{value}</span> : muted(fallback)}
        </button>
      ) : value ? (
        <span className="line-clamp-2 text-ink">{value}</span>
      ) : (
        muted(fallback)
      );
    switch (c.unit) {
      case "keyword":
        return (
          <span className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate font-medium text-ink">{r.topic.keyword}</span>
            {(r.topic.draft && doc) || r.topic.brief?.status === "ready" || r.topic.brief?.status === "approved" ? (
              <button
                type="button"
                className="aw-iconbtn shrink-0"
                title={doc ? "Open article" : "Open brief"}
                aria-label={doc ? "Open article" : "Open brief"}
                onClick={() => onOpen(r.topic.draft && doc ? { kind: "draft", id: r.topic.draft.id } : { kind: "brief", id: r.topic.brief!.id })}
              >
                <svg className="aw-icon" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M14 4h6v6M20 4l-8 8M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
                </svg>
              </button>
            ) : null}
          </span>
        );
      case "status": {
        const s = stateOf(r);
        return (
          <span className="flex items-center gap-2">
            <span className={`tw-tag ${s.tone}`} title={s.error}>
              {s.label}
            </span>
            {canEdit && !making(r) ? (
              <button type="button" className="aw-iconbtn ml-auto shrink-0" disabled={busy.has(r.topic.id)} title={doc ? "Regenerate" : "Generate"} aria-label={doc ? "Regenerate" : "Generate"} onClick={() => askGenerate([r.topic.id])}>
                <svg className="aw-icon" viewBox="0 0 24 24" aria-hidden="true">
                  <path d={doc ? "M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7" : "M7 5v14l11-7z"} />
                </svg>
              </button>
            ) : null}
          </span>
        );
      }
      case "title":
        return editable("metaTitle", doc?.meta.metaTitle ?? "", r.plan?.title ?? "");
      case "description":
        return editable("description", doc?.meta.description ?? "", r.plan?.description ?? "");
      case "slug":
        return editable("slug", doc?.meta.slug ?? "", r.plan?.slug ?? "");
      case "h1":
        return editable("h1", doc?.title ?? "", r.plan?.h1 ?? "");
      case "intro":
        return doc ? <Face nodes={partNodes(doc.content, "intro")} locked={(doc.meta.locked ?? []).includes("intro")} onOpen={() => setPanel({ itemId: r.topic.id, part: "intro" })} /> : muted("");
      case "sections": {
        const i = c.section!;
        if (!doc) return r.plan?.outline[i] ? <span className="line-clamp-2 text-muted">{r.plan.outline[i]}</span> : muted("");
        const count = splitDoc(doc.content).sections.length;
        if (i < count) {
          const nodes = partNodes(doc.content, i);
          return (
            <Face
              nodes={nodes}
              locked={(doc.meta.locked ?? []).includes(lockKey(i, doc.content))}
              onOpen={() => setPanel({ itemId: r.topic.id, part: i })}
              drag={
                canEdit
                  ? {
                      id: `${r.topic.id}:${i}`,
                      onDrop: (from) => {
                        const [row, at] = from.split(":");
                        if (row === r.topic.id && Number(at) !== i) void run(changeDoc(r.topic.id, (x) => moveSection(x, Number(at), i)));
                      },
                    }
                  : undefined
              }
            />
          );
        }
        return canEdit && i === count ? (
          <button
            type="button"
            className="aw-text-link text-[12px]"
            onClick={() =>
              void run(
                changeDoc(r.topic.id, (x) => addSection(x, "New section")).then(() => setPanel({ itemId: r.topic.id, part: count })),
              )
            }
          >
            + Section
          </button>
        ) : (
          muted("")
        );
      }
      default: {
        const col = c.column!;
        const v = r.cells[col.id];
        if (v?.status === "generating") return <span className="text-muted">Writing...</span>;
        return (
          <span className="flex h-full items-start gap-1">
            <button
              type="button"
              className="flex h-full min-w-0 flex-1 items-start text-left"
              disabled={!canEdit}
              onClick={(e) => setEdit({ itemId: r.topic.id, key: `col:${col.id}`, anchor: e.currentTarget.getBoundingClientRect() })}
            >
              {v?.status === "failed" ? <span className="line-clamp-2 text-neg">{v.error}</span> : v?.value ? <span className="line-clamp-3 text-ink">{v.value}</span> : muted("")}
            </button>
            {canEdit && col.kind === "ai" ? (
              <button type="button" className="aw-iconbtn shrink-0" title="Run" aria-label="Run" onClick={() => void runColumn(col, [r.topic.id])}>
                <svg className="aw-icon" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M7 5v14l11-7z" />
                </svg>
              </button>
            ) : null}
          </span>
        );
      }
    }
  }

  const picked = [...selected];
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="aw-h2 mr-auto">Library</h1>
        {picked.length ? <span className="text-[12px] text-muted">{picked.length} selected</span> : null}
        {canEdit ? (
          <>
            <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm" disabled={Boolean(data.columnsError)} onClick={() => setColForm("new")}>
              + Column
            </button>
            <button type="button" className="aw-btn aw-btn--primary aw-btn--sm" disabled={!picked.length || picked.every((id) => busy.has(id))} onClick={() => askGenerate(picked)}>
              Generate
            </button>
          </>
        ) : null}
      </div>
      {error ? <p className="aw-error">{error}</p> : null}
      {data.columnsError ? <p className="aw-error">{data.columnsError}</p> : null}

      <div className="aw-frame overflow-auto" style={{ maxHeight: "calc(100vh - 200px)" }}>
        <table className="border-separate border-spacing-0 text-[13px]" style={{ tableLayout: "fixed", width: 36 + shown.reduce((n, c) => n + c.width, 0) }}>
          <colgroup>
            <col style={{ width: 36 }} />
            {shown.map((c) => (
              <col key={c.key} style={{ width: c.width }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              <th className="sticky top-0 left-0 z-30 h-9 border-r border-b border-rule bg-[var(--bg-secondary)] px-2">
                <input type="checkbox" aria-label="Select all" checked={allOn} onChange={() => setSelected(allOn ? new Set() : new Set(rows.map((r) => r.topic.id)))} />
              </th>
              {shown.map((c, i) => {
                const movable = c.unit !== "keyword" && (c.unit !== "sections" || c.section === 0);
                return (
                  <th
                    key={c.key}
                    className={`sticky top-0 h-9 border-r border-b border-rule bg-[var(--bg-secondary)] px-2 text-left font-medium text-muted ${i === 0 ? "z-30" : "z-20"}`}
                    style={{ left: left(i) }}
                    draggable={movable}
                    onDragStart={(e) => e.dataTransfer.setData("text/aw-col", c.unit)}
                    onDragOver={(e) => c.unit !== "keyword" && e.dataTransfer.types.includes("text/aw-col") && e.preventDefault()}
                    onDrop={(e) => {
                      const from = e.dataTransfer.getData("text/aw-col") as Unit;
                      if (from && c.unit !== "keyword") moveUnit(from, c.unit as Unit);
                    }}
                  >
                    <span className="flex items-center gap-2">
                      <span className="tw-tag shrink-0">{c.letter}</span>
                      {c.column && canEdit ? (
                        <button type="button" className="min-w-0 truncate text-left hover:text-ink" onClick={(e) => setColMenu({ column: c.column!, anchor: e.currentTarget.getBoundingClientRect() })}>
                          {c.name}
                          {c.column.kind === "ai" ? " · AI" : ""}
                        </button>
                      ) : (
                        <span className="truncate">{c.name}</span>
                      )}
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.topic.id} className="group">
                <td className="sticky left-0 z-10 border-r border-b border-rule bg-white px-2 align-top group-hover:bg-[var(--bg-secondary)]" onClick={stop}>
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
                {shown.map((c, i) => (
                  <td key={c.key} className={`border-r border-b border-rule bg-white px-2 py-1.5 align-top group-hover:bg-[var(--bg-secondary)] ${i === 0 ? "sticky z-10" : ""}`} style={{ left: left(i), height: 76 }}>
                    <div className="h-[63px] overflow-hidden">{cell(r, c)}</div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {panel && panelRow?.doc ? (
        <CellPanel
          key={`${panel.itemId}:${panel.part}:${panelRow.doc.id}`}
          sb={sb}
          auth={auth}
          itemId={panel.itemId}
          docId={panelRow.doc.id}
          part={panel.part}
          label={panel.part === "intro" ? `${shown.find((c) => c.unit === "intro")?.letter ?? ""} · Intro` : `${shown.find((c) => c.section === panel.part)?.letter ?? ""} · Section ${Number(panel.part) + 1}`}
          nodes={partNodes(panelRow.doc.content, panel.part)}
          locked={(panelRow.doc.meta.locked ?? []).includes(lockKey(panel.part, panelRow.doc.content))}
          canEdit={canEdit}
          onSave={(s) => saveCellEdit(panel.itemId, panel.part, s)}
          onLock={(on) => void run(setLock(panel.itemId, panel.part, on))}
          onAddAfter={
            panel.part === "intro"
              ? null
              : () => {
                  const at = Number(panel.part);
                  void run(changeDoc(panel.itemId, (x) => addSection(x, "New section", at)).then(() => setPanel({ itemId: panel.itemId, part: at + 1 })));
                }
          }
          onDelete={
            panel.part === "intro"
              ? null
              : () => {
                  const at = Number(panel.part);
                  setPanel(null);
                  void run(changeDoc(panel.itemId, (x) => removeSection(x, at)));
                }
          }
          onClose={() => setPanel(null)}
        />
      ) : null}

      {edit && editRow ? (
        <EditPop
          anchor={edit.anchor}
          label={shown.find((c) => c.key === (edit.key === "metaTitle" ? "title" : edit.key))?.name ?? ""}
          value={edit.key.startsWith("col:") ? (editRow.cells[edit.key.slice(4)]?.value ?? "") : edit.key === "h1" ? (editRow.doc?.title ?? "") : String((editRow.doc?.meta as Record<string, unknown> | undefined)?.[edit.key] ?? "")}
          long={edit.key === "description" || edit.key.startsWith("col:")}
          onSave={(v) => {
            void run(saveField(edit.itemId, edit.key, v));
            setEdit(null);
          }}
          onClose={() => setEdit(null)}
        />
      ) : null}

      {colMenu ? (
        <Pop anchor={colMenu.anchor} onClose={() => setColMenu(null)} width={200} label="Column">
          <div className="aw-pop__list" role="menu">
            <button type="button" role="menuitem" className="aw-pop__opt" onClick={() => (setColForm(colMenu.column), setColMenu(null))}>
              Edit
            </button>
            {colMenu.column.kind === "ai" ? (
              <button
                type="button"
                role="menuitem"
                className="aw-pop__opt"
                onClick={() => {
                  const col = colMenu.column;
                  setColMenu(null);
                  void runColumn(col, (picked.length ? picked : rows.map((r) => r.topic.id)).filter((id) => !rowOf(id)?.cells[col.id]?.value));
                }}
              >
                Run empty cells
              </button>
            ) : null}
            <button type="button" role="menuitem" className="aw-pop__opt text-neg" onClick={() => (setRemovingCol(colMenu.column), setColMenu(null))}>
              Delete
            </button>
          </div>
        </Pop>
      ) : null}
      {colForm ? (
        <ColumnForm
          column={colForm === "new" ? null : colForm}
          letters={shown.map((c) => c.letter).join(", ")}
          onSave={async (c) => {
            if (colForm === "new") await addColumn(sb, { workspace_id: auth.workspaceId, site_id: site.id, ...c, position: columns.length });
            else await updateColumn(sb, colForm.id, c);
            setColForm(null);
            await load();
          }}
          onClose={() => setColForm(null)}
        />
      ) : null}
      {removingCol ? (
        <Confirm
          title={`Delete ${removingCol.name}?`}
          text="The column and every value in it are deleted."
          action="Delete"
          onConfirm={() => {
            const id = removingCol.id;
            setRemovingCol(null);
            void run(deleteColumn(sb, id).then(load));
          }}
          onClose={() => setRemovingCol(null)}
        />
      ) : null}
      {regen ? (
        <Confirm
          title={regen.length > 1 ? `Regenerate ${regen.length} articles?` : "Regenerate this article?"}
          text="Locked cells stay as they are. The rest is written again, and the old text is saved as a version."
          action="Regenerate"
          onConfirm={() => {
            const ids = regen;
            setRegen(null);
            void generate(ids);
          }}
          onClose={() => setRegen(null)}
        />
      ) : null}
    </div>
  );
}

/** A section's face in the grid: its H2, the start of its text, and what's inside. Drag it along its row. */
function Face({ nodes, locked, onOpen, drag }: { nodes: PmNode[]; locked: boolean; onOpen: () => void; drag?: { id: string; onDrop: (from: string) => void } }) {
  const s = summarize(nodes);
  const [over, setOver] = useState(false);
  return (
    <button
      type="button"
      onClick={onOpen}
      draggable={Boolean(drag)}
      onDragStart={(e) => drag && e.dataTransfer.setData("text/aw-section", drag.id)}
      onDragOver={(e) => {
        if (!drag || !e.dataTransfer.types.includes("text/aw-section")) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        setOver(false);
        const from = e.dataTransfer.getData("text/aw-section");
        if (drag && from) drag.onDrop(from);
      }}
      className={`flex h-full w-full flex-col items-start gap-0.5 text-left ${drag ? "cursor-grab active:cursor-grabbing" : ""} ${over ? "outline-2 outline-[var(--border-blue)]" : ""}`}
    >
      {s.title ? <span className="w-full truncate font-medium text-ink">{s.title}</span> : null}
      <span className={`w-full text-muted ${s.title ? "line-clamp-1" : "line-clamp-2"}`}>{s.preview || "–"}</span>
      <span className="mt-auto flex flex-wrap gap-1">
        {locked ? <span className="tw-tag">Locked</span> : null}
        {s.has.map((h) => (
          <span key={h} className="tw-tag">
            {h === "html" ? "HTML" : h[0].toUpperCase() + h.slice(1)}
          </span>
        ))}
        <span className="aw-num text-[11px] text-faint">{s.words} words</span>
      </span>
    </button>
  );
}

/** Edit one short value in place. Enter saves; Shift+Enter makes a new line in long values. */
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
          <textarea autoFocus value={v} rows={5} onChange={(e) => setV(e.target.value)} onKeyDown={keys} aria-label={label} className="aw-input min-h-28 py-2" />
        ) : (
          <input autoFocus value={v} onChange={(e) => setV(e.target.value)} onKeyDown={keys} aria-label={label} className="aw-input" />
        )}
        <div className="flex items-center justify-between">
          {label === "Meta title" || label === "Meta description" ? <span className="aw-num text-[11px] text-faint">{v.length}</span> : <span />}
          <button type="button" className="aw-btn aw-btn--primary aw-btn--sm" onClick={() => onSave(v.trim())}>
            Save
          </button>
        </div>
      </div>
    </Pop>
  );
}

/** Add or change a column: a text column, or an AI column with a prompt that reads other columns. */
function ColumnForm({ column, letters, onSave, onClose }: { column: GridColumn | null; letters: string; onSave: (c: { name: string; kind: "text" | "ai"; prompt: string }) => Promise<void>; onClose: () => void }) {
  const [name, setName] = useState(column?.name ?? "");
  const [kind, setKind] = useState<"text" | "ai">(column?.kind ?? "ai");
  const [prompt, setPrompt] = useState(column?.prompt ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <Modal title={column ? "Edit column" : "Add column"} onClose={onClose} width="max-w-lg">
      <form
        className="flex flex-col gap-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!name.trim()) return;
          setBusy(true);
          setError("");
          try {
            await onSave({ name: name.trim(), kind, prompt: kind === "ai" ? prompt.trim() : "" });
          } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
            setBusy(false);
          }
        }}
      >
        <label className="flex flex-col gap-1.5 text-[13px] text-body">
          Name
          <input autoFocus value={name} maxLength={80} onChange={(e) => setName(e.target.value)} className="aw-input" placeholder="LinkedIn post" />
        </label>
        <Seg
          label="Type"
          value={kind}
          onChange={setKind}
          options={[
            { id: "ai", label: "AI" },
            { id: "text", label: "Text" },
          ]}
        />
        {kind === "ai" ? (
          <label className="flex flex-col gap-1.5 text-[13px] text-body">
            Prompt
            <textarea value={prompt} rows={5} maxLength={4000} onChange={(e) => setPrompt(e.target.value)} className="aw-input min-h-28 py-2" placeholder="Write a LinkedIn post from {{F}} and {{H}}" />
            <span className="text-[12px] text-faint">{letters}</span>
          </label>
        ) : null}
        {error ? <p className="aw-error">{error}</p> : null}
        <div className="flex justify-end gap-2">
          <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="aw-btn aw-btn--primary aw-btn--sm" disabled={busy || !name.trim() || (kind === "ai" && !prompt.trim())}>
            {busy ? "Saving..." : "Save"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

