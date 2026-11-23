"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { useEffect, useMemo, useRef, useState } from "react";
import { BLOCK_INFO, blockProblems, cleanSpec, DEFAULT_SPEC, LIMITS, themedBlock, type BlockKind, type BlockSpec } from "@/lib/blockTemplates";
import { cleanKit, type BrandKit } from "@/lib/brandKit";
import type { CalculatorSpec } from "@/lib/interactiveTemplates";
import { Modal } from "../reports/Dialog";

// Add or change an interactive block (blockTemplates.ts): the block's settings on one side and a live preview on
// the other, running in the same sandbox as the article. Done puts the block in the article in the brand's colors.

type AnySpec = BlockSpec[BlockKind];

/** The brand's kit for the article's site, so blocks match the brand. Null until it loads, or when there is none. */
export function useBlockKit(sb: SupabaseClient, workspaceId: string, siteId: string) {
  const [kit, setKit] = useState<BrandKit | null>(null);
  useEffect(() => {
    let live = true;
    (async () => {
      const site = await sb.from("sites").select("brand_id").eq("id", siteId).maybeSingle();
      const brandId = (site.data?.brand_id as string | null) ?? null;
      const rows = await sb.from("brand_kits").select("key, brand_id, kit").eq("workspace_id", workspaceId);
      const list = (rows.data ?? []) as { key: string; brand_id: string | null; kit: unknown }[];
      const row = list.find((r) => brandId && r.brand_id === brandId) ?? list.find((r) => r.key === "workspace");
      if (live && row) setKit(cleanKit(row.kit));
    })().catch(() => {});
    return () => {
      live = false;
    };
  }, [sb, workspaceId, siteId]);
  return kit;
}

export function BlockDialog({ kind, initial, kit, onDone, onClose }: { kind: BlockKind; initial?: AnySpec; kit: BrandKit | null; onDone: (html: string) => void; onClose: () => void }) {
  const [spec, setSpec] = useState<AnySpec>(() => cleanSpec(kind, initial ?? DEFAULT_SPEC[kind]));
  const problems = blockProblems(kind, cleanSpec(kind, spec));
  const html = useMemo(() => themedBlock(kind, spec, kit), [kind, spec, kit]);
  const set = (patch: Partial<AnySpec>) => setSpec((s) => ({ ...s, ...patch }) as AnySpec);
  const info = BLOCK_INFO[kind];
  return (
    <Modal title={initial ? `Edit ${info.label.toLowerCase()}` : `Add ${info.label.toLowerCase()}`} onClose={onClose} width="max-w-4xl">
      <form
        className="flex flex-col gap-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (!problems.length) onDone(html);
        }}
      >
        <div className="grid grid-cols-1 gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="flex max-h-[60vh] min-w-0 flex-col gap-4 overflow-y-auto pr-1">
            <Fields kind={kind} spec={spec} set={set} />
          </div>
          <div className="flex min-w-0 flex-col gap-2">
            <span className="aw-micro">Preview</span>
            <Preview html={html} />
            <span className="text-[12px] text-muted">This is how readers see it. Try it here.</span>
          </div>
        </div>
        {problems.length ? (
          <ul className="flex flex-col gap-1 text-[13px] text-warn" aria-live="polite">
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        ) : null}
        <div className="flex justify-end gap-2">
          <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="aw-btn aw-btn--primary aw-btn--sm" disabled={problems.length > 0}>
            {initial ? "Save block" : "Add block"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** The block in a sandbox that grows to fit it. */
function Preview({ html }: { html: string }) {
  const ref = useRef<HTMLIFrameElement | null>(null);
  const [h, setH] = useState(240);
  useEffect(() => {
    const fit = (e: MessageEvent) => {
      if (e.source === ref.current?.contentWindow && typeof e.data?.awh === "number") setH(Math.min(900, e.data.awh + 4));
    };
    window.addEventListener("message", fit);
    return () => window.removeEventListener("message", fit);
  }, []);
  const doc = `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><body style="margin:0;font-family:system-ui,sans-serif">${html}<script>new ResizeObserver(()=>parent.postMessage({awh:document.documentElement.scrollHeight},"*")).observe(document.body)</script></body>`;
  return <iframe ref={ref} title="Block preview" sandbox="allow-scripts" srcDoc={doc} className="w-full rounded-aw border border-rule-faint bg-white" style={{ height: h }} />;
}

const inputCls = "aw-input";
function Text({ label, value, onChange, multi, placeholder }: { label: string; value: string; onChange: (v: string) => void; multi?: boolean; placeholder?: string }) {
  return (
    <label className="flex flex-col gap-1.5 text-[13px] text-body">
      {label}
      {multi ? (
        <textarea value={value} rows={2} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className={`${inputCls} min-h-16 py-2`} />
      ) : (
        <input value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className={inputCls} />
      )}
    </label>
  );
}
function Num({ label, value, onChange, step }: { label: string; value: number; onChange: (v: number) => void; step?: number }) {
  const [v, setV] = useState(String(value));
  return (
    <label className="flex min-w-0 flex-col gap-1.5 text-[13px] text-body">
      {label}
      <input
        type="number"
        inputMode="decimal"
        step={step ?? "any"}
        value={v}
        onChange={(e) => {
          setV(e.target.value);
          const n = Number(e.target.value);
          if (e.target.value.trim() && Number.isFinite(n)) onChange(n);
        }}
        className={`${inputCls} aw-num`}
      />
    </label>
  );
}
const X = () => (
  <svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden="true">
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);
function Rows<T>({ label, rows, max, make, onChange, render }: { label: string; rows: T[]; max: number; make: () => T; onChange: (rows: T[]) => void; render: (row: T, set: (r: T) => void, i: number) => React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[13px] text-body">{label}</span>
      {rows.map((r, i) => (
        <div key={i} className="flex items-start gap-2 rounded-aw border border-rule-faint p-2">
          <div className="flex min-w-0 flex-1 flex-col gap-2">{render(r, (n) => onChange(rows.map((x, j) => (j === i ? n : x))), i)}</div>
          <button type="button" className="aw-icon-btn flex h-8 w-8 shrink-0 items-center justify-center" aria-label={`Remove ${i + 1}`} title="Remove" disabled={rows.length <= 1} onClick={() => onChange(rows.filter((_, j) => j !== i))}>
            <X />
          </button>
        </div>
      ))}
      {rows.length < max ? (
        <button type="button" className="aw-text-link self-start text-[13px]" onClick={() => onChange([...rows, make()])}>
          + Add
        </button>
      ) : (
        <span className="text-[12px] text-muted">Up to {max}.</span>
      )}
    </div>
  );
}

function Fields({ kind, spec, set }: { kind: BlockKind; spec: AnySpec; set: (p: Partial<AnySpec>) => void }) {
  if (kind === "calculator") {
    const s = spec as CalculatorSpec;
    const input = (p: Partial<CalculatorSpec["input"]>) => set({ input: { ...s.input, ...p } } as Partial<AnySpec>);
    const factor = (p: Partial<CalculatorSpec["factor"]>) => set({ factor: { ...s.factor, ...p } } as Partial<AnySpec>);
    const result = (p: Partial<CalculatorSpec["result"]>) => set({ result: { ...s.result, ...p } } as Partial<AnySpec>);
    return (
      <>
        <Text label="Title" value={s.title} onChange={(title) => set({ title } as Partial<AnySpec>)} />
        <Text label="What the reader enters" value={s.input.label} onChange={(label) => input({ label })} />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Num label="Starts at" value={s.input.value} onChange={(value) => input({ value })} />
          <Num label="Lowest" value={s.input.min} onChange={(min) => input({ min })} />
          <Num label="Highest" value={s.input.max} onChange={(max) => input({ max })} />
          <Num label="Step" value={s.input.step} onChange={(step) => input({ step })} />
        </div>
        <label className="flex flex-col gap-1.5 text-[13px] text-body">
          How it works it out
          <select value={s.formula} onChange={(e) => set({ formula: e.target.value } as Partial<AnySpec>)} className={inputCls}>
            <option value="multiply">Their number × your number</option>
            <option value="percent">Your number as a % of theirs</option>
            <option value="divide">Your number ÷ their number</option>
          </select>
        </label>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_2fr]">
          <Num label="Your number (low)" value={s.factor.low} onChange={(low) => factor({ low })} />
          <Num label="Your number (high)" value={s.factor.high} onChange={(high) => factor({ high })} />
          <Text label="It stands for" value={s.factor.label} onChange={(label) => factor({ label })} placeholder="conversion rate" />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[2fr_1fr_1fr]">
          <Text label="Result label" value={s.result.label} onChange={(label) => result({ label })} />
          <Text label="Before it" value={s.result.prefix} onChange={(prefix) => result({ prefix })} placeholder="$" />
          <Text label="After it" value={s.result.suffix} onChange={(suffix) => result({ suffix })} placeholder="/mo" />
        </div>
      </>
    );
  }
  if (kind === "sample") {
    const s = spec as BlockSpec["sample"];
    return (
      <>
        <Text label="Title" value={s.title} onChange={(title) => set({ title } as Partial<AnySpec>)} />
        <Text label="Group label" value={s.populationLabel} onChange={(populationLabel) => set({ populationLabel } as Partial<AnySpec>)} />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Num label="Group size" value={s.population} onChange={(population) => set({ population } as Partial<AnySpec>)} step={1} />
          <label className="flex flex-col gap-1.5 text-[13px] text-body">
            Margin of error
            <select value={s.margin} onChange={(e) => set({ margin: Number(e.target.value) } as Partial<AnySpec>)} className={inputCls}>
              {[3, 5, 10].map((m) => (
                <option key={m} value={m}>
                  ± {m} points
                </option>
              ))}
            </select>
          </label>
          <Num label="Response rate (%)" value={s.rate} onChange={(rate) => set({ rate } as Partial<AnySpec>)} />
        </div>
        <p className="text-[12px] text-muted">Readers can change all three. These are the starting values.</p>
      </>
    );
  }
  if (kind === "faq") {
    const s = spec as BlockSpec["faq"];
    return (
      <Rows
        label="Questions"
        rows={s.items}
        max={LIMITS.faq}
        make={() => ({ q: "", a: "" })}
        onChange={(items) => set({ items } as Partial<AnySpec>)}
        render={(r, setR, i) => (
          <>
            <input aria-label={`Question ${i + 1}`} placeholder="Question" value={r.q} onChange={(e) => setR({ ...r, q: e.target.value })} className={inputCls} />
            <textarea aria-label={`Answer ${i + 1}`} placeholder="Answer" rows={2} value={r.a} onChange={(e) => setR({ ...r, a: e.target.value })} className={`${inputCls} min-h-16 py-2`} />
          </>
        )}
      />
    );
  }
  if (kind === "chart") {
    const s = spec as BlockSpec["chart"];
    return (
      <>
        <Text label="Title" value={s.title} onChange={(title) => set({ title } as Partial<AnySpec>)} placeholder="NPS by month" />
        <div className="grid grid-cols-2 gap-3">
          <Text label="Before each value" value={s.prefix} onChange={(prefix) => set({ prefix } as Partial<AnySpec>)} placeholder="$" />
          <Text label="After each value" value={s.suffix} onChange={(suffix) => set({ suffix } as Partial<AnySpec>)} placeholder="%" />
        </div>
        <Rows
          label="Points, in order"
          rows={s.rows}
          max={LIMITS.chartRows}
          make={() => ({ label: "", value: s.rows[s.rows.length - 1]?.value ?? 0 })}
          onChange={(rows) => set({ rows } as Partial<AnySpec>)}
          render={(r, setR, i) => (
            <div className="grid grid-cols-[minmax(0,1fr)_110px] gap-2">
              <input aria-label={`Label ${i + 1}`} placeholder="Label" value={r.label} onChange={(e) => setR({ ...r, label: e.target.value })} className={inputCls} />
              <input aria-label={`Value ${i + 1}`} type="number" step="any" value={r.value} onChange={(e) => setR({ ...r, value: Number(e.target.value) || 0 })} className={`${inputCls} aw-num`} />
            </div>
          )}
        />
        <Text label="Note under the chart" value={s.note} onChange={(note) => set({ note } as Partial<AnySpec>)} placeholder="Source or what the numbers cover" />
      </>
    );
  }
  if (kind === "scale") {
    const s = spec as BlockSpec["scale"];
    return (
      <>
        <Text label="Question" value={s.question} multi onChange={(question) => set({ question } as Partial<AnySpec>)} />
        <div className="grid grid-cols-3 gap-3">
          <Num label="Lowest" value={s.min} onChange={(min) => set({ min } as Partial<AnySpec>)} step={1} />
          <Num label="Highest" value={s.max} onChange={(max) => set({ max } as Partial<AnySpec>)} step={1} />
          <Num label="Starts at" value={s.start} onChange={(start) => set({ start } as Partial<AnySpec>)} step={1} />
        </div>
        <Rows
          label="Ranges, lowest first"
          rows={s.bands}
          max={LIMITS.bands}
          make={() => ({ upTo: s.max, label: "", text: "" })}
          onChange={(bands) => set({ bands } as Partial<AnySpec>)}
          render={(r, setR, i) => (
            <>
              <div className="grid grid-cols-[90px_minmax(0,1fr)] gap-2">
                <input aria-label={`Range ${i + 1} goes up to`} type="number" step={1} value={r.upTo} onChange={(e) => setR({ ...r, upTo: Number(e.target.value) || 0 })} className={`${inputCls} aw-num`} title="Up to and including" />
                <input aria-label={`Range ${i + 1} label`} placeholder="Label" value={r.label} onChange={(e) => setR({ ...r, label: e.target.value })} className={inputCls} />
              </div>
              <input aria-label={`Range ${i + 1} meaning`} placeholder="What this score means" value={r.text} onChange={(e) => setR({ ...r, text: e.target.value })} className={inputCls} />
            </>
          )}
        />
        <p className="text-[12px] text-muted">Each range covers scores up to and including its number.</p>
      </>
    );
  }
  const s = spec as BlockSpec["checklist"];
  return (
    <>
      <Text label="Title" value={s.title} onChange={(title) => set({ title } as Partial<AnySpec>)} placeholder="Before you publish" />
      <Rows
        label="Items"
        rows={s.items}
        max={LIMITS.checklist}
        make={() => ""}
        onChange={(items) => set({ items } as Partial<AnySpec>)}
        render={(r, setR, i) => <input aria-label={`Item ${i + 1}`} placeholder="Something to check" value={r} onChange={(e) => setR(e.target.value)} className={inputCls} />}
      />
    </>
  );
}
