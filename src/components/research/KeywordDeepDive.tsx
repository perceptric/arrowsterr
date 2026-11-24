"use client";

import { DateField, Dropdown } from "../Pickers";
import type { SupabaseClient } from "@supabase/supabase-js";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Serp } from "@/lib/briefTypes";
import { getSerp, listMembers, type CalendarItem, type Site } from "@/lib/db";
import { statusChoice, statusPatch, workflowStep, WORKFLOW } from "@/lib/library";
import { inWriterAt } from "@/lib/writerImport";
import { writerStateFor, type BriefLite, type DraftLite } from "@/lib/writerLibrary";
import type { RunAuth } from "@/lib/runner";
import { nextMonday, STAGES } from "@/lib/research";
import { writeState } from "@/lib/writeFlow";
import { NavIcon } from "../NavIcon";
import { openInLibrary } from "../writer/parts";
import { useWriteActions, WriteButton } from "../writer/WriteButton";
import type { WriterAccess } from "./shared";
import { FIELD, fmtCpc, fmtNum, slugify, slugOf, STAGE_LABEL, StageTag, STATUS_PICK, statusLabel, Tick } from "./shared";

// Each workflow step's icon and what happens in it.
const STEP_LOOK: Record<string, { icon: string; hint: string }> = {
  planned: { icon: "bulb", hint: "On the plan" },
  brief: { icon: "doc", hint: "Research and outline" },
  draft: { icon: "pen", hint: "The writer drafts it" },
  review: { icon: "eye", hint: "An editor checks it" },
  published: { icon: "globe", hint: "Live on your site" },
};

/** Keyword difficulty as a half-circle meter with its number and word. */
function DifficultyMeter({ kd }: { kd: number | null }) {
  if (kd === null || kd === undefined) return <span className="text-muted">–</span>;
  const word = kd < 30 ? "Easy" : kd < 50 ? "Medium" : kd < 70 ? "Hard" : "Very hard";
  const color = kd < 30 ? "var(--aw-pos)" : kd < 50 ? "var(--aw-warn)" : "var(--aw-neg)";
  const arc = 88; // the half circle's length
  return (
    <span className="flex items-end gap-3">
      <svg viewBox="0 0 72 44" width="60" height="37" role="img" aria-label={`Difficulty ${kd} out of 100, ${word}`} fill="none" strokeLinecap="round">
        <path d="M8 40 A28 28 0 0 1 64 40" stroke="var(--v10-border)" strokeWidth="7" />
        <path d="M8 40 A28 28 0 0 1 64 40" stroke={color} strokeWidth="7" strokeDasharray={`${(Math.min(100, Math.max(0, kd)) / 100) * arc} ${arc}`} />
      </svg>
      <span className="flex flex-col leading-none">
        <span style={{ color }}>{kd}</span>
        <span className="mt-1 text-[12px] font-semibold tracking-normal" style={{ color }}>
          {word}
        </span>
      </span>
    </span>
  );
}

const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/**
 * The Keyword Deep Dive: one screen with the keyword's numbers, where it stands, its details and what to do about it.
 * Briefs and drafts are made and kept in the Library.
 */
export function KeywordDeepDive({
  sb,
  auth,
  site,
  item,
  canEdit,
  writer = { open: true },
  onPatch,
  onRemove,
  onBack,
  onImport,
  onRefresh,
}: {
  sb: SupabaseClient;
  auth: RunAuth;
  site: Site;
  item: CalendarItem;
  canEdit: boolean;
  writer?: WriterAccess;
  onPatch: (p: Partial<CalendarItem>) => void;
  onRemove: () => void;
  onBack: () => void;
  /** Import to the Library. Safe to call again. */
  onImport: () => Promise<void> | void;
  /** Reload the Editorial Calendar, after the writer moved this piece's status on. */
  onRefresh: () => void;
}) {
  const [serp, setSerp] = useState<{ serp: Serp | null; serp_at: string | null; missing?: boolean } | null>(null);
  const [ws, setWs] = useState<{ brief: BriefLite | null; draft: DraftLite | null } | null>(null);
  const [members, setMembers] = useState<string[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    listMembers(sb, auth.workspaceId)
      .then((m) => setMembers(m.map((x) => x.email).filter((e): e is string => Boolean(e))))
      .catch(() => {});
  }, [sb, auth.workspaceId]);

  // When a brief or draft finishes, the server moves the piece's status on. Reload the calendar so both screens show it.
  const wasMaking = useRef(false);
  const loadWriter = useCallback(async () => {
    try {
      const next = await writerStateFor(sb, item.id);
      const now = next.brief?.status === "generating" || next.draft?.status === "generating";
      if (wasMaking.current && !now) onRefresh();
      wasMaking.current = now;
      setWs(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [sb, item.id, onRefresh]);

  useEffect(() => {
    // Loading the writer's brief and draft and the SERP analysis when the keyword opens is the point of this effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadWriter();
    getSerp(sb, item.id).then(setSerp).catch(() => setSerp({ serp: null, serp_at: null }));
  }, [sb, item.id, loadWriter]);

  // The same Write button as the Editorial Calendar; the first outline puts the keyword in the Library.
  const actions = useWriteActions({
    sb,
    auth,
    brandId: site.brand_id ?? null,
    siteId: site.id,
    canEdit,
    onUpgrade: writer.open ? undefined : writer.onUpgrade,
    onChanged: () => void loadWriter(),
    beforeOutline: async () => {
      if (!inWriterAt(item)) await onImport();
    },
  });

  const making = ws?.brief?.status === "generating" || ws?.draft?.status === "generating";
  useEffect(() => {
    if (!making) return;
    const t = setInterval(loadWriter, 5000);
    return () => clearInterval(t);
  }, [making, loadWriter]);

  const step = workflowStep(item.status);
  const stepAt = WORKFLOW.findIndex((w) => w.id === step);
  const label = statusLabel(item);
  const tone = STATUS_PICK.find((x) => x.label === label)?.tone ?? "aw-status--pending";
  const features = serp?.serp?.features.length ?? null;
  const brandId = site.brand_id;
  const brief = ws?.brief ?? null;
  const state = writeState({ item: { status: item.status, url: item.url ?? null }, brief, draft: ws?.draft ?? null });

  return (
    <div className="flex flex-col gap-5">
      <nav className="flex items-center gap-1.5 text-[13px] text-muted" aria-label="Breadcrumb">
        <button type="button" className="aw-text-link" onClick={onBack}>
          Editorial Calendar
        </button>
        <span aria-hidden="true">/</span>
        <span className="truncate text-ink">{item.keyword}</span>
      </nav>

      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`aw-status ${tone}`}>{label}</span>
            <StageTag stage={item.stage} />
          </div>
          <h1 className="aw-h2 min-w-0 truncate">{item.keyword}</h1>
        </div>
        <span className="flex flex-wrap items-center gap-2">
          {inWriterAt(item) ? (
            <button type="button" className="aw-btn aw-btn--ghost aw-btn--sm" disabled={!brandId} onClick={() => brandId && openInLibrary(brandId, null)}>
              <Tick /> In Drafts
            </button>
          ) : null}
          <WriteButton state={state} busy={actions.busy.has(item.id)} canEdit={canEdit} onAct={() => void actions.act(item, state)} onOpen={() => actions.open(item, state)} />
        </span>
      </header>
      {error ? <p className="aw-error">{error}</p> : null}
      {actions.error ? <p className="aw-error">{actions.error}</p> : null}
      {brief?.status === "failed" && brief.error ? <p className="aw-error">{brief.error}</p> : null}
      {actions.overlays}

      <ol className="aw-steps aw-steps--icons" aria-label="Workflow">
        {WORKFLOW.map((w, n) => {
          const done = n < stepAt;
          const now = n === stepAt;
          const look = STEP_LOOK[w.id];
          return (
            <li key={w.id} className={`aw-steps__item ${now ? "is-on" : done ? "is-done" : ""}`} aria-current={now ? "step" : undefined}>
              <span className="aw-steps__step">
                <span className="aw-steps__dot">
                  <NavIcon name={done ? "tick" : look.icon} />
                </span>
                <span className="aw-steps__label">
                  {w.label}
                  <span className="aw-steps__hint">{now ? "You are here" : done ? "Done" : look.hint}</span>
                </span>
              </span>
            </li>
          );
        })}
      </ol>

      <div className="aw-stats aw-stats--tight" style={{ ["--cols" as string]: 6 }}>
        <Stat icon="report" tone="brand" label="Search volume" value={<>{fmtNum(item.volume)} <span className="text-[13px] font-normal tracking-normal text-muted">/ mo</span></>} />
        <Stat icon="gauge" tone={kdTone(item.difficulty)} label="Keyword difficulty" value={<DifficultyMeter kd={item.difficulty} />} />
        <Stat icon="dollar" tone="pos" label="CPC" value={fmtCpc(item.cpc)} />
        <Stat icon="compass" tone="brand" label="Search intent" value={<span className="capitalize">{item.intent ?? "–"}</span>} />
        <Stat icon="target" tone={item.current_rank ? "pos" : ""} label="Current ranking" value={item.current_rank ? `#${item.current_rank}` : <span className="text-muted">Not ranking</span>} />
        <Stat icon="snippet" tone="" label="SERP features" value={features ?? <span className="text-muted">–</span>} />
      </div>

      <Details item={item} site={site} members={members} canEdit={canEdit} onPatch={onPatch} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="flex items-center gap-1.5 text-[12px] text-muted">
          <NavIcon name="clock" />
          Added {item.created_at ? new Date(item.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "–"}
        </span>
        {canEdit ? (
          <button type="button" className="aw-text-link inline-flex items-center gap-1.5 text-[13px] text-neg!" onClick={onRemove}>
            <NavIcon name="x" />
            Remove from Editorial Calendar
          </button>
        ) : null}
      </div>
    </div>
  );
}

const kdTone = (kd: number | null) => (kd === null || kd === undefined ? "" : kd < 30 ? "pos" : kd < 50 ? "warn" : "neg");

function Stat({ icon, tone, label, value }: { icon: string; tone: string; label: string; value: React.ReactNode }) {
  return (
    <div className="aw-stat">
      <div className="aw-stat__lab">
        <span className={`aw-glyph ${tone ? `aw-glyph--${tone}` : ""}`}>
          <NavIcon name={icon} />
        </span>
        {label}
      </div>
      <span className="aw-stat__num">{value}</span>
    </div>
  );
}

/** Every detail of a piece, the same as its row in the Content Plan list, editable where the list is. */
function Details({ item, site, members, canEdit, onPatch }: { item: CalendarItem; site: Site; members: string[]; canEdit: boolean; onPatch: (p: Partial<CalendarItem>) => void }) {
  const [keyword, setKeyword] = useState(item.keyword);
  const [slug, setSlug] = useState(slugOf(item));
  const [theme, setTheme] = useState(item.theme ?? "");
  const [also, setAlso] = useState(item.secondary.join(", "));
  const [notes, setNotes] = useState(item.notes ?? "");
  const [url, setUrl] = useState(item.url ?? "");
  const [extra, setExtra] = useState<Record<string, string>>(() => Object.fromEntries((site.profile.columns ?? []).map((c) => [c.id, String(item.extra?.[c.id] ?? "")])));
  // A row in the Details rail: the name on the left, the control on the right.
  const row = (label: string, icon: string, input: React.ReactNode) => (
    <label className="aw-props__row">
      <span className="aw-props__label">
        <NavIcon name={icon} />
        {label}
      </span>
      <span className="min-w-0 flex-1">{input}</span>
    </label>
  );
  // A full-width field in the main column.
  const field = (label: string, input: React.ReactNode, icon = "note") => (
    <label className="flex min-w-0 flex-col gap-1.5">
      <span className="aw-label flex items-center gap-2">
        <span className="text-muted">
          <NavIcon name={icon} />
        </span>
        {label}
      </span>
      {input}
    </label>
  );
  const box = `${FIELD} h-9 w-full rounded-aw text-[13px]!`;
  const status = statusChoice(item);
  const owners = [...new Set([...(item.owner ? [item.owner] : []), ...members])];

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
      <section className="aw-frame flex flex-col gap-4 bg-white p-4" aria-label="Keywords and notes">
        {field("Theme", <input value={theme} disabled={!canEdit} onChange={(e) => setTheme(e.target.value)} onBlur={() => theme !== (item.theme ?? "") && onPatch({ theme: theme.trim() || null })} className={box} />, "tag")}
        {field(
          "Related keywords",
          <input
            value={also}
            disabled={!canEdit}
            onChange={(e) => setAlso(e.target.value)}
            onBlur={() => {
              const list = also.split(",").map((x) => x.trim()).filter(Boolean);
              if (list.join("|") !== item.secondary.join("|")) onPatch({ secondary: list });
            }}
            placeholder="Other keywords this page covers, with commas"
            className={box}
          />,
          "chain",
        )}
        {(site.profile.columns ?? []).map((c) =>
          field(
            c.name,
            <input
              type={c.type === "date" ? "date" : c.type === "number" ? "number" : "text"}
              value={extra[c.id] ?? ""}
              disabled={!canEdit}
              onChange={(e) => setExtra((x) => ({ ...x, [c.id]: e.target.value }))}
              onBlur={() => {
                const v = extra[c.id] ?? "";
                if (v === String(item.extra?.[c.id] ?? "")) return;
                onPatch({ extra: { ...(item.extra ?? {}), [c.id]: v === "" ? null : c.type === "number" ? Number(v) : v } });
              }}
              className={box}
            />,
            "lines",
          ),
        )}
        {field("Notes", <textarea value={notes} disabled={!canEdit} onChange={(e) => setNotes(e.target.value)} onBlur={() => notes !== (item.notes ?? "") && onPatch({ notes: notes || null })} rows={4} className="aw-textarea text-[13px]!" />)}
  
      </section>
      <section className="aw-frame aw-props bg-white" aria-label="Details">
        <h2 className="aw-props__title">Details</h2>
        {row(
          "Status",
          "status",
          <Dropdown
            label="Content status"
            value={status}
            disabled={!canEdit}
            onChange={(v) => {
              onPatch(statusPatch(v, item.due_date, isoDay(nextMonday())));
            }}
            className={box}
            options={STATUS_PICK.map((x) => ({ id: x.id as string, label: x.label }))}
          />,
        )}
        {row("Publish date", "calendar", <DateField label="Publish date" value={item.due_date ?? ""} disabled={!canEdit} onChange={(v) => onPatch({ due_date: v })} className={box} placeholder="Not scheduled" />)}
        {row("Owner", "user", <Dropdown label="Owner" value={item.owner ?? ""} disabled={!canEdit} onChange={(v) => onPatch({ owner: v || null })} className={box} options={[{ id: "", label: "Unassigned" }, ...owners.map((m) => ({ id: m, label: m }))]} />)}
        {row(
          "Impact",
          "zap",
          <Dropdown label="Impact" value={item.stage ?? ""} disabled={!canEdit} onChange={(v) => onPatch({ stage: (v || null) as CalendarItem["stage"] })} className={box} options={[...STAGES.map((x) => ({ id: x.id as string, label: STAGE_LABEL[x.id] })), { id: "", label: "None" }]} />,
        )}
        {row(
          "Job",
          "briefcase",
          <Dropdown label="Job" value={item.action} disabled={!canEdit} onChange={(v) => onPatch({ action: v })} className={box} options={[{ id: "new" as const, label: "New page" }, { id: "update" as const, label: "Update page" }]} />,
        )}
        {row(
          "Slug",
          "hash",
          <input
            value={slug}
            disabled={!canEdit}
            onChange={(e) => setSlug(e.target.value)}
            onBlur={() => {
              const next = slug.trim() ? `/${slugify(slug)}` : null;
              if (next !== slugOf(item)) onPatch({ extra: { ...(item.extra ?? {}), slug: next } });
              setSlug(next ?? slugOf({ ...item, extra: { ...(item.extra ?? {}), slug: null } }));
            }}
            className={`${box} font-mono text-[12px]!`}
          />,
        )}
        {row(
          "Live URL",
          "globe",
          <input
            value={url}
            disabled={!canEdit}
            onChange={(e) => setUrl(e.target.value)}
            onBlur={() => url !== (item.url ?? "") && onPatch(url && item.action === "new" ? { url, status: "published" } : { url: url || null })}
            placeholder="https://"
            className={box}
          />,
        )}
        {item.action === "update" && item.current_url
          ? row(
              "Page to update",
              "doc",
              <a href={item.current_url} target="_blank" rel="noopener noreferrer" className="flex h-9 items-center truncate text-[13px]">
                {item.current_url.replace(/^https?:\/\/(www\.)?/, "")} ↗
              </a>,
            )
          : null}
        {row("Keyword", "key", <input value={keyword} disabled={!canEdit} onChange={(e) => setKeyword(e.target.value)} onBlur={() => keyword.trim() && keyword !== item.keyword && onPatch({ keyword: keyword.trim() })} className={box} />)}
      </section>
    </div>
  );
}
