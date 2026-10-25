"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";
import type { RunAuth } from "@/lib/runner";
import { recordUndo } from "@/lib/undo";
import { MODULE_LABEL, type OutlinePart, type WriterBrief } from "@/lib/writerBrief";
import { getBrief, writerStateFor, type DraftLite, type FullBrief } from "@/lib/writerLibrary";
import { post } from "../research/shared";
import { Plus } from "../Icons";
import { snack } from "../Snack";
import { SkelBlock } from "../states";
import { Back, BriefProgress, RegenerateDialog, StateTag, usePoll } from "./parts";

// An outline in the Library, editable: the outline itself, the plan, gaps, FAQs and the CTA. Every edit saves on its
// own. Write draft saves first, so the draft is written from the outline as it is on screen. Deleting a section,
// an H3 or a FAQ can be undone.

type Save = "saved" | "saving" | "error";
const asText = (xs: string[]) => xs.join("\n");
const asLines = (s: string) => s.split("\n");
const clean = (xs: string[]) => xs.map((x) => x.trim()).filter(Boolean);

/** The outline as sent to the server: blank lines and empty rows dropped. */
function tidy(b: WriterBrief): WriterBrief {
  return {
    ...b,
    titles: clean(b.titles),
    gaps: clean(b.gaps),
    outline: b.outline.map((o) => ({ ...o, points: clean(o.points), h3: o.h3.map((h) => ({ title: h.title, points: clean(h.points) })).filter((h) => h.title.trim() || h.points.length) })).filter((o) => o.h2.trim()),
    faqs: b.faqs.filter((f) => f.question.trim()),
  };
}

export function BriefEditor({
  sb,
  auth,
  id,
  canEdit,
  onBack,
  onDraft,
  compact = false,
  flushRef,
}: {
  sb: SupabaseClient;
  auth: RunAuth;
  id: string;
  canEdit: boolean;
  onBack: () => void;
  onDraft: (draftId: string) => void;
  /** Inside the outline sidebar: no back link or page buttons; the sidebar holds Write draft. */
  compact?: boolean;
  /** Set to this editor's save, so the sidebar can save before it starts the draft. */
  flushRef?: MutableRefObject<(() => Promise<boolean>) | null>;
}) {
  const [row, setRow] = useState<FullBrief | null | undefined>(undefined);
  const [draft, setDraft] = useState<DraftLite | null>(null);
  const [b, setB] = useState<WriterBrief | null>(null);
  const [state, setState] = useState<Save>("saved");
  const [busy, setBusy] = useState("");
  const [regen, setRegen] = useState(false);
  const [error, setError] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<WriterBrief | null>(null);
  const current = useRef<WriterBrief | null>(null);
  const show = (x: WriterBrief | null) => {
    current.current = x;
    setB(x);
  };

  const load = useCallback(async () => {
    try {
      const r = await getBrief(sb, id);
      setRow(r);
      // The form fills once the brief is written, and never under someone typing.
      if (r?.brief && !(current.current && pending.current)) show(r.brief);
      if (r) setDraft((await writerStateFor(sb, r.item_id)).draft);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setRow((x) => (x === undefined ? null : x));
    }
  }, [sb, id]);
  useEffect(() => {
    // Loading the brief is the point of this effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);
  usePoll(row?.status === "generating" || draft?.status === "generating", 4000, load);

  /** Save what is on screen now. */
  const flush = useCallback(async (): Promise<boolean> => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const next = pending.current;
    if (!next) return true;
    pending.current = null;
    setState("saving");
    try {
      await post(auth, "/api/agentic-writer", { action: "save", briefId: id, brief: tidy(next) });
      setState("saved");
      return true;
    } catch (e) {
      if (!pending.current) pending.current = next;
      setError(e instanceof Error ? e.message : String(e));
      setState("error");
      return false;
    }
  }, [auth, id]);
  useEffect(
    () => () => {
      if (pending.current) void flush();
    },
    [flush],
  );
  useEffect(() => {
    if (!flushRef) return;
    flushRef.current = flush;
    return () => {
      flushRef.current = null;
    };
  }, [flush, flushRef]);

  const change = (fn: (x: WriterBrief) => WriterBrief) => {
    if (!current.current) return;
    const next = fn(current.current);
    show(next);
    pending.current = next;
    setState("saving");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, 1200);
  };
  const part = (i: number, fn: (o: OutlinePart) => OutlinePart) => change((x) => ({ ...x, outline: x.outline.map((o, n) => (n === i ? fn(o) : o)) }));
  /** Delete part of the outline or the FAQs at once, with Undo (the snackbar or Ctrl + Z) putting that list back. */
  const drop = (what: string, key: "outline" | "faqs", fn: (x: WriterBrief) => WriterBrief) => {
    if (!current.current) return;
    const before = current.current[key];
    const after = fn(current.current)[key];
    const put = (list: typeof before) => change((x) => ({ ...x, [key]: list }));
    put(after);
    const undo = () => put(before);
    recordUndo({ label: `deleting ${what}`, undo, redo: () => put(after) });
    snack(`Deleted ${what}.`, { undo });
  };

  async function generate(kind: "brief" | "draft") {
    setError("");
    setBusy(kind);
    try {
      if (kind === "draft") {
        if (!(await flush())) return;
        const out = await post<{ draftId: string }>(auth, "/api/agentic-writer", { action: "draft", briefId: id });
        onDraft(out.draftId);
        return;
      }
      if (row) await post(auth, "/api/agentic-writer", { action: "brief", itemId: row.item_id });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy("");
    }
  }

  if (row === undefined) return <SkelBlock lines={8} />;
  if (!row) return compact ? <p className="aw-error">This outline was deleted.</p> : <Back onBack={onBack} title="This outline was deleted." />;
  const edit = canEdit && Boolean(b) && (row.status === "ready" || row.status === "approved");

  const saveState = edit ? (
    <span className="flex items-center gap-1.5 px-1 text-[12px] whitespace-nowrap text-muted" aria-live="polite">
      <i className={`inline-block h-1.5 w-1.5 ${state === "error" ? "bg-neg" : state === "saving" ? "bg-warn" : "bg-pos"}`} aria-hidden="true" />
      {state === "error" ? "Not saved" : state === "saving" ? "Saving" : "Saved"}
    </span>
  ) : null;

  return (
    <div className="flex flex-col gap-5">
      {compact ? (
        <div className="flex items-center gap-2">
          <StateTag status={row.status} />
          {saveState}
        </div>
      ) : (
        <Back onBack={onBack} title={b?.h1 || row.keyword}>
        <StateTag status={row.status} />
        {saveState}
        {canEdit && row.status === "ready" ? (
          <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm" onClick={() => setRegen(true)}>
            Regenerate outline
          </button>
        ) : null}
        {draft?.status === "ready" ? (
          <button type="button" className="aw-btn aw-btn--primary aw-btn--sm" onClick={() => onDraft(draft.id)}>
            Open draft
          </button>
        ) : draft?.status === "generating" ? (
          <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm" onClick={() => onDraft(draft.id)}>
            Writing the draft...
          </button>
        ) : canEdit && b && row.status !== "generating" && row.status !== "failed" ? (
          <button type="button" className="aw-btn aw-btn--primary aw-btn--sm" disabled={Boolean(busy) || state === "error"} onClick={() => generate("draft")}>
            {busy === "draft" ? "Starting..." : "Write draft"}
          </button>
        ) : null}
        {canEdit && row.status === "failed" ? (
          <button type="button" className="aw-btn aw-btn--primary aw-btn--sm" disabled={Boolean(busy)} onClick={() => generate("brief")}>
            {busy === "brief" ? "Starting..." : "Write outline"}
          </button>
        ) : null}
        </Back>
      )}
      {error ? <p className="aw-error">{error}</p> : null}
      {row.status === "failed" && row.error ? <p className="aw-error">{row.error}</p> : null}
      {row.status === "generating" ? <BriefProgress sb={sb} brief={row} /> : null}

      {b && row.status !== "generating" ? (
        <div className="flex max-w-4xl flex-col gap-4">
          <Section title="Outline">
            {b.outline.map((o, i) => (
              <div key={i} className="flex flex-col gap-2 border-l-2 border-rule pl-3">
                <div className="flex items-end gap-2">
                  <div className="flex-1">
                    <Text
                      label={
                        <>
                          H2 {i + 1}
                          {o.sources.length ? <Cites list={o.sources} sources={b.research.sources} /> : null}
                        </>
                      }
                      value={o.h2}
                      disabled={!edit}
                      onChange={(v) => part(i, (p) => ({ ...p, h2: v }))}
                    />
                  </div>
                  {edit ? (
                    <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm" onClick={() => drop("a section", "outline", (x) => ({ ...x, outline: x.outline.filter((_, n) => n !== i) }))}>
                      Delete
                    </button>
                  ) : null}
                </div>
                <Area label="Points" value={asText(o.points)} rows={Math.max(2, o.points.length)} disabled={!edit} onChange={(v) => part(i, (p) => ({ ...p, points: asLines(v) }))} />
                {o.h3.map((h, k) => (
                  <div key={k} className="flex flex-col gap-2 pl-4">
                    <div className="flex items-end gap-2">
                      <div className="flex-1">
                        <Text label="H3" value={h.title} disabled={!edit} onChange={(v) => part(i, (p) => ({ ...p, h3: p.h3.map((y, n) => (n === k ? { ...y, title: v } : y)) }))} />
                      </div>
                      {edit ? (
                        <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm" onClick={() => drop("an H3", "outline", (x) => ({ ...x, outline: x.outline.map((o2, n) => (n === i ? { ...o2, h3: o2.h3.filter((_, m) => m !== k) } : o2)) }))}>
                          Delete
                        </button>
                      ) : null}
                    </div>
                    <Area label="Points" value={asText(h.points)} rows={Math.max(2, h.points.length)} disabled={!edit} onChange={(v) => part(i, (p) => ({ ...p, h3: p.h3.map((y, n) => (n === k ? { ...y, points: asLines(v) } : y)) }))} />
                  </div>
                ))}
                {edit ? (
                  <button type="button" className="aw-text-link inline-flex items-center gap-1 self-start text-[13px]" onClick={() => part(i, (p) => ({ ...p, h3: [...p.h3, { title: "", points: [] }] }))}>
                    <Plus size={14} />
                    H3
                  </button>
                ) : null}
              </div>
            ))}
            {edit ? (
              <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm self-start" onClick={() => change((x) => ({ ...x, outline: [...x.outline, { h2: "", points: [], h3: [], sources: [] }] }))}>
                <Plus size={14} />
                Section
              </button>
            ) : null}
          </Section>

          <Section title="Plan">
            <Text label="H1" value={b.h1} disabled={!edit} onChange={(v) => change((x) => ({ ...x, h1: v }))} />
            <Area label="Other titles" value={asText(b.titles)} rows={3} disabled={!edit} onChange={(v) => change((x) => ({ ...x, titles: asLines(v) }))} />
            <Area label="Meta description" value={b.metaDescription} rows={2} disabled={!edit} onChange={(v) => change((x) => ({ ...x, metaDescription: v }))} />
            <div className="grid gap-3 sm:grid-cols-2">
              <Text label="Slug" value={b.slug} disabled={!edit} onChange={(v) => change((x) => ({ ...x, slug: v }))} />
              <Text label="Word target" value={String(b.wordTarget)} disabled={!edit} onChange={(v) => change((x) => ({ ...x, wordTarget: Number(v.replace(/\D/g, "")) || 0 }))} />
            </div>
            <Area label="Search intent" value={b.searchIntent} rows={2} disabled={!edit} onChange={(v) => change((x) => ({ ...x, searchIntent: v }))} />
            <Area label="Reader" value={b.reader} rows={2} disabled={!edit} onChange={(v) => change((x) => ({ ...x, reader: v }))} />
            <Area label="Angle" value={b.angle} rows={3} disabled={!edit} onChange={(v) => change((x) => ({ ...x, angle: v }))} />
          </Section>

          <Section title="What the top pages miss">
            <Area label="Gaps" value={asText(b.gaps)} rows={Math.max(2, b.gaps.length)} disabled={!edit} onChange={(v) => change((x) => ({ ...x, gaps: asLines(v) }))} />
          </Section>

          <Section title="FAQs">
            {b.faqs.map((f, i) => (
              <div key={i} className="flex flex-col gap-2 border-l-2 border-rule pl-3">
                <div className="flex items-end gap-2">
                  <div className="flex-1">
                    <Text label="Question" value={f.question} disabled={!edit} onChange={(v) => change((x) => ({ ...x, faqs: x.faqs.map((y, n) => (n === i ? { ...y, question: v } : y)) }))} />
                  </div>
                  {edit ? (
                    <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm" onClick={() => drop("a FAQ", "faqs", (x) => ({ ...x, faqs: x.faqs.filter((_, n) => n !== i) }))}>
                      Delete
                    </button>
                  ) : null}
                </div>
                <Area label="Answer" value={f.answer} rows={2} disabled={!edit} onChange={(v) => change((x) => ({ ...x, faqs: x.faqs.map((y, n) => (n === i ? { ...y, answer: v } : y)) }))} />
              </div>
            ))}
            {edit ? (
              <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm self-start" onClick={() => change((x) => ({ ...x, faqs: [...x.faqs, { question: "", answer: "" }] }))}>
                <Plus size={14} />
                FAQ
              </button>
            ) : null}
          </Section>

          <Section title="Call to action">
            <div className="grid gap-3 sm:grid-cols-2">
              <Text label="Text" value={b.cta.text} disabled={!edit} onChange={(v) => change((x) => ({ ...x, cta: { ...x.cta, text: v } }))} />
              <Text label="Where" value={b.cta.where} disabled={!edit} onChange={(v) => change((x) => ({ ...x, cta: { ...x.cta, where: v } }))} />
            </div>
          </Section>

          {b.modules.length ? (
            <Section title="Interactive modules">
              <ul className="flex flex-col gap-2 text-[14px] text-body">
                {b.modules.map((m) => (
                  <li key={m.title}>
                    <span className="font-medium text-ink">{m.title}</span> <span className="text-muted">· {MODULE_LABEL[m.type]} · after “{m.placement}”</span>
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}

          {b.research.sources.length ? (
            <Section title="Sources">
              <ol className="flex flex-col gap-1 text-[13px]">
                {b.research.sources.map((s) => (
                  <li key={s.n}>
                    [{s.n}]{" "}
                    <a href={s.url} target="_blank" rel="noreferrer">
                      {s.title || s.domain}
                    </a>{" "}
                    <span className="text-muted">{s.domain}</span>
                  </li>
                ))}
              </ol>
            </Section>
          ) : null}
        </div>
      ) : null}

      {regen ? (
        <RegenerateDialog
          auth={auth}
          kind="brief"
          briefId={row.id}
          itemId={row.item_id}
          onClose={() => setRegen(false)}
          onStarted={() => {
            setRegen(false);
            pending.current = null;
            show(null);
            load();
          }}
        />
      ) : null}
    </div>
  );
}

/** The sources behind an outline item, as [1] [2] linked to each source. */
function Cites({ list, sources }: { list: number[]; sources: WriterBrief["research"]["sources"] }) {
  return (
    <span className="ml-2 inline-flex gap-1 normal-case">
      {list.map((n) => {
        const src = sources.find((x) => x.n === n);
        return src ? (
          <a key={n} href={src.url} target="_blank" rel="noreferrer" title={src.title || src.domain} className="aw-num aw-text-link">
            [{n}]
          </a>
        ) : (
          <span key={n} className="aw-num">
            [{n}]
          </span>
        );
      })}
    </span>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="aw-frame flex flex-col gap-3 bg-white p-4">
      <h2 className="aw-h4">{title}</h2>
      {children}
    </section>
  );
}

function Text({ label, value, disabled, onChange }: { label: React.ReactNode; value: string; disabled: boolean; onChange: (v: string) => void }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="aw-label">{label}</span>
      <input className="aw-input h-9 rounded-md" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

function Area({ label, value, rows, disabled, onChange }: { label: string; value: string; rows: number; disabled: boolean; onChange: (v: string) => void }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="aw-label">{label}</span>
      <textarea className="aw-input aw-textarea rounded-md" rows={rows} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}
