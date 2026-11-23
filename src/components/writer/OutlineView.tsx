"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { useCallback, useEffect, useMemo, useState } from "react";
import { cardsFrom, visualsOf, type FactNote, type SectionCard, type VisualChip } from "@/lib/articleNotes";
import type { RunAuth } from "@/lib/runner";
import type { WriterBrief } from "@/lib/writerBrief";
import { getBrief, type FullBrief } from "@/lib/writerLibrary";
import { Modal } from "../reports/Dialog";
import { post } from "../research/shared";
import { SidePanel, Thinking } from "../ui";
import { StateTag, usePoll, useWide } from "./parts";

// The outline screen (docs/draft-and-write-build.md, Phase 1). The brief sits in a card that folds away. The search
// listing shows live counters, exact-keyword checks and a Google preview. The outline is one row per section; a row
// opens that section beside the list on wide screens (a side panel on small ones): its heading, job, points as a
// list, the fact notes behind it, its images and modules, its links and what's still needed. J and K move between
// sections, Esc closes the panel. Write asks once, with what the draft will be built from, then starts the draft.
// Every edit saves through the agentic-writer "edit" action (editBrief).

type Patch = Record<string, unknown>;
type Live = { h1: string; slug: string; meta: string };

const svg = (d: React.ReactNode, size = 16) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {d}
  </svg>
);
const I = {
  x: () => svg(<path d="M6 6l12 12M18 6L6 18" />),
  up: () => svg(<path d="m18 15-6-6-6 6" />),
  down: () => svg(<path d="m6 9 6 6 6-6" />),
  check: () => svg(<path d="M20 6 9 17l-5-5" />, 14),
  alert: () => svg(<path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />, 14),
  plus: () => svg(<path d="M12 5v14M5 12h14" />, 14),
};

const typingIn = (t: EventTarget | null) => t instanceof HTMLElement && Boolean(t.closest("input, textarea, select, [contenteditable='true']"));
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
const sectionName = (c: SectionCard) => (c.key === "intro" ? "Intro" : c.h2 || "Untitled section");

export function OutlineView({
  sb,
  auth,
  id,
  canEdit,
  domain,
  onBack,
  onDraft,
}: {
  sb: SupabaseClient;
  auth: RunAuth;
  id: string;
  canEdit: boolean;
  /** The brand's website, for the Google preview. */
  domain?: string;
  onBack: () => void;
  onDraft: (draftId: string) => void;
}) {
  const [row, setRow] = useState<FullBrief | null | undefined>(undefined);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [writing, setWriting] = useState(false);
  const [sel, setSel] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [briefOpen, setBriefOpen] = useState(true);
  const wide = useWide();

  const load = useCallback(async () => {
    try {
      setRow(await getBrief(sb, id));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setRow((r) => r ?? null);
    }
  }, [sb, id]);
  useEffect(() => {
    // Loading the outline is the point of this effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);
  usePoll(row?.status === "generating", 4000, load);

  const b = row?.brief ?? null;
  const cards = useMemo(() => (b ? (b.cards?.length ? b.cards : cardsFrom(b)) : []), [b]);
  const at = sel ? cards.findIndex((c) => c.key === sel) : -1;
  const card = at >= 0 ? cards[at] : undefined;

  // J and K move between sections; Esc closes the docked section (the side panel closes itself).
  useEffect(() => {
    if (!cards.length) return;
    const keys = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || typingIn(e.target) || document.querySelector("[role='dialog']")) return;
      if (e.key === "j" || e.key === "k") {
        e.preventDefault();
        const i = at < 0 ? (e.key === "j" ? 0 : cards.length - 1) : Math.min(cards.length - 1, Math.max(0, at + (e.key === "j" ? 1 : -1)));
        setSel(cards[i].key);
      } else if (e.key === "Escape" && wide && sel) setSel(null);
    };
    window.addEventListener("keydown", keys);
    return () => window.removeEventListener("keydown", keys);
  }, [cards, at, sel, wide]);

  async function save(patch: Patch) {
    if (!canEdit) return;
    setSaving(true);
    try {
      const out = await post<{ brief: WriterBrief }>(auth, "/api/agentic-writer", { action: "edit", briefId: id, patch });
      setRow((r) => (r ? { ...r, brief: out.brief } : r));
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function write() {
    setWriting(true);
    setError("");
    try {
      const out = await post<{ draftId: string }>(auth, "/api/agentic-writer", { action: "draft", briefId: id });
      onDraft(out.draftId);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setWriting(false);
      setAsking(false);
    }
  }

  if (row === undefined) return <Thinking text="Opening the outline..." />;
  const head = b?.h1 || row?.keyword || "Outline";
  const canWrite = Boolean(b && canEdit && row && (row.status === "ready" || row.status === "approved"));
  const top = (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <span className="flex min-w-0 flex-wrap items-center gap-3">
        <button type="button" className="aw-text-link shrink-0 text-[13px]" onClick={onBack}>
          ← Drafts
        </button>
        <span className="min-w-0 text-[15px] font-medium text-ink [overflow-wrap:anywhere]">{head}</span>
        {row ? <StateTag status={row.status} /> : null}
      </span>
      <span className="flex items-center gap-3">
        {b && canEdit ? (
          <span className="flex items-center gap-1.5 text-[12px] whitespace-nowrap text-muted" aria-live="polite">
            <i className={`inline-block h-1.5 w-1.5 ${saving ? "bg-warn" : "bg-pos"}`} aria-hidden="true" />
            {saving ? "Saving" : "Saved"}
          </span>
        ) : null}
        {canWrite ? (
          <button type="button" className="aw-btn aw-btn--primary aw-btn--sm" disabled={writing || saving} onClick={() => setAsking(true)}>
            {writing ? "Starting" : "Write draft"}
          </button>
        ) : null}
      </span>
    </div>
  );
  if (!row) return top;
  if (!b)
    return (
      <div className="flex flex-col gap-5">
        {top}
        {row.error ? <p className="aw-error">{row.error}</p> : null}
        {error ? <p className="aw-error">{error}</p> : null}
        {row.status === "generating" ? <Thinking text="Writing the outline..." /> : null}
      </div>
    );

  const editable = canEdit && row.status !== "generating";
  const cardsEditable = editable && Boolean(b.cards?.length);
  const notes = b.notes ?? [];
  const words = cards.reduce((n, c) => n + c.words, 0) || b.wordTarget;
  const needs = cards.filter((c) => c.gaps.length);
  const lines: [string, string | undefined][] = [
    ["Job", b.job],
    ["Point of view", b.pov],
    ["Reader", b.reader],
    ["Leading word", b.leadingWord],
    ["Shape", b.shape ? `${b.shape.picked}${b.shape.why ? `. ${b.shape.why}` : ""}` : undefined],
  ];
  const shown = lines.filter(([, v]) => v);

  const detail = card ? (
    <SectionDetail
      key={card.key}
      card={card}
      notes={notes}
      sources={b.research.sources}
      chips={visualsOf(b, card)}
      disabled={!cardsEditable}
      onSave={(patch) => save({ cards: [{ key: card.key, ...patch }] })}
      onChip={(chip) => save(chip.kind === "image" ? { removeImages: [chip.id] } : { removeModules: [chip.id] })}
    />
  ) : null;
  const nav = card ? (
    <span className="flex items-center gap-1">
      <button type="button" className="aw-icon-btn flex h-8 w-8 items-center justify-center" aria-label="Previous section" title="Previous section (K)" disabled={at <= 0} onClick={() => setSel(cards[at - 1].key)}>
        <I.up />
      </button>
      <button type="button" className="aw-icon-btn flex h-8 w-8 items-center justify-center" aria-label="Next section" title="Next section (J)" disabled={at >= cards.length - 1} onClick={() => setSel(cards[at + 1].key)}>
        <I.down />
      </button>
      <span className="aw-num px-1 text-[12px] whitespace-nowrap text-muted">
        Section {at + 1} of {cards.length}
      </span>
    </span>
  ) : null;

  return (
    <div className="flex flex-col gap-5">
      {top}
      {row.error ? <p className="aw-error">{row.error}</p> : null}
      {error ? <p className="aw-error">{error}</p> : null}

      <div className="flex flex-wrap gap-x-5 gap-y-1 text-[13px] text-muted">
        {row.keyword ? (
          <span>
            Keyword <span className="text-ink">{row.keyword}</span>
          </span>
        ) : null}
        <span className="aw-num">{plural(cards.length, "section")}</span>
        <span className="aw-num">About {words.toLocaleString("en-US")} words</span>
        <span className="aw-num">{plural(notes.length, "fact note")}</span>
        {needs.length ? (
          <button type="button" className="aw-status aw-status--warn" onClick={() => setSel(needs[0].key)} title="Open the first section that still needs detail">
            {plural(needs.length, "section")} need detail
          </button>
        ) : null}
      </div>

      <div className={wide && card ? "grid grid-cols-[minmax(0,1fr)_380px] items-start gap-6" : ""}>
        <div className="flex min-w-0 flex-col gap-5">
          {shown.length ? (
            <section className="aw-frame flex flex-col">
              <button type="button" className="flex items-center gap-2 px-4 py-3 text-left" aria-expanded={briefOpen} onClick={() => setBriefOpen((o) => !o)}>
                <span className={`text-muted transition-transform ${briefOpen ? "" : "-rotate-90"}`}>
                  <I.down />
                </span>
                <span className="text-[14px] font-medium text-ink">Brief</span>
                {!briefOpen && b.leadingWord ? <span className="min-w-0 truncate text-[13px] text-muted">{b.leadingWord}</span> : null}
              </button>
              {briefOpen ? (
                <dl className="grid grid-cols-1 gap-x-6 border-t border-rule-faint px-4 py-3 sm:grid-cols-[140px_1fr]">
                  {shown.map(([k, v]) => (
                    <div key={k} className="contents">
                      <dt className="pt-2 text-[13px] text-muted sm:pb-2">{k}</dt>
                      <dd className={`min-w-0 pb-2 text-[13px] [overflow-wrap:break-word] sm:pt-2 ${k === "Leading word" ? "font-medium text-ink" : "text-body"}`}>{v}</dd>
                    </div>
                  ))}
                </dl>
              ) : null}
            </section>
          ) : null}

          <SearchListing key={`${b.h1}|${b.slug}|${b.metaDescription}`} brief={b} keyword={row.keyword} domain={domain} disabled={!editable} onSave={save} />

          <section className="aw-frame flex flex-col">
            <div className="flex items-center justify-between gap-3 border-b border-rule-faint px-4 py-3">
              <span className="text-[14px] font-medium text-ink">Outline</span>
              <span className="hidden text-[12px] text-muted sm:inline">Open a section to edit it. J and K move between sections.</span>
            </div>
            <ol className="flex flex-col">
              {cards.map((c, i) => (
                <SectionRow key={c.key} card={c} n={i} first={i === 0} on={c.key === sel} chips={visualsOf(b, c)} onOpen={() => setSel((s) => (s === c.key ? null : c.key))} />
              ))}
            </ol>
          </section>
        </div>

        {wide && card ? (
          <aside className="sticky top-4 flex max-h-[calc(100vh-2rem)] min-w-0 flex-col border border-rule bg-white" aria-label={`Section: ${sectionName(card)}`}>
            <div className="flex items-center gap-2 border-b border-rule-faint px-2 py-2">
              {nav}
              <span className="flex-1" />
              <button type="button" className="aw-icon-btn flex h-8 w-8 items-center justify-center" aria-label="Close section" title="Close (Esc)" onClick={() => setSel(null)}>
                <I.x />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">{detail}</div>
          </aside>
        ) : null}
      </div>

      {!wide && card ? (
        <SidePanel title={sectionName(card)} kicker={`Section ${at + 1} of ${cards.length}`} onClose={() => setSel(null)}>
          <div className="flex items-center gap-2 border-b border-rule-faint px-4 py-2">{nav}</div>
          {detail}
        </SidePanel>
      ) : null}

      {asking ? (
        <WriteDialog
          sections={cards.length}
          words={words}
          facts={notes.length}
          needs={needs}
          busy={writing}
          onReview={(key) => {
            setAsking(false);
            setSel(key);
          }}
          onWrite={() => void write()}
          onClose={() => setAsking(false)}
        />
      ) : null}
    </div>
  );
}

/** One section in the outline list. The whole row opens the section. */
function SectionRow({ card, n, first, on, chips, onOpen }: { card: SectionCard; n: number; first: boolean; on: boolean; chips: VisualChip[]; onOpen: () => void }) {
  return (
    <li className={first ? "" : "border-t border-rule-faint"}>
      <button
        type="button"
        aria-current={on ? "true" : undefined}
        onClick={onOpen}
        className={`grid w-full grid-cols-[28px_minmax(0,1fr)] items-start gap-x-3 gap-y-2 px-4 py-3 text-left sm:grid-cols-[28px_minmax(0,1fr)_auto] ${on ? "bg-brand-bg" : "hover:bg-[var(--bg-secondary)]"}`}
      >
        <span className={`aw-num pt-0.5 text-[12px] ${on ? "text-brand" : "text-muted"}`}>{card.key === "intro" ? "–" : n}</span>
        <span className="flex min-w-0 flex-col gap-1">
          <span className="text-[14px] font-medium text-ink [overflow-wrap:anywhere]">{sectionName(card)}</span>
          <span className="aw-num text-[12px] text-muted">
            {plural(card.points.length, "point")} · {plural(card.facts.length, "fact")} · ~{card.words} words
          </span>
          {chips.length ? (
            <span className="flex flex-wrap gap-1.5">
              {chips.map((c) => (
                <span key={`${c.kind}:${c.id}`} className="aw-chip">
                  {c.label}
                </span>
              ))}
            </span>
          ) : null}
        </span>
        {card.gaps.length ? (
          <span className="col-start-2 sm:col-start-3">
            <span className="aw-status aw-status--warn">{card.gaps.length} needed</span>
          </span>
        ) : null}
      </button>
    </li>
  );
}

/** The H1, slug and meta with live counters, exact-keyword checks and a Google preview. Each saves when it loses focus. */
function SearchListing({ brief, keyword, domain, disabled, onSave }: { brief: WriterBrief; keyword: string; domain?: string; disabled: boolean; onSave: (p: Patch) => void }) {
  const [v, setV] = useState<Live>({ h1: brief.h1, slug: brief.slug, meta: brief.metaDescription });
  const kw = keyword.trim().toLowerCase();
  const done = (k: keyof Live, field: string, saved: string) => {
    const next = v[k].trim();
    if (next && next !== saved) onSave({ [field]: next });
    else setV((x) => ({ ...x, [k]: saved }));
  };
  const checks = kw
    ? [
        { label: "Keyword in the title", ok: v.h1.toLowerCase().includes(kw) },
        { label: "Keyword in the URL", ok: v.slug.toLowerCase().includes(kw.replace(/\s+/g, "-")) },
        { label: "Keyword in the description", ok: v.meta.toLowerCase().includes(kw) },
      ]
    : [];
  const host = (domain || "").replace(/^https?:\/\//, "").replace(/\/+$/, "");
  return (
    <section className="aw-frame flex flex-col">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-rule-faint px-4 py-3">
        <span className="text-[14px] font-medium text-ink">Search listing</span>
        <span className="text-[12px] text-muted">How the page shows up on Google</span>
      </div>
      <div className="flex flex-col gap-4 px-4 py-4">
        <Field label="Title (H1)" id="ol-h1" count={v.h1.length} lo={30} hi={60}>
          <input id="ol-h1" value={v.h1} disabled={disabled} onChange={(e) => setV({ ...v, h1: e.target.value })} onBlur={() => done("h1", "h1", brief.h1)} onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()} className="aw-input" />
        </Field>
        <Field label="URL" id="ol-slug">
          <span className="flex min-w-0 items-stretch">
            {host ? <span className="flex shrink-0 items-center border border-r-0 border-rule bg-[var(--bg-secondary)] px-2.5 text-[13px] text-muted">{host}/</span> : null}
            <input
              id="ol-slug"
              value={v.slug}
              disabled={disabled}
              spellCheck={false}
              onChange={(e) => setV({ ...v, slug: e.target.value.toLowerCase().replace(/[^a-z0-9/-]+/g, "-").replace(/-{2,}/g, "-") })}
              onBlur={() => done("slug", "slug", brief.slug)}
              onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
              className="aw-input min-w-0 flex-1"
            />
          </span>
        </Field>
        <Field label="Meta description" id="ol-meta" count={v.meta.length} lo={120} hi={155}>
          <textarea id="ol-meta" value={v.meta} rows={2} disabled={disabled} onChange={(e) => setV({ ...v, meta: e.target.value.replace(/\n/g, " ") })} onBlur={() => done("meta", "metaDescription", brief.metaDescription)} className="aw-input min-h-20 py-2" />
        </Field>
        {checks.length ? (
          <span className="flex flex-wrap gap-2">
            {checks.map((c) => (
              <span key={c.label} className={`aw-status ${c.ok ? "aw-status--ranked" : "aw-status--warn"} inline-flex items-center gap-1`}>
                {c.ok ? <I.check /> : <I.alert />}
                {c.label}
              </span>
            ))}
          </span>
        ) : null}
        <div className="flex flex-col gap-1 border border-rule-faint bg-[var(--bg-secondary)] px-4 py-3" aria-label="Google preview">
          <span className="aw-micro">Google preview</span>
          <span className="truncate text-[12px] text-muted">{[host || "your-site.com", ...v.slug.split("/").filter(Boolean)].join(" › ")}</span>
          <span className="truncate text-[18px] leading-6 text-brand">{v.h1.length > 60 ? `${v.h1.slice(0, 58).trim()} …` : v.h1 || "Add a title"}</span>
          <span className="text-[13px] leading-5 text-body">{v.meta.length > 155 ? `${v.meta.slice(0, 152).trim()} …` : v.meta || "Add a meta description."}</span>
        </div>
      </div>
    </section>
  );
}

function Field({ label, id, count, lo, hi, children }: { label: string; id: string; count?: number; lo?: number; hi?: number; children: React.ReactNode }) {
  let note = "";
  let tone = "text-pos";
  if (count !== undefined && hi) {
    if (count === 0) [note, tone] = ["Required", "text-neg"];
    else if (lo && count < lo) [note, tone] = ["A bit short", "text-warn"];
    else if (count > hi) [note, tone] = ["Google may cut this off", "text-neg"];
  }
  return (
    <div className="flex flex-col gap-1.5">
      <span className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-[13px] text-body">
          {label}
        </label>
        {count !== undefined && hi ? (
          <span className={`aw-num text-[12px] whitespace-nowrap ${tone}`}>
            {note ? `${note} · ` : ""}
            {count} / {hi}
          </span>
        ) : null}
      </span>
      {children}
    </div>
  );
}

/** One section's card: heading, job, points, images and modules, facts, links and what's still needed. */
function SectionDetail({
  card,
  notes,
  sources,
  chips,
  disabled,
  onSave,
  onChip,
}: {
  card: SectionCard;
  notes: FactNote[];
  sources: { n: number; domain: string; url: string }[];
  chips: VisualChip[];
  disabled: boolean;
  onSave: (patch: Patch) => void;
  onChip: (chip: VisualChip) => void;
}) {
  const [h2, setH2] = useState(card.h2);
  const [quote, setQuote] = useState<string | null>(null);
  const [dropping, setDropping] = useState<string | null>(null);
  const facts = card.facts.map((f) => notes.find((n) => n.id === f)).filter((n): n is FactNote => Boolean(n));
  const intro = card.key === "intro";
  return (
    <div className="flex flex-col gap-6 px-4 py-4">
      {intro ? null : (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="sd-h2" className="aw-micro">
            Heading
          </label>
          <input
            id="sd-h2"
            value={h2}
            disabled={disabled}
            onChange={(e) => setH2(e.target.value)}
            onBlur={() => (h2.trim() && h2.trim() !== card.h2 ? onSave({ h2: h2.trim() }) : setH2(card.h2))}
            onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
            className="aw-input text-[15px] font-medium"
          />
        </div>
      )}
      {card.job ? (
        <div className="flex flex-col gap-1">
          <span className="aw-micro">Job</span>
          <p className="text-[13px] text-ink [overflow-wrap:break-word]">{card.job}</p>
        </div>
      ) : null}

      <Points key={card.points.join("\n")} points={card.points} disabled={disabled} onSave={(points) => onSave({ points })} />

      {chips.length ? (
        <div className="flex flex-col gap-2">
          <span className="aw-micro">Images and modules</span>
          <span className="flex flex-wrap gap-2">
            {chips.map((c) => (
              <span key={`${c.kind}:${c.id}`} className="aw-chip inline-flex items-center gap-1.5">
                {c.label}
                {disabled ? null : (
                  <button type="button" className="flex h-4 w-4 items-center justify-center text-muted hover:text-ink" aria-label={`Remove ${c.label}`} title="Remove" onClick={() => onChip(c)}>
                    {svg(<path d="M6 6l12 12M18 6L6 18" />, 12)}
                  </button>
                )}
              </span>
            ))}
          </span>
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        <span className="aw-micro">
          Facts <span className="aw-num text-muted">{facts.length}</span>
        </span>
        {facts.length ? (
          facts.map((n) => {
            const src = sources.find((s) => s.n === n.source);
            return (
              <div key={n.id} className="flex flex-col gap-2 border border-rule-faint px-3 py-2.5">
                <p className="text-[13px] text-ink [overflow-wrap:break-word]">{n.fact}</p>
                {quote === n.id ? <p className="border-l-2 border-rule pl-2.5 text-[12px] text-muted [overflow-wrap:break-word]">&ldquo;{n.quote}&rdquo;</p> : null}
                {dropping === n.id ? (
                  <span className="flex flex-wrap items-center gap-2 text-[12px] text-body">
                    Remove this fact? It can&apos;t be added back.
                    <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm" onClick={() => setDropping(null)}>
                      Keep
                    </button>
                    <button
                      type="button"
                      className="aw-btn aw-btn--primary aw-btn--sm"
                      onClick={() => {
                        setDropping(null);
                        onSave({ facts: card.facts.filter((f) => f !== n.id) });
                      }}
                    >
                      Remove
                    </button>
                  </span>
                ) : (
                  <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px]">
                    {src ? (
                      <a href={src.url} target="_blank" rel="noopener noreferrer" className="aw-text-link max-w-[200px] truncate">
                        {src.domain}
                      </a>
                    ) : null}
                    <button type="button" className="aw-text-link" aria-expanded={quote === n.id} onClick={() => setQuote((q) => (q === n.id ? null : n.id))}>
                      {quote === n.id ? "Hide quote" : "Show quote"}
                    </button>
                    <span className="flex-1" />
                    {disabled ? null : (
                      <button type="button" className="aw-text-link text-muted" onClick={() => setDropping(n.id)}>
                        Remove
                      </button>
                    )}
                  </span>
                )}
              </div>
            );
          })
        ) : (
          <p className="text-[13px] text-muted">No fact notes. The writer covers this section from its points.</p>
        )}
      </div>

      {card.links.length ? (
        <div className="flex flex-col gap-1.5">
          <span className="aw-micro">Links</span>
          {card.links.map((l) => (
            <a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer" className="aw-text-link text-[13px] [overflow-wrap:anywhere]">
              {l.anchor || l.url}
            </a>
          ))}
        </div>
      ) : null}

      {card.gaps.length ? (
        <div className="flex flex-col gap-1.5 border border-rule-faint bg-warn-bg px-3 py-2.5">
          <span className="aw-micro text-warn">Detail needed</span>
          {card.gaps.map((g) => (
            <p key={g} className="text-[13px] text-ink [overflow-wrap:break-word]">
              {g}
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}

const MAX_POINTS = 12;

/** Points as a list: one line each. Enter adds a point below, Backspace on an empty point removes it. Saves on leaving the list. */
function Points({ points, disabled, onSave }: { points: string[]; disabled: boolean; onSave: (points: string[]) => void }) {
  const [list, setList] = useState(points.length ? points : [""]);
  const [focus, setFocus] = useState<number | null>(null);
  useEffect(() => {
    if (focus === null) return;
    document.getElementById(`pt-${focus}`)?.focus();
  }, [focus]);
  const commit = (next: string[]) => {
    const clean = next.map((p) => p.trim()).filter(Boolean);
    if (clean.join("\n") !== points.join("\n")) onSave(clean);
  };
  return (
    <div
      className="flex flex-col gap-2"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) commit(list);
      }}
    >
      <span className="flex items-center justify-between gap-2">
        <span className="aw-micro">
          Points <span className="aw-num text-muted">{points.length}</span>
        </span>
        {disabled || list.length >= MAX_POINTS ? null : (
          <button
            type="button"
            className="aw-text-link inline-flex items-center gap-1 text-[12px]"
            onClick={() => {
              setList([...list, ""]);
              setFocus(list.length);
            }}
          >
            <I.plus />
            Add point
          </button>
        )}
      </span>
      <ul className="flex flex-col border border-rule-faint">
        {list.map((p, i) => (
          <li key={i} className={`flex items-start gap-2 px-2 ${i ? "border-t border-rule-faint" : ""}`}>
            <span className="mt-[13px] h-1.5 w-1.5 shrink-0 bg-muted" aria-hidden="true" />
            <textarea
              id={`pt-${i}`}
              value={p}
              rows={1}
              disabled={disabled}
              aria-label={`Point ${i + 1}`}
              placeholder="Write a point"
              onFocus={() => setFocus(null)}
              onChange={(e) => setList(list.map((x, j) => (j === i ? e.target.value.replace(/\n/g, " ") : x)))}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (list.length >= MAX_POINTS) return;
                  setList([...list.slice(0, i + 1), "", ...list.slice(i + 1)]);
                  setFocus(i + 1);
                } else if (e.key === "Backspace" && !p && list.length > 1) {
                  e.preventDefault();
                  setList(list.filter((_, j) => j !== i));
                  setFocus(Math.max(0, i - 1));
                }
              }}
              ref={(el) => {
                if (!el) return;
                el.style.height = "auto";
                el.style.height = `${el.scrollHeight}px`;
              }}
              onInput={(e) => {
                e.currentTarget.style.height = "auto";
                e.currentTarget.style.height = `${e.currentTarget.scrollHeight}px`;
              }}
              className="min-h-9 w-full resize-none overflow-hidden bg-transparent py-2 text-[13px] text-ink outline-none focus-visible:outline-none"
            />
            {disabled || list.length === 1 ? null : (
              <button
                type="button"
                className="mt-1.5 flex h-7 w-7 shrink-0 items-center justify-center text-muted hover:text-ink"
                aria-label={`Remove point ${i + 1}`}
                title="Remove"
                onClick={() => {
                  const next = list.filter((_, j) => j !== i);
                  setList(next);
                  commit(next);
                }}
              >
                {svg(<path d="M6 6l12 12M18 6L6 18" />, 14)}
              </button>
            )}
          </li>
        ))}
      </ul>
      {list.length >= MAX_POINTS ? <span className="text-[12px] text-muted">A section holds up to {MAX_POINTS} points.</span> : null}
    </div>
  );
}

/** Write asks once: what the draft is built from, and which sections still need detail. */
function WriteDialog({
  sections,
  words,
  facts,
  needs,
  busy,
  onReview,
  onWrite,
  onClose,
}: {
  sections: number;
  words: number;
  facts: number;
  needs: SectionCard[];
  busy: boolean;
  onReview: (key: string) => void;
  onWrite: () => void;
  onClose: () => void;
}) {
  const stat = (n: string, l: string) => (
    <div className="flex flex-col border border-rule-faint px-3 py-2">
      <span className="aw-num text-[18px] font-medium text-ink">{n}</span>
      <span className="text-[12px] text-muted">{l}</span>
    </div>
  );
  return (
    <Modal title="Write the draft?" onClose={onClose} width="max-w-md">
      <div className="flex flex-col gap-4">
        <p className="text-[13px] text-body">The writer drafts every section from this outline and its fact notes. You can edit the draft afterwards.</p>
        <div className="grid grid-cols-3 gap-2">
          {stat(String(sections), "sections")}
          {stat(`~${words.toLocaleString("en-US")}`, "words")}
          {stat(String(facts), "fact notes")}
        </div>
        {needs.length ? (
          <div className="flex flex-col gap-1.5 border border-rule-faint bg-warn-bg px-3 py-2.5 text-[13px] text-ink">
            <span>
              {needs.length === 1 ? (
                <>
                  <b>{sectionName(needs[0])}</b> still needs detail.
                </>
              ) : (
                <>
                  <b>{needs.length} sections</b> still need detail.
                </>
              )}{" "}
              The writer leaves out what it can&apos;t back up.
            </span>
            <button type="button" className="aw-text-link self-start text-[13px]" onClick={() => onReview(needs[0].key)}>
              Review first
            </button>
          </div>
        ) : null}
        <div className="flex justify-end gap-2">
          <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="aw-btn aw-btn--primary aw-btn--sm" disabled={busy} onClick={onWrite}>
            {busy ? "Starting..." : "Write draft"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
