"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { useCallback, useEffect, useMemo, useState } from "react";
import { cardsFrom, visualsOf, type SectionCard, type VisualChip } from "@/lib/articleNotes";
import type { RunAuth } from "@/lib/runner";
import type { WriterBrief } from "@/lib/writerBrief";
import { getBrief, type FullBrief } from "@/lib/writerLibrary";
import { Modal } from "../reports/Dialog";
import { post } from "../research/shared";
import { ErrorNote, Thinking } from "../ui";
import { CommandMenu, type Command } from "./CommandMenu";
import { StateTag, usePoll } from "./parts";
import { VisualSketch } from "./VisualSketch";
import { errorText } from "@/lib/errors";

// The outline screen (docs/draft-and-write-build.md, Phase 1), one calm reading column: the title and the piece's goal,
// the Google preview (Edit opens the title, URL and description), then the outline as headings with their H3s. A
// section opens in place under its heading: its heading, goal, the searches it answers, its H3s, what it covers and
// its visuals, each a card with a sketch drawn from the brief's data. J and K move between sections, Esc closes one.
// Write asks once, then starts the draft.
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

  const load = useCallback(async () => {
    try {
      setRow(await getBrief(sb, id));
    } catch (e) {
      setError(errorText(e));
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

  // J and K move between sections; Esc closes the open one.
  useEffect(() => {
    if (!cards.length) return;
    const keys = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || typingIn(e.target) || document.querySelector("[role='dialog']")) return;
      if (e.key === "j" || e.key === "k") {
        e.preventDefault();
        const i = at < 0 ? (e.key === "j" ? 0 : cards.length - 1) : Math.min(cards.length - 1, Math.max(0, at + (e.key === "j" ? 1 : -1)));
        setSel(cards[i].key);
      } else if (e.key === "Escape" && sel) setSel(null);
    };
    window.addEventListener("keydown", keys);
    return () => window.removeEventListener("keydown", keys);
  }, [cards, at, sel]);

  async function save(patch: Patch) {
    if (!canEdit) return;
    setSaving(true);
    try {
      const out = await post<{ brief: WriterBrief }>(auth, "/api/agentic-writer", { action: "edit", briefId: id, patch });
      setRow((r) => (r ? { ...r, brief: out.brief } : r));
      setError("");
    } catch (e) {
      setError(errorText(e));
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
      setError(errorText(e));
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
        {b ? null : <span className="min-w-0 text-[15px] font-medium text-ink [overflow-wrap:anywhere]">{head}</span>}
        {row ? <StateTag status={row.status} /> : null}
      </span>
      <span className="flex items-center gap-3">
        {b && canEdit ? (
          <span className="flex items-center gap-1.5 text-[12px] whitespace-nowrap text-muted" aria-live="polite">
            <i className={`inline-block h-1.5 w-1.5 rounded-full ${saving ? "bg-warn" : "bg-pos"}`} aria-hidden="true" />
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
        {row.error ? <ErrorNote error={row.error} /> : null}
        {error ? <ErrorNote error={error} /> : null}
        {row.status === "generating" ? <Thinking text="Writing the outline..." /> : null}
      </div>
    );

  const editable = canEdit && row.status !== "generating";
  const cardsEditable = editable && Boolean(b.cards?.length);
  const words = cards.reduce((n, c) => n + c.words, 0) || b.wordTarget;
  // The searches each H2 answers, with their volumes (searchGroups.ts), and its H3s. Older briefs have no searches.
  const volumes = new Map((b.research.searches ?? []).map((q) => [q.keyword, q.volume ?? 0]));
  const partOf = (c: SectionCard) => (c.key === "intro" ? undefined : b.outline[Number(c.key.slice(3))]);
  const searchesOf = (c: SectionCard) => (partOf(c)?.searches ?? []).map((q) => ({ keyword: q, volume: volumes.get(q) ?? 0 }));
  const h3sOf = (c: SectionCard) => (partOf(c)?.h3 ?? []).map((h) => h.title).filter(Boolean);
  const monthly = [...new Set(b.outline.flatMap((p) => p.searches ?? []))].reduce((n, q) => n + (volumes.get(q) ?? 0), 0);
  const h2s = cards.filter((c) => c.key !== "intro").length;
  const facts = [row.keyword, plural(h2s, "section"), `~${words.toLocaleString("en-US")} words`, ...(monthly ? [`${compact(monthly)} searches a month`] : [])].filter(Boolean);

  const commands = (): Command[] => [
    ...cards.map((c, i) => ({ group: "Sections", label: c.key === "intro" ? "Intro" : `${i}. ${sectionName(c)}`, run: () => setSel(c.key) })),
    ...(canWrite ? [{ group: "Actions", label: "Write draft", run: () => setAsking(true) }] : []),
    { group: "Go to", label: "Drafts", run: onBack },
  ];

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-8">
      <CommandMenu
        commands={commands}
        shortcuts={[
          {
            title: "Outline",
            keys: [
              ["Next or previous section", ["J", "K"]],
              ["Close the section", ["Esc"]],
              ["Add a point below", ["Enter"]],
              ["Remove an empty point", ["Backspace"]],
            ],
          },
        ]}
      />
      {top}
      {row.error ? <ErrorNote error={row.error} /> : null}
      {error ? <ErrorNote error={error} /> : null}

      <header className="flex flex-col gap-3">
        <h1 className="text-[28px] leading-tight font-semibold tracking-tight text-ink [overflow-wrap:anywhere]">{head}</h1>
        {b.job ? <p className="max-w-3xl text-[16px] leading-relaxed text-body">{b.job}</p> : null}
        <p className="flex flex-wrap gap-x-2 text-[13px] text-muted">
          {facts.map((f, i) => (
            <span key={f} className="aw-num">
              {i ? <span aria-hidden="true">· </span> : null}
              {f}
            </span>
          ))}
        </p>
      </header>

      <SearchListing key={`${b.h1}|${b.slug}|${b.metaDescription}`} brief={b} keyword={row.keyword} domain={domain} disabled={!editable} onSave={save} />

      <section className="flex flex-col gap-3" aria-label="Outline">
        <h2 className="aw-micro">Outline</h2>
        <ol className="flex flex-col overflow-hidden rounded-aw-lg border border-rule bg-white">
          {cards.map((c, i) => (
            <Section
              key={c.key}
              card={c}
              n={i}
              open={c.key === sel}
              searches={searchesOf(c)}
              h3s={h3sOf(c)}
              visuals={visualsOf(b, c)}
              disabled={!cardsEditable}
              fixed={!editable}
              onToggle={() => setSel((s) => (s === c.key ? null : c.key))}
              onSave={(patch) => save({ cards: [{ key: c.key, ...patch }] })}
              onVisual={(v, edit) => save(edit ? { visuals: [{ kind: v.kind, id: v.id, ...edit }] } : v.kind === "image" ? { removeImages: [v.id] } : { removeModules: [v.id] })}
            />
          ))}
        </ol>
      </section>

      {asking ? (
        <WriteDialog
          sections={cards.length}
          words={words}
          monthly={monthly}
          busy={writing}
          onWrite={() => void write()}
          onClose={() => setAsking(false)}
        />
      ) : null}
    </div>
  );
}

/** A search an H2 answers, with its volume a month (0 when unknown). */
type Searched = { keyword: string; volume: number };
/** 16,200 as 16.2K, for volumes beside a heading. */
const compact = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, "")}K` : String(n));

/** One section: its heading and H3s, and when open, everything to edit about it, right under it. */
function Section({
  card,
  n,
  open,
  searches,
  h3s,
  visuals,
  disabled,
  fixed,
  onToggle,
  onSave,
  onVisual,
}: {
  card: SectionCard;
  n: number;
  open: boolean;
  searches: Searched[];
  h3s: string[];
  visuals: VisualChip[];
  /** The card's own fields can't change (an older brief with no cards, or no edit rights). */
  disabled: boolean;
  /** Nothing can change: no edit rights, or the outline is still being written. */
  fixed: boolean;
  onToggle: () => void;
  onSave: (patch: Patch) => void;
  onVisual: OnVisual;
}) {
  const intro = card.key === "intro";
  const volume = searches.reduce((v, q) => v + q.volume, 0);
  const [h2, setH2] = useState(card.h2);
  const num = <span className="aw-num w-5 shrink-0 pt-0.5 text-[14px] text-muted">{intro ? "" : n}</span>;
  const vol = volume ? <span className="aw-num shrink-0 pt-0.5 text-[13px] text-muted">{compact(volume)} / mo</span> : null;
  const chevron = (
    <span className={`shrink-0 pt-0.5 text-muted transition-transform ${open ? "rotate-180" : ""}`}>
      <I.down />
    </span>
  );
  return (
    <li className={`border-rule-faint not-first:border-t ${open ? "bg-[var(--bg-secondary)]" : ""}`}>
      {open && !intro ? (
        // Open: the heading itself is the field to rename it.
        <div className="flex items-start gap-4 px-6 pt-5 pb-2">
          {num}
          <input
            aria-label="Heading"
            value={h2}
            disabled={disabled}
            onChange={(e) => setH2(e.target.value)}
            onBlur={() => (h2.trim() && h2.trim() !== card.h2 ? onSave({ h2: h2.trim() }) : setH2(card.h2))}
            onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
            className="tw-bare -mx-2 -my-1 min-w-0 flex-1 rounded-aw-sm border-0 bg-transparent px-2 py-1 text-[16px] leading-snug font-medium text-ink outline-none hover:bg-white focus:bg-white"
          />
          {vol}
          <button type="button" aria-expanded aria-label="Close section" title="Close (Esc)" onClick={onToggle} className="flex">
            {chevron}
          </button>
        </div>
      ) : (
        <button type="button" aria-expanded={open} onClick={onToggle} className="flex w-full items-start gap-4 px-6 py-5 text-left hover:bg-[var(--bg-secondary)]">
          {num}
          <span className="flex min-w-0 flex-1 flex-col gap-1.5">
            <span className={`text-[16px] leading-snug [overflow-wrap:anywhere] ${intro ? "text-muted" : "font-medium text-ink"}`}>{sectionName(card)}</span>
            {!open && h3s.length ? <span className="text-[14px] leading-relaxed text-muted">{h3s.join(" · ")}</span> : null}
          </span>
          {vol}
          {chevron}
        </button>
      )}
      {open ? <SectionDetail key={card.key} card={card} searches={searches} h3s={h3s} visuals={visuals} disabled={disabled} fixed={fixed} onSave={onSave} onVisual={onVisual} /> : null}
    </li>
  );
}

/** How the page shows up on Google, with the keyword checks. Edit opens the title, URL and description; each saves on leaving. */
function SearchListing({ brief, keyword, domain, disabled, onSave }: { brief: WriterBrief; keyword: string; domain?: string; disabled: boolean; onSave: (p: Patch) => void }) {
  const [v, setV] = useState<Live>({ h1: brief.h1, slug: brief.slug, meta: brief.metaDescription });
  const [editing, setEditing] = useState(false);
  const kw = keyword.trim().toLowerCase();
  const done = (k: keyof Live, field: string, saved: string) => {
    const next = v[k].trim();
    if (next && next !== saved) onSave({ [field]: next });
    else setV((x) => ({ ...x, [k]: saved }));
  };
  const checks = kw
    ? [
        { label: "Title", ok: v.h1.toLowerCase().includes(kw) },
        { label: "URL", ok: v.slug.toLowerCase().includes(kw.replace(/\s+/g, "-")) },
        { label: "Description", ok: v.meta.toLowerCase().includes(kw) },
      ]
    : [];
  const host = (domain || "").replace(/^https?:\/\//, "").replace(/\/+$/, "");
  return (
    <section className="flex flex-col rounded-aw-lg border border-rule bg-white" aria-label="Google preview">
      <div className="flex items-start gap-6 px-6 py-5">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="truncate text-[13px] text-muted">{[host || "your-site.com", ...v.slug.split("/").filter(Boolean)].join(" › ")}</span>
          <span className="text-[20px] leading-7 text-brand [overflow-wrap:anywhere]">{v.h1.length > 60 ? `${v.h1.slice(0, 58).trim()} …` : v.h1 || "Add a title"}</span>
          <span className="text-[14px] leading-relaxed text-body">{v.meta.length > 155 ? `${v.meta.slice(0, 152).trim()} …` : v.meta || "Add a meta description."}</span>
        </div>
        {disabled ? null : (
          <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm shrink-0" aria-expanded={editing} onClick={() => setEditing((e) => !e)}>
            {editing ? "Done" : "Edit"}
          </button>
        )}
      </div>
      {checks.length ? (
        <p className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-rule-faint px-6 py-3 text-[13px]">
          <span className="text-muted">Keyword in</span>
          {checks.map((c) => (
            <span key={c.label} className={`inline-flex items-center gap-1 ${c.ok ? "text-pos" : "text-warn"}`}>
              {c.ok ? <I.check /> : <I.alert />}
              {c.label}
            </span>
          ))}
        </p>
      ) : null}
      {editing ? (
        <div className="flex flex-col gap-5 border-t border-rule-faint px-6 py-5">
          <Field label="Title (H1)" id="ol-h1" count={v.h1.length} lo={30} hi={60}>
            <input id="ol-h1" value={v.h1} disabled={disabled} onChange={(e) => setV({ ...v, h1: e.target.value })} onBlur={() => done("h1", "h1", brief.h1)} onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()} className="aw-input" />
          </Field>
          <Field label="URL" id="ol-slug">
            <span className="flex min-w-0 items-stretch">
              {host ? <span className="flex shrink-0 items-center rounded-l-aw border border-r-0 border-rule bg-[var(--bg-secondary)] px-2.5 text-[13px] text-muted">{host}/</span> : null}
              <input
                id="ol-slug"
                value={v.slug}
                disabled={disabled}
                spellCheck={false}
                onChange={(e) => setV({ ...v, slug: e.target.value.toLowerCase().replace(/[^a-z0-9/-]+/g, "-").replace(/-{2,}/g, "-") })}
                onBlur={() => done("slug", "slug", brief.slug)}
                onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                className={`aw-input min-w-0 flex-1 ${host ? "rounded-l-none!" : ""}`}
              />
            </span>
          </Field>
          <Field label="Meta description" id="ol-meta" count={v.meta.length} lo={120} hi={155}>
            <textarea id="ol-meta" value={v.meta} rows={2} disabled={disabled} onChange={(e) => setV({ ...v, meta: e.target.value.replace(/\n/g, " ") })} onBlur={() => done("meta", "metaDescription", brief.metaDescription)} className="aw-input min-h-20 py-2" />
          </Field>
        </div>
      ) : null}
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

/** Saves a visual's new wording, or removes it when there's no edit. */
type OnVisual = (v: VisualChip, edit?: Patch) => void;

/** A part's heading inside an open section: as big as the text under it, and bolder. */
const Label = ({ children }: { children: React.ReactNode }) => <h3 className="text-[15px] leading-snug font-semibold text-ink">{children}</h3>;

/** An open section: goal, the searches it answers, its H3s, what it covers and its visuals. */
function SectionDetail({
  card,
  searches,
  h3s,
  visuals,
  disabled,
  fixed,
  onSave,
  onVisual,
}: {
  card: SectionCard;
  searches: Searched[];
  h3s: string[];
  visuals: VisualChip[];
  disabled: boolean;
  fixed: boolean;
  onSave: (patch: Patch) => void;
  onVisual: OnVisual;
}) {
  const block = (label: string, body: React.ReactNode) => (
    <div className="flex flex-col gap-2.5">
      <Label>{label}</Label>
      {body}
    </div>
  );
  return (
    <div className="flex flex-col gap-7 pt-2 pr-6 pb-7 pl-15">
      {card.job ? <p className="text-[15.5px] leading-relaxed text-body">{card.job}</p> : null}

      {searches.length
        ? block(
            "Answers these searches",
            <span className="flex flex-wrap gap-2">
              {searches.map((q) => (
                <span key={q.keyword} className="inline-flex items-center gap-2 rounded-full border border-rule bg-white px-3 py-1 text-[14px] text-ink">
                  {q.keyword}
                  {q.volume ? <span className="aw-num text-muted">{q.volume.toLocaleString("en-US")}</span> : null}
                </span>
              ))}
            </span>,
          )
        : null}

      {h3s.length
        ? block(
            "Subheadings",
            <ul className="flex flex-col gap-1.5">
              {h3s.map((h) => (
                <li key={h} className="text-[15px] text-ink">
                  {h}
                </li>
              ))}
            </ul>,
          )
        : null}

      <Points key={card.points.join("\n")} points={card.points} disabled={disabled} onSave={(points) => onSave({ points })} />

      {visuals.length
        ? block(
            "Visuals",
            <div className="flex flex-col gap-3">
              {visuals.map((v) => (
                <VisualCard key={`${v.kind}:${v.id}`} visual={v} fixed={fixed} onVisual={onVisual} />
              ))}
            </div>,
          )
        : null}
    </div>
  );
}

const MAX_POINTS = 8;

/** What the section covers, as plain lines. Enter adds a line below, Backspace on an empty line removes it. Saves on leaving. */
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
      <Label>What it covers</Label>
      <ul className="flex flex-col">
        {list.map((p, i) => (
          <li key={i} className="flex items-start gap-3">
            <span className="mt-4 h-1 w-1 shrink-0 rounded-full bg-ink" aria-hidden="true" />
            <textarea
              id={`pt-${i}`}
              value={p}
              rows={1}
              disabled={disabled}
              aria-label={`Point ${i + 1}`}
              placeholder="What this section covers"
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
              className="tw-bare w-full resize-none overflow-hidden rounded-aw-sm border-0 bg-transparent px-2 py-1.5 text-[15px] leading-relaxed text-ink shadow-none outline-none hover:bg-white focus:bg-white focus-visible:outline-none"
            />
          </li>
        ))}
      </ul>
      {disabled || list.length >= MAX_POINTS ? null : (
        <button
          type="button"
          className="aw-text-link inline-flex items-center gap-1 self-start pl-4 text-[13px]"
          onClick={() => {
            setList([...list, ""]);
            setFocus(list.length);
          }}
        >
          <I.plus />
          Add a line
        </button>
      )}
    </div>
  );
}

/** One planned image or module: its sketch, what it is, and Edit and Remove. Edit rewords it in place. */
function VisualCard({ visual: v, fixed, onVisual }: { visual: VisualChip; fixed: boolean; onVisual: OnVisual }) {
  const image = v.kind === "image";
  const alt = image ? v.note.replace(/^Alt text:\s*/, "") : "";
  // An image's words are what it shows and its alt text; a module's are its title and what it does.
  const [editing, setEditing] = useState(false);
  const [a, setA] = useState(v.title);
  const [z, setZ] = useState(image ? alt : v.shows);
  const ids = { a: `vis-a-${v.kind}-${v.id}`, z: `vis-z-${v.kind}-${v.id}` };
  const done = () => {
    const first = a.trim();
    const second = z.trim();
    setEditing(false);
    if (!first) return;
    if (image ? first !== v.title || second !== alt : first !== v.title || second !== v.shows) onVisual(v, image ? { shows: first, alt: second } : { title: first, purpose: second });
  };
  return (
    <div className="aw-visual">
      <VisualSketch sketch={v.sketch} />
      <div className="aw-visual__body">
        <span className="aw-visual__kind">{v.kindLabel}</span>
        {editing ? (
          <div className="flex flex-col gap-3">
            <Field label={image ? "What it shows" : "Title"} id={ids.a}>
              <input id={ids.a} value={a} onChange={(e) => setA(e.target.value)} onKeyDown={(e) => e.key === "Enter" && done()} className="aw-input" autoFocus />
            </Field>
            <Field label={image ? "Alt text" : "What it does"} id={ids.z}>
              {image ? (
                <input id={ids.z} value={z} onChange={(e) => setZ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && done()} className="aw-input" />
              ) : (
                <textarea id={ids.z} value={z} rows={2} onChange={(e) => setZ(e.target.value.replace(/\n/g, " "))} className="aw-input min-h-16 py-2" />
              )}
            </Field>
          </div>
        ) : (
          <>
            <span className="aw-visual__title">{v.title}</span>
            {v.shows ? <span className="aw-visual__shows">{v.shows}</span> : null}
            {v.note ? <span className="aw-visual__note">{v.note}</span> : null}
          </>
        )}
        {fixed ? null : (
          <span className="aw-visual__actions">
            {editing ? (
              <>
                <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm" onClick={done}>
                  Save
                </button>
                <button
                  type="button"
                  className="aw-btn aw-btn--ghost aw-btn--sm"
                  onClick={() => {
                    setA(v.title);
                    setZ(image ? alt : v.shows);
                    setEditing(false);
                  }}
                >
                  Cancel
                </button>
              </>
            ) : (
              <>
                <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm" aria-label={`Edit ${v.title}`} onClick={() => setEditing(true)}>
                  Edit
                </button>
                <button type="button" className="aw-btn aw-btn--ghost aw-btn--sm" aria-label={`Remove ${v.title}`} onClick={() => onVisual(v)}>
                  Remove
                </button>
              </>
            )}
          </span>
        )}
      </div>
    </div>
  );
}

/** Write asks once: what the draft is built from. */
function WriteDialog({
  sections,
  words,
  monthly,
  busy,
  onWrite,
  onClose,
}: {
  sections: number;
  words: number;
  monthly: number;
  busy: boolean;
  onWrite: () => void;
  onClose: () => void;
}) {
  const stat = (n: string, l: string) => (
    <div className="flex flex-col rounded-aw border border-rule-faint px-3 py-2">
      <span className="aw-num text-[18px] font-medium text-ink">{n}</span>
      <span className="text-[12px] text-muted">{l}</span>
    </div>
  );
  return (
    <Modal title="Write the draft?" onClose={onClose} width="max-w-md">
      <div className="flex flex-col gap-4">
        <p className="text-[13px] text-body">The writer drafts every section from this outline. You can edit the draft afterwards.</p>
        <div className="grid grid-cols-3 gap-2">
          {stat(String(sections), "sections")}
          {stat(`~${words.toLocaleString("en-US")}`, "words")}
          {stat(monthly ? monthly.toLocaleString("en-US") : "–", "searches a month")}
        </div>
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
