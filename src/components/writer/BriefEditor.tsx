"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { useCallback, useEffect, useRef, useState } from "react";
import type { RunAuth } from "@/lib/runner";
import { MODULE_LABEL, type OutlinePart, type WriterBrief } from "@/lib/writerBrief";
import { getBrief, writerStateFor, type DraftLite, type FullBrief } from "@/lib/writerLibrary";
import { post } from "../research/shared";
import { Thinking } from "../ui";
import { BriefProgress, RegenerateDialog, StateTag, usePoll } from "./parts";

// A brief in the Library, editable: the plan, the outline, gaps, FAQs and the CTA. Every edit saves on its own.
// Generate Draft saves first, so the draft is written from the brief as it is on screen.

type Save = "saved" | "saving" | "error";
const asText = (xs: string[]) => xs.join("\n");
const asLines = (s: string) => s.split("\n");
const clean = (xs: string[]) => xs.map((x) => x.trim()).filter(Boolean);

/** The brief as sent to the server: blank lines and empty rows dropped. */
function tidy(b: WriterBrief): WriterBrief {
  return {
    ...b,
    titles: clean(b.titles),
    gaps: clean(b.gaps),
    outline: b.outline.map((o) => ({ ...o, points: clean(o.points), h3: o.h3.map((h) => ({ title: h.title, points: clean(h.points) })).filter((h) => h.title.trim() || h.points.length) })).filter((o) => o.h2.trim()),
    faqs: b.faqs.filter((f) => f.question.trim()),
  };
}

export function BriefEditor({ sb, auth, id, canEdit, onBack, onDraft }: { sb: SupabaseClient; auth: RunAuth; id: string; canEdit: boolean; onBack: () => void; onDraft: (draftId: string) => void }) {
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

  if (row === undefined) return <Thinking text="Opening the brief..." />;
  if (!row) return <Head onBack={onBack} title="This brief was deleted." />;
  const edit = canEdit && Boolean(b) && (row.status === "ready" || row.status === "approved");

  return (
    <div className="flex flex-col gap-5">
      <Head onBack={onBack} title={b?.h1 || row.keyword}>
        <StateTag status={row.status} />
        {edit ? (
          <span className="flex items-center gap-1.5 px-1 text-[12px] whitespace-nowrap text-muted" aria-live="polite">
            <i className={`inline-block h-1.5 w-1.5 ${state === "error" ? "bg-neg" : state === "saving" ? "bg-warn" : "bg-pos"}`} aria-hidden="true" />
            {state === "error" ? "Not saved" : state === "saving" ? "Saving" : "Saved"}
          </span>
        ) : null}
        {canEdit && row.status === "ready" ? (
          <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm" onClick={() => setRegen(true)}>
            Regenerate brief
          </button>
        ) : null}
        {draft?.status === "ready" ? (
          <button type="button" className="aw-btn aw-btn--primary aw-btn--sm" onClick={() => onDraft(draft.id)}>
            View Draft
          </button>
        ) : draft?.status === "generating" ? (
          <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm" onClick={() => onDraft(draft.id)}>
            Writing the draft...
          </button>
        ) : canEdit && b && row.status !== "generating" && row.status !== "failed" ? (
          <button type="button" className="aw-btn aw-btn--primary aw-btn--sm" disabled={Boolean(busy) || state === "error"} onClick={() => generate("draft")}>
            {busy === "draft" ? "Starting..." : "Generate Draft"}
          </button>
        ) : null}
        {canEdit && row.status === "failed" ? (
          <button type="button" className="aw-btn aw-btn--primary aw-btn--sm" disabled={Boolean(busy)} onClick={() => generate("brief")}>
            {busy === "brief" ? "Starting..." : "Generate Brief"}
          </button>
        ) : null}
      </Head>
      {error ? <p className="aw-error">{error}</p> : null}
      {row.status === "failed" && row.error ? <p className="aw-error">{row.error}</p> : null}
      {row.status === "generating" ? <BriefProgress sb={sb} brief={row} /> : null}

      {b && row.status !== "generating" ? (
        <div className="flex max-w-4xl flex-col gap-4">
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

          <Section title="Outline">
            {b.outline.map((o, i) => (
              <div key={i} className="flex flex-col gap-2 border-l-2 border-rule pl-3">
                <div className="flex items-end gap-2">
                  <div className="flex-1">
                    <Text label={`H2 ${i + 1}`} value={o.h2} disabled={!edit} onChange={(v) => part(i, (p) => ({ ...p, h2: v }))} />
                  </div>
                  {edit ? (
                    <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm" onClick={() => change((x) => ({ ...x, outline: x.outline.filter((_, n) => n !== i) }))}>
                      Remove
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
                        <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm" onClick={() => part(i, (p) => ({ ...p, h3: p.h3.filter((_, n) => n !== k) }))}>
                          Remove
                        </button>
                      ) : null}
                    </div>
                    <Area label="Points" value={asText(h.points)} rows={Math.max(2, h.points.length)} disabled={!edit} onChange={(v) => part(i, (p) => ({ ...p, h3: p.h3.map((y, n) => (n === k ? { ...y, points: asLines(v) } : y)) }))} />
                  </div>
                ))}
                {edit ? (
                  <button type="button" className="aw-text-link self-start text-[13px]" onClick={() => part(i, (p) => ({ ...p, h3: [...p.h3, { title: "", points: [] }] }))}>
                    + H3
                  </button>
                ) : null}
              </div>
            ))}
            {edit ? (
              <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm self-start" onClick={() => change((x) => ({ ...x, outline: [...x.outline, { h2: "", points: [], h3: [], sources: [] }] }))}>
                + Section
              </button>
            ) : null}
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
                    <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm" onClick={() => change((x) => ({ ...x, faqs: x.faqs.filter((_, n) => n !== i) }))}>
                      Remove
                    </button>
                  ) : null}
                </div>
                <Area label="Answer" value={f.answer} rows={2} disabled={!edit} onChange={(v) => change((x) => ({ ...x, faqs: x.faqs.map((y, n) => (n === i ? { ...y, answer: v } : y)) }))} />
              </div>
            ))}
            {edit ? (
              <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm self-start" onClick={() => change((x) => ({ ...x, faqs: [...x.faqs, { question: "", answer: "" }] }))}>
                + FAQ
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

function Head({ onBack, title, children }: { onBack: () => void; title: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <span className="flex min-w-0 items-center gap-3">
        <button type="button" className="aw-text-link shrink-0 text-[13px]" onClick={onBack}>
          ← Library
        </button>
        <span className="truncate text-[15px] font-medium text-ink">{title}</span>
      </span>
      {children ? <span className="flex flex-wrap items-center gap-2">{children}</span> : null}
    </div>
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

function Text({ label, value, disabled, onChange }: { label: string; value: string; disabled: boolean; onChange: (v: string) => void }) {
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
