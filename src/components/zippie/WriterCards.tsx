"use client";

// The Writer's cards under Zippie's replies (zippieWriter.ts): the top picks from the Calendar with Write buttons;
// one piece that keeps updating while the writer works (researching, the outline from real searches with its planned
// blocks, which can be edited right in the card, writing, then the finished draft); Publish, which opens the same
// Publish panel as Drafts; and changes to an outline or a draft's text that apply only when the person presses Apply.

import { useCallback, useEffect, useState } from "react";
import type { OutlineSection, PieceStatus, Pick } from "@/lib/contentPicks";
import { getDoc, getGuideline, saveDoc } from "@/lib/db";
import { docToHtml } from "@/lib/docHtml";
import { applyEdits, wordsIn, type DraftEdit } from "@/lib/draftEdits";
import { currentSupabase } from "@/lib/supa";
import type { RunAuth } from "@/lib/runner";
import { PublishPanel } from "../research/PublishPanel";
import { post } from "../research/shared";
import { brandTables } from "../research/Writer";
import { exportClean } from "../research/writerNodes";
import { I, Icon, msgOf, type SendFn, type useApi } from "./Cards";

const WRITE_ARTICLE = "system:write-article";
const WRITE_OUTLINE = "system:write-outline";

/** Open an app page in place, the way the sidebar does. A piece opens on its own page in Drafts (?item=). */
function goTo(path: string) {
  window.history.pushState(null, "", path.includes("?") ? path : `${path}${window.location.search}`);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

const compact = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, "")}K` : String(n));

/** The best Calendar pieces to write next, each with its reason and a Write button. */
export function PicksCard({ picks, canEdit, onSend }: { picks: Pick[]; canEdit: boolean; onSend: SendFn }) {
  return (
    <ol className="flex flex-col overflow-hidden rounded-aw-lg border border-rule bg-white" aria-label="Top picks">
      {picks.map((p, i) => (
        <li key={p.item_id} className="flex items-center gap-3.5 px-4 py-3.5 not-first:border-t not-first:border-rule-faint">
          <span className={`aw-num flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold ${i ? "bg-surface-2 text-body" : "bg-brand text-white"}`}>{i + 1}</span>
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-[15px] font-medium text-ink [overflow-wrap:anywhere]">{p.keyword}</span>
            <span className="text-[13px] text-muted">{p.why}</span>
          </span>
          {p.volume ? <span className="aw-num hidden shrink-0 text-[13px] text-muted sm:inline">{p.volume.toLocaleString("en-US")} / mo</span> : null}
          {canEdit ? (
            <span className="flex shrink-0 gap-1.5">
              <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm" onClick={() => onSend(`Outline “${p.keyword}”`, WRITE_OUTLINE)}>
                Outline
              </button>
              <button type="button" className={`aw-btn aw-btn--sm ${i ? "aw-btn--secondary" : "aw-btn--primary"}`} onClick={() => onSend(`Write “${p.keyword}”`, WRITE_ARTICLE)}>
                Write
              </button>
            </span>
          ) : null}
        </li>
      ))}
    </ol>
  );
}

/** One piece, from research to the finished draft. Asks again every 5 seconds while the writer works. */
export function PieceCard({ itemId, keyword, api, auth, canEdit, onSend, publish = false }: { itemId: string; keyword: string; api: ReturnType<typeof useApi>; auth: RunAuth; canEdit: boolean; onSend: SendFn; publish?: boolean }) {
  const [piece, setPiece] = useState<PieceStatus | null>(null);
  const pub = usePublish(auth);
  const [error, setError] = useState("");
  // A piece just started may not have its outline row yet: keep asking for the first two minutes too.
  const [fresh, setFresh] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setFresh(false), 120_000);
    return () => clearTimeout(t);
  }, []);
  const load = useCallback(async () => {
    try {
      setPiece((await api<{ piece: PieceStatus }>("/api/ask", { action: "writer_piece", itemId })).piece);
      setError("");
    } catch (e) {
      setError(msgOf(e));
    }
  }, [api, itemId]);
  const busy = !piece || piece.outline?.busy || piece.draft?.busy || (!piece.outline && !piece.draft && fresh);
  useEffect(() => {
    // Reading the piece when the card shows, then while it's being written, is the point of this effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [busy, load]);

  const o = piece?.outline ?? null;
  const d = piece?.draft ?? null;
  const title = o?.title || keyword;
  const frame = "flex flex-col overflow-hidden rounded-aw-lg border border-rule bg-white";
  const working = (label: string, note: string) => (
    <div className={`${frame} gap-2 px-4 py-4`} role="status" aria-live="polite">
      <span className="flex items-center gap-2.5 text-[15px] font-medium text-ink">
        <span className="aw-spin" aria-hidden="true" />
        {label}
      </span>
      <span className="pl-7 text-[13px] text-muted">{note}</span>
    </div>
  );
  const failed = (what: string, why: string | null, again: () => void) => (
    <div className={`${frame} gap-3 px-4 py-4`}>
      <span className="text-[14px] text-ink">
        The {what} for <strong>{keyword}</strong> stopped{why ? `: ${why}` : "."}
      </span>
      {canEdit ? (
        <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm self-start" onClick={again}>
          Try again
        </button>
      ) : null}
    </div>
  );

  if (error && !piece) return <p className="aw-error">{error}</p>;
  if (d?.status === "ready")
    return (
      <div className={`${frame} gap-3 px-4 py-4`}>
        <span className="flex items-start gap-3">
          <span className="zp-card__icon">
            <Icon d={I.doc} />
          </span>
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="text-[15px] font-semibold text-ink [overflow-wrap:anywhere]">{title}</span>
            <span className="text-[13px] text-muted">
              {publish ? "Ready to publish" : "Draft ready"}
              {d.words ? ` · ${d.words.toLocaleString("en-US")} words` : ""} · in Drafts
            </span>
          </span>
        </span>
        {publish ? <span className="pl-[42px] text-[13px] text-body">Pick the site, draft or live, and the date. Nothing goes out until you press Publish there.</span> : null}
        <span className="flex gap-2 pl-[42px]">
          <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm" onClick={() => goTo(`/drafts?item=${itemId}`)}>
            Open
          </button>
          {canEdit && d.doc_id ? (
            <button type="button" className="aw-btn aw-btn--primary aw-btn--sm" disabled={pub.busy} onClick={() => piece && d.doc_id && void pub.open(d.doc_id, piece.site_id, piece.brand_id)}>
              {pub.busy ? "Opening..." : "Publish"}
            </button>
          ) : null}
        </span>
        {pub.error ? <p className="aw-error pl-[42px]">{pub.error}</p> : null}
        {pub.panel}
      </div>
    );
  if (d?.busy) return working(`Writing “${title}”`, `${d.status}. Then Zippie checks every fact against the sources and builds the blocks.`);
  if (d && d.status === "failed") return failed("draft", d.error, () => onSend(`Write the draft for “${keyword}” again`, WRITE_ARTICLE));
  if (!o || o.busy) return working(o ? `${o.status} “${keyword}”` : `Researching “${keyword}”`, "Reading Google's top pages, AI answers and what people search. The outline shows here in a few minutes.");
  if (o.status === "failed") return failed("outline", o.error, () => onSend(`Outline “${keyword}” again`, WRITE_OUTLINE));

  return <OutlineCard key={o.brief_id} outline={o} title={title} itemId={itemId} keyword={keyword} auth={auth} canEdit={canEdit} onSend={onSend} onSaved={load} />;
}

type Outline = NonNullable<PieceStatus["outline"]>;
/** A section while editing: the old section it keeps (its index) or none, its heading, subheadings and blocks. */
type Draft = { from: number | null; h2: string; h3: string[]; blocks: { id: string; label: string; off: boolean }[]; volume: number | null };

const toDraft = (o: Outline): Draft[] => o.headings.map((h, i) => ({ from: i, h2: h.h2, h3: [...h.subheadings], blocks: h.blocks.map((b) => ({ ...b, off: false })), volume: h.searches_a_month }));

/**
 * The outline under Zippie's reply. Edit turns it into the outline itself: rename a heading in place, move or remove a
 * section, add one, change its subheadings and turn its planned blocks off. Save sends it through the outline's own
 * edit action (editBrief's sections), so the outline screen in Drafts shows the same thing.
 */
function OutlineCard({ outline: o, title, itemId, keyword, auth, canEdit, onSend, onSaved }: { outline: Outline; title: string; itemId: string; keyword: string; auth: RunAuth; canEdit: boolean; onSend: SendFn; onSaved: () => Promise<void> }) {
  const [edit, setEdit] = useState<Draft[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (i: number, patch: Partial<Draft>) => setEdit((l) => l && l.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const move = (i: number, by: number) =>
    setEdit((l) => {
      if (!l || i + by < 0 || i + by >= l.length) return l;
      const next = [...l];
      [next[i], next[i + by]] = [next[i + by], next[i]];
      return next;
    });
  async function save() {
    if (!edit) return;
    setBusy(true);
    setError("");
    try {
      const sections = edit.filter((s) => s.h2.trim()).map((s) => ({ from: s.from, h2: s.h2.trim(), h3: s.h3.map((h) => h.trim()).filter(Boolean) }));
      if (!sections.length) throw new Error("Keep at least one section.");
      const removeModules = edit.flatMap((s) => s.blocks.filter((b) => b.off).map((b) => b.id));
      await post(auth, "/api/agentic-writer", { action: "edit", briefId: o.brief_id, patch: { sections, removeModules, cards: [] } });
      await onSaved();
      setEdit(null);
    } catch (e) {
      setError(msgOf(e));
    } finally {
      setBusy(false);
    }
  }

  const rowsShown: Draft[] = edit ?? toDraft(o);
  return (
    <div className="flex flex-col overflow-hidden rounded-aw-lg border border-rule bg-white">
      <div className="flex items-start gap-3 border-b border-rule-faint px-4 py-4">
        <span className="zp-card__icon">
          <Icon d={I.doc} />
        </span>
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="text-[15px] font-semibold text-ink [overflow-wrap:anywhere]">{title}</span>
          <span className="text-[13px] text-muted">
            {edit ? "Editing the outline" : `Outline · ${o.headings.length} sections${o.words ? ` · about ${o.words.toLocaleString("en-US")} words` : ""}`}
          </span>
        </span>
      </div>
      <ol className="flex flex-col py-1.5">
        {rowsShown.map((s, i) => (
          <li key={`${s.from ?? "new"}:${i}`} className={`flex gap-3.5 px-4 ${edit ? "py-3 not-first:border-t not-first:border-rule-faint" : "py-2.5"}`}>
            <span className="aw-num w-4 shrink-0 pt-0.5 text-[14px] text-muted">{i + 1}</span>
            <span className="flex min-w-0 flex-1 flex-col gap-1.5">
              {edit ? (
                <span className="flex items-center gap-1">
                  <input
                    aria-label={`Heading ${i + 1}`}
                    value={s.h2}
                    placeholder="Heading people search for"
                    onChange={(e) => set(i, { h2: e.target.value })}
                    className="tw-bare zp-outline__input min-w-0 flex-1 text-[15px] font-medium"
                  />
                  <button type="button" className="zp-icon-btn zp-icon-btn--sm" aria-label="Move up" title="Move up" disabled={i === 0} onClick={() => move(i, -1)}>
                    <Icon d={I.arrowUp} size={14} />
                  </button>
                  <button type="button" className="zp-icon-btn zp-icon-btn--sm" aria-label="Move down" title="Move down" disabled={i === rowsShown.length - 1} onClick={() => move(i, 1)}>
                    <Icon d={I.arrowDown} size={14} />
                  </button>
                  <button type="button" className="zp-icon-btn zp-icon-btn--sm" aria-label="Remove section" title="Remove section" onClick={() => setEdit((l) => l && l.filter((_, j) => j !== i))}>
                    <Icon d={I.x} size={14} />
                  </button>
                </span>
              ) : (
                <span className="flex items-baseline gap-3">
                  <span className="flex-1 text-[15px] font-medium text-ink [overflow-wrap:anywhere]">{s.h2}</span>
                  {s.volume ? <span className="aw-num shrink-0 text-[13px] text-muted">{compact(s.volume)} / mo</span> : null}
                </span>
              )}
              {edit ? (
                <span className="flex flex-col gap-1 pl-2">
                  {s.h3.map((h, k) => (
                    <span key={k} className="flex items-center gap-1">
                      <input
                        aria-label={`Subheading ${k + 1} of section ${i + 1}`}
                        value={h}
                        placeholder="Subheading"
                        onChange={(e) => set(i, { h3: s.h3.map((x, j) => (j === k ? e.target.value : x)) })}
                        className="tw-bare zp-outline__input min-w-0 flex-1 text-[13px] text-body"
                      />
                      <button type="button" className="zp-icon-btn zp-icon-btn--sm" aria-label="Remove subheading" title="Remove subheading" onClick={() => set(i, { h3: s.h3.filter((_, j) => j !== k) })}>
                        <Icon d={I.x} size={12} />
                      </button>
                    </span>
                  ))}
                  <button type="button" className="aw-text-link self-start text-[12px]" onClick={() => set(i, { h3: [...s.h3, ""] })}>
                    + Subheading
                  </button>
                </span>
              ) : s.h3.length ? (
                <span className="text-[13px] text-muted">{s.h3.join(" · ")}</span>
              ) : null}
              {s.blocks.map((b) => (
                <span key={b.id} className={`inline-flex items-center gap-2 self-start rounded-aw bg-surface-2 px-2.5 py-1.5 text-[13px] ${b.off ? "text-muted line-through" : "text-body"}`}>
                  <Icon d={I.box} size={14} />
                  {b.label}
                  {edit ? (
                    <button type="button" className="aw-text-link text-[12px] no-underline" onClick={() => set(i, { blocks: s.blocks.map((x) => (x.id === b.id ? { ...x, off: !x.off } : x)) })}>
                      {b.off ? "Keep" : "Turn off"}
                    </button>
                  ) : null}
                </span>
              ))}
            </span>
          </li>
        ))}
      </ol>
      {edit ? (
        <button type="button" className="aw-text-link mx-4 mb-3 self-start text-[13px]" onClick={() => setEdit((l) => l && [...l, { from: null, h2: "", h3: [], blocks: [], volume: null }])}>
          + Add section
        </button>
      ) : null}
      {error ? <p className="aw-error mx-4 mb-3">{error}</p> : null}
      <div className="flex flex-wrap items-center gap-2 border-t border-rule-faint bg-surface-2 px-4 py-3">
        {edit ? (
          <>
            <button type="button" className="aw-btn aw-btn--primary aw-btn--sm" disabled={busy} onClick={() => void save()}>
              {busy ? "Saving..." : "Save outline"}
            </button>
            <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm" disabled={busy} onClick={() => setEdit(null)}>
              Cancel
            </button>
            <span className="ml-auto text-[12px] text-muted">Removed blocks can&apos;t be added back</span>
          </>
        ) : (
          <>
            {canEdit ? (
              <button type="button" className="aw-btn aw-btn--primary aw-btn--sm" onClick={() => onSend(`Write the draft for “${keyword}”`, WRITE_ARTICLE)}>
                Write draft
              </button>
            ) : null}
            {canEdit ? (
              <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm" onClick={() => setEdit(toDraft(o))}>
                Edit outline
              </button>
            ) : null}
            <button type="button" className="aw-btn aw-btn--ghost aw-btn--sm" onClick={() => goTo(`/drafts?item=${itemId}`)}>
              Open
            </button>
            <span className="ml-auto text-[12px] text-muted">The draft uses one of this month&apos;s drafts</span>
          </>
        )}
      </div>
    </div>
  );
}

/** An outline change asked for in chat: the headings before and after. Apply saves it; nothing changes before. */
export function OutlineEditCard({ briefId, before, sections, why, auth, canEdit }: { briefId: string; before: string[]; sections: OutlineSection[]; why?: string; auth: RunAuth; canEdit: boolean }) {
  const [state, setState] = useState<"waiting" | "busy" | "done" | "dismissed">("waiting");
  const [error, setError] = useState("");
  const kept = new Set(sections.map((s) => s.from).filter((x): x is number => x !== null));
  async function apply() {
    setState("busy");
    setError("");
    try {
      await post(auth, "/api/agentic-writer", { action: "edit", briefId, patch: { sections } });
      setState("done");
    } catch (e) {
      setError(msgOf(e));
      setState("waiting");
    }
  }
  return (
    <div className="flex flex-col overflow-hidden rounded-aw-lg border border-rule bg-white">
      <div className="flex items-start gap-3 border-b border-rule-faint px-4 py-4">
        <span className="zp-card__icon">
          <Icon d={I.edit} />
        </span>
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="text-[15px] font-semibold text-ink">Changes to the outline</span>
          <span className="text-[13px] text-muted">{why || "Nothing changes until you apply"}</span>
        </span>
      </div>
      <div className="grid gap-4 px-4 py-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <span className="aw-micro">Now</span>
          <ol className="flex flex-col gap-1.5">
            {before.map((h, i) => (
              <li key={i} className={`flex gap-2.5 text-[14px] ${kept.has(i) ? "text-body" : "text-neg line-through decoration-1"}`}>
                <span className="aw-num w-4 shrink-0 text-muted">{i + 1}</span>
                <span className="[overflow-wrap:anywhere]">{h}</span>
              </li>
            ))}
          </ol>
        </div>
        <div className="flex flex-col gap-2">
          <span className="aw-micro">After</span>
          <ol className="flex flex-col gap-1.5">
            {sections.map((s, i) => {
              const h2 = s.h2 || (s.from !== null ? before[s.from] : "");
              const changed = s.from === null || (s.h2 && s.h2 !== before[s.from]);
              return (
                <li key={i} className="flex flex-col gap-0.5">
                  <span className={`flex gap-2.5 text-[14px] ${changed ? "font-medium text-pos" : "text-ink"}`}>
                    <span className="aw-num w-4 shrink-0 text-muted">{i + 1}</span>
                    <span className="[overflow-wrap:anywhere]">{h2}</span>
                  </span>
                  {s.h3?.length ? <span className="pl-[26px] text-[12px] text-muted">{s.h3.join(" · ")}</span> : null}
                </li>
              );
            })}
          </ol>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t border-rule-faint bg-surface-2 px-4 py-3">
        {state === "done" || state === "dismissed" ? (
          <span className={`text-[13px] ${state === "done" ? "text-pos" : "text-muted"}`}>{state === "done" ? "Applied. The outline is updated." : "Dismissed. The outline is unchanged."}</span>
        ) : canEdit ? (
          <>
            <button type="button" className="aw-btn aw-btn--primary aw-btn--sm" disabled={state === "busy"} onClick={() => void apply()}>
              {state === "busy" ? "Applying..." : "Apply"}
            </button>
            <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm" disabled={state === "busy"} onClick={() => setState("dismissed")}>
              Dismiss
            </button>
            {error ? <span className="text-[13px] text-neg">{error}</span> : null}
          </>
        ) : (
          <span className="text-[13px] text-muted">Ask an editor to apply these changes.</span>
        )}
      </div>
    </div>
  );
}

/** The Publish panel from Drafts, opened from a card: the article as HTML with the brand's table styles. */
function usePublish(auth: RunAuth) {
  const [open, setOpen] = useState<{ docId: string; title: string; html: string; brandId: string | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return {
    busy,
    error,
    async open(docId: string, siteId: string, brandId: string | null) {
      setBusy(true);
      setError("");
      try {
        const sb = currentSupabase();
        const [doc, guideline] = await Promise.all([getDoc(sb, docId), getGuideline(sb, siteId).catch(() => null)]);
        setOpen({ docId, title: doc.title, html: brandTables(exportClean(docToHtml(doc.content)), guideline), brandId });
      } catch (e) {
        setError(msgOf(e));
      } finally {
        setBusy(false);
      }
    },
    panel: open ? <PublishPanel sb={currentSupabase()} auth={auth} docId={open.docId} brandId={open.brandId ?? undefined} title={open.title} html={() => open.html} onClose={() => setOpen(null)} /> : null,
  };
}

/** Changes to a draft's text, each shown before and after. Apply saves them into the draft; nothing changes before. */
export function ReviseCard({ docId, title, edits, canEdit }: { docId: string; title: string; edits: (DraftEdit & { why?: string })[]; canEdit: boolean }) {
  const [state, setState] = useState<"waiting" | "busy" | "done" | "dismissed">("waiting");
  const [note, setNote] = useState("");
  async function apply() {
    setState("busy");
    setNote("");
    try {
      const sb = currentSupabase();
      const doc = await getDoc(sb, docId);
      const out = applyEdits(doc.content as Record<string, unknown>, edits);
      if (!out.applied.length) throw new Error("The draft changed since Zippie read it, so none of the changes match any more. Ask Zippie to try again.");
      await saveDoc(sb, docId, { title: doc.title, content: out.doc, words: wordsIn(out.doc) });
      setNote(out.missed.length ? `Applied ${out.applied.length} of ${edits.length}. The rest no longer match the draft.` : `Applied ${out.applied.length === 1 ? "the change" : `all ${out.applied.length} changes`}.`);
      setState("done");
    } catch (e) {
      setNote(msgOf(e));
      setState("waiting");
    }
  }
  return (
    <div className="flex flex-col overflow-hidden rounded-aw-lg border border-rule bg-white">
      <div className="flex items-start gap-3 border-b border-rule-faint px-4 py-4">
        <span className="zp-card__icon">
          <Icon d={I.edit} />
        </span>
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="text-[15px] font-semibold text-ink [overflow-wrap:anywhere]">Changes to “{title}”</span>
          <span className="text-[13px] text-muted">{edits.length === 1 ? "1 change" : `${edits.length} changes`} · nothing changes until you apply</span>
        </span>
      </div>
      <ol className="flex flex-col">
        {edits.map((e, i) => (
          <li key={i} className="flex flex-col gap-1.5 px-4 py-3 not-first:border-t not-first:border-rule-faint">
            <span className="text-[14px] leading-relaxed text-neg line-through decoration-1 [overflow-wrap:anywhere]">{e.find}</span>
            {e.replace ? <span className="text-[14px] leading-relaxed text-pos [overflow-wrap:anywhere]">{e.replace}</span> : <span className="text-[13px] text-muted">Removed</span>}
            {e.why ? <span className="text-[12px] text-muted">{e.why}</span> : null}
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap items-center gap-2 border-t border-rule-faint bg-surface-2 px-4 py-3">
        {state === "done" || state === "dismissed" ? (
          <span className={`text-[13px] ${state === "done" ? "text-pos" : "text-muted"}`}>{state === "done" ? note : "Dismissed. The draft is unchanged."}</span>
        ) : canEdit ? (
          <>
            <button type="button" className="aw-btn aw-btn--primary aw-btn--sm" disabled={state === "busy"} onClick={() => void apply()}>
              {state === "busy" ? "Applying..." : "Apply"}
            </button>
            <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm" disabled={state === "busy"} onClick={() => setState("dismissed")}>
              Dismiss
            </button>
            {note ? <span className="text-[13px] text-neg">{note}</span> : null}
          </>
        ) : (
          <span className="text-[13px] text-muted">Ask an editor to apply these changes.</span>
        )}
      </div>
    </div>
  );
}
