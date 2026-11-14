"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { useCallback, useEffect, useState } from "react";
import {
  cardsFrom,
  visualsOf,
  type FactNote,
  type SectionCard,
} from "@/lib/articleNotes";
import type { RunAuth } from "@/lib/runner";
import type { WriterBrief } from "@/lib/writerBrief";
import { getBrief, type FullBrief } from "@/lib/writerLibrary";
import { Pop } from "../Pickers";
import { post } from "../research/shared";
import { Thinking } from "../ui";
import { StateTag, usePoll } from "./parts";

// The outline screen (docs/draft-and-write-build.md, Phase 1): the brief's job, point of view, reader and shape, the
// H1, slug and meta, then one row per section with its heading, visuals and words. The info button opens the
// section's card (its job, points, the fact notes behind it and what's missing). Write approves the outline and starts
// the draft. Every edit saves through the agentic-writer "edit" action (editBrief).

type Patch = Record<string, unknown>;

const svg = (d: React.ReactNode) => (
  <svg
    viewBox="0 0 24 24"
    width={16}
    height={16}
    fill="none"
    stroke="currentColor"
    strokeWidth={1.8}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {d}
  </svg>
);
const InfoIcon = () =>
  svg(
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 8h.01" />
    </>,
  );
const XIcon = () => svg(<path d="M6 6l12 12M18 6L6 18" />);

export function OutlineView({
  sb,
  auth,
  id,
  canEdit,
  onBack,
  onDraft,
}: {
  sb: SupabaseClient;
  auth: RunAuth;
  id: string;
  canEdit: boolean;
  onBack: () => void;
  onDraft: (draftId: string) => void;
}) {
  const [row, setRow] = useState<FullBrief | null | undefined>(undefined);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [writing, setWriting] = useState(false);
  const [info, setInfo] = useState<{ key: string; at: DOMRect } | null>(null);

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

  async function save(patch: Patch) {
    if (!canEdit) return;
    setSaving(true);
    try {
      const out = await post<{ brief: WriterBrief }>(
        auth,
        "/api/agentic-writer",
        { action: "edit", briefId: id, patch },
      );
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
      const out = await post<{ draftId: string }>(auth, "/api/agentic-writer", {
        action: "draft",
        briefId: id,
      });
      onDraft(out.draftId);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setWriting(false);
    }
  }

  if (row === undefined) return <Thinking text="Opening the outline..." />;
  const head = row?.brief?.h1 || row?.keyword || "Outline";
  const top = (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <span className="flex min-w-0 flex-wrap items-center gap-3">
        <button
          type="button"
          className="aw-text-link shrink-0 text-[13px]"
          onClick={onBack}
        >
          ← Drafts
        </button>
        <span className="min-w-0 text-[15px] font-medium text-ink [overflow-wrap:anywhere]">
          {head}
        </span>
        {row ? <StateTag status={row.status} /> : null}
      </span>
      {row?.brief &&
      canEdit &&
      (row.status === "ready" || row.status === "approved") ? (
        <button
          type="button"
          className="aw-btn aw-btn--primary aw-btn--sm"
          disabled={writing || saving}
          onClick={() => void write()}
        >
          {writing ? "Starting" : "Write"}
        </button>
      ) : null}
    </div>
  );
  if (!row) return top;
  if (!row.brief)
    return (
      <div className="flex flex-col gap-5">
        {top}
        {row.error ? <p className="aw-error">{row.error}</p> : null}
        {error ? <p className="aw-error">{error}</p> : null}
        {row.status === "generating" ? (
          <Thinking text="Writing the outline..." />
        ) : null}
      </div>
    );

  const b = row.brief;
  const cards = b.cards?.length ? b.cards : cardsFrom(b);
  const editable = canEdit && row.status !== "generating";
  const card = info ? cards.find((c) => c.key === info.key) : undefined;
  const lines: [string, string | undefined][] = [
    ["Job", b.job],
    ["Point of view", b.pov],
    ["Reader", b.reader],
    ["Leading word", b.leadingWord],
    [
      "Shape",
      b.shape
        ? `${b.shape.picked}${b.shape.why ? `. ${b.shape.why}` : ""}`
        : undefined,
    ],
  ];

  return (
    <div className="flex flex-col gap-6">
      {top}
      {row.error ? <p className="aw-error">{row.error}</p> : null}
      {error ? <p className="aw-error">{error}</p> : null}

      <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-[140px_1fr]">
        {lines
          .filter(([, v]) => v)
          .map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-[13px] text-muted">{k}</dt>
              <dd className="min-w-0 text-[13px] text-ink [overflow-wrap:break-word]">
                {v}
              </dd>
            </div>
          ))}
      </dl>

      <div className="flex flex-col gap-3">
        <Line
          label="H1"
          value={b.h1}
          disabled={!editable}
          onSave={(v) => save({ h1: v })}
        />
        <Line
          label="Slug"
          value={b.slug}
          disabled={!editable}
          onSave={(v) => save({ slug: v })}
        />
        <Line
          label="Meta"
          value={b.metaDescription}
          multi
          disabled={!editable}
          onSave={(v) => save({ metaDescription: v })}
        />
      </div>

      <div className="aw-frame flex flex-col">
        {cards.map((c, i) => (
          <SectionRow
            key={c.key}
            card={c}
            first={i === 0}
            chips={visualsOf(b, c)}
            disabled={!editable || !b.cards?.length}
            onHeading={(h2) => save({ cards: [{ key: c.key, h2 }] })}
            onChip={(chip) =>
              save(
                chip.kind === "image"
                  ? { removeImages: [chip.id] }
                  : { removeModules: [chip.id] },
              )
            }
            onInfo={(at) =>
              setInfo((x) => (x?.key === c.key ? null : { key: c.key, at }))
            }
          />
        ))}
      </div>

      {info && card ? (
        <Pop
          anchor={info.at}
          onClose={() => setInfo(null)}
          width={420}
          label={card.h2 || "Intro"}
        >
          <CardInfo
            card={card}
            notes={b.notes ?? []}
            sources={b.research.sources}
            disabled={!editable || !b.cards?.length}
            onSave={(patch) => save({ cards: [{ key: card.key, ...patch }] })}
          />
        </Pop>
      ) : null}
    </div>
  );
}

function Line({
  label,
  value,
  multi,
  disabled,
  onSave,
}: {
  label: string;
  value: string;
  multi?: boolean;
  disabled: boolean;
  onSave: (v: string) => void;
}) {
  const [v, setV] = useState(value);
  useEffect(() => {
    // The field follows the saved value when the brief reloads.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setV(value);
  }, [value]);
  const done = () => {
    if (v.trim() && v.trim() !== value) onSave(v.trim());
    else setV(value);
  };
  return (
    <label className="grid grid-cols-1 items-start gap-1 sm:grid-cols-[140px_1fr] sm:gap-6">
      <span className="pt-2 text-[13px] text-muted">{label}</span>
      {multi ? (
        <textarea
          value={v}
          rows={2}
          disabled={disabled}
          onChange={(e) => setV(e.target.value)}
          onBlur={done}
          className="aw-input min-h-24 py-2"
        />
      ) : (
        <input
          value={v}
          disabled={disabled}
          onChange={(e) => setV(e.target.value)}
          onBlur={done}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
          className="aw-input"
        />
      )}
    </label>
  );
}

function SectionRow({
  card,
  first,
  chips,
  disabled,
  onHeading,
  onChip,
  onInfo,
}: {
  card: SectionCard;
  first: boolean;
  chips: ReturnType<typeof visualsOf>;
  disabled: boolean;
  onHeading: (h2: string) => void;
  onChip: (chip: ReturnType<typeof visualsOf>[number]) => void;
  onInfo: (at: DOMRect) => void;
}) {
  const [h2, setH2] = useState(card.h2);
  useEffect(() => {
    // The heading follows the saved value when the brief reloads.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setH2(card.h2);
  }, [card.h2]);
  const intro = card.key === "intro";
  return (
    <div
      className={`flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-start sm:gap-3 ${first ? "" : "border-t border-rule-faint"}`}
    >
      <span className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
        <span className="min-w-0 flex-1 basis-56">
          {intro ? (
            <span className="text-[14px] font-medium text-ink">Intro</span>
          ) : (
            <input
              value={h2}
              disabled={disabled}
              aria-label="Heading"
              onChange={(e) => setH2(e.target.value)}
              onBlur={() =>
                h2.trim() && h2.trim() !== card.h2
                  ? onHeading(h2.trim())
                  : setH2(card.h2)
              }
              onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
              className="aw-input w-full"
            />
          )}
        </span>
        {chips.length ? (
          <span className="flex flex-wrap items-center gap-2">
            {chips.map((c) => (
              <button
                key={`${c.kind}:${c.id}`}
                type="button"
                className="aw-chip aw-chip--btn is-on"
                aria-pressed="true"
                disabled={disabled}
                title="Remove"
                onClick={() => onChip(c)}
              >
                {c.label}
              </button>
            ))}
          </span>
        ) : null}
      </span>
      <span className="flex shrink-0 items-center gap-3 sm:min-h-10">
        <span className="text-[13px] text-muted tabular-nums">
          {card.words} words
        </span>
        {card.gaps.length ? (
          <span className="aw-status aw-status--warn">
            {card.gaps.length} needed
          </span>
        ) : null}
        <button
          type="button"
          className="aw-icon-btn flex h-8 w-8 items-center justify-center"
          aria-label="Section card"
          title="Section card"
          onClick={(e) => onInfo(e.currentTarget.getBoundingClientRect())}
        >
          <InfoIcon />
        </button>
      </span>
    </div>
  );
}

function CardInfo({
  card,
  notes,
  sources,
  disabled,
  onSave,
}: {
  card: SectionCard;
  notes: FactNote[];
  sources: { n: number; domain: string; url: string }[];
  disabled: boolean;
  onSave: (patch: Patch) => void;
}) {
  const [points, setPoints] = useState(card.points.join("\n"));
  useEffect(() => {
    // The points follow the saved card when the brief reloads.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPoints(card.points.join("\n"));
  }, [card.points]);
  const facts = card.facts
    .map((f) => notes.find((n) => n.id === f))
    .filter((n): n is FactNote => Boolean(n));
  const savePoints = () => {
    const next = points
      .split("\n")
      .map((p) => p.trim())
      .filter(Boolean);
    if (next.join("\n") !== card.points.join("\n")) onSave({ points: next });
  };
  return (
    <div className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto p-4">
      {card.job ? (
        <div className="flex flex-col gap-1">
          <span className="aw-micro">Job</span>
          <p className="text-[13px] text-ink [overflow-wrap:break-word]">
            {card.job}
          </p>
        </div>
      ) : null}
      <label className="flex flex-col gap-1">
        <span className="aw-micro">Points</span>
        <textarea
          value={points}
          rows={Math.min(8, Math.max(3, card.points.length + 1))}
          disabled={disabled}
          onChange={(e) => setPoints(e.target.value)}
          onBlur={savePoints}
          className="aw-input py-2"
        />
      </label>
      <div className="flex flex-col gap-2">
        <span className="aw-micro">Facts</span>
        {facts.length ? (
          facts.map((n) => (
            <div key={n.id} className="flex items-start gap-2">
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <p className="text-[13px] text-ink [overflow-wrap:break-word]">
                  {n.fact}
                </p>
                <p className="text-[12px] text-muted [overflow-wrap:break-word]">
                  &quot;{n.quote}&quot;{" "}
                  {sources.find((s) => s.n === n.source)?.domain ?? ""}
                </p>
              </div>
              {disabled ? null : (
                <button
                  type="button"
                  className="aw-icon-btn flex h-7 w-7 shrink-0 items-center justify-center"
                  aria-label="Remove fact"
                  title="Remove fact"
                  onClick={() =>
                    onSave({ facts: card.facts.filter((f) => f !== n.id) })
                  }
                >
                  <XIcon />
                </button>
              )}
            </div>
          ))
        ) : (
          <p className="text-[13px] text-muted">None</p>
        )}
      </div>
      {card.gaps.length ? (
        <div className="flex flex-col gap-1">
          <span className="aw-micro">Detail needed</span>
          {card.gaps.map((g) => (
            <p
              key={g}
              className="text-[13px] text-ink [overflow-wrap:break-word]"
            >
              {g}
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}
