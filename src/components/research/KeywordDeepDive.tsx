"use client";

import { DateField, Dropdown } from "../Pickers";
import type { SupabaseClient } from "@supabase/supabase-js";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Serp } from "@/lib/briefTypes";
import { formatDate } from "@/lib/dates";
import { getSerp, listMembers, type CalendarItem, type Site } from "@/lib/db";
import { statusChoice, statusPatch, workflowStep, WORKFLOW } from "@/lib/library";
import { inWriterAt } from "@/lib/writerImport";
import { writerStateFor, type BriefLite, type DraftLite } from "@/lib/writerLibrary";
import type { RunAuth } from "@/lib/runner";
import { nextMonday, STAGES } from "@/lib/research";
import { writeState } from "@/lib/writeFlow";
import { Check, ExternalLink } from "../Icons";
import { openInLibrary } from "../writer/parts";
import { useWriteActions, WriteButton } from "../writer/WriteButton";
import type { WriterAccess } from "./ContentPiece";
import { SerpView } from "./SerpView";
import { Difficulty, FIELD, fmtCpc, fmtNum, SaveStamp, slugify, slugOf, STAGE_LABEL, StageTag, STATUS_PICK } from "./shared";

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
  /** Save a change. When it returns a promise, the Saved stamp waits for it. */
  onPatch: (p: Partial<CalendarItem>) => Promise<void> | void;
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
  // The stamp after an edit: nothing until the first one, then Saving and Saved.
  const [saved, setSaved] = useState<"saving" | "saved" | "error" | null>(null);
  const save = async (p: Partial<CalendarItem>) => {
    setSaved("saving");
    try {
      await onPatch(p);
      setSaved("saved");
    } catch {
      setSaved("error");
    }
  };

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
  const features = serp?.serp?.features.length ?? null;
  const brandId = site.brand_id;
  const brief = ws?.brief ?? null;
  const state = writeState({ item: { status: item.status, url: item.url ?? null }, brief, draft: ws?.draft ?? null });

  return (
    <div className="flex flex-col gap-4">
      <nav className="flex items-center gap-1.5 text-[13px] text-muted" aria-label="Breadcrumb">
        <button type="button" className="aw-text-link" onClick={onBack}>
          Editorial Calendar
        </button>
        <span aria-hidden="true">/</span>
        <span className="truncate text-ink">{item.keyword}</span>
      </nav>

      <header className="flex flex-wrap items-center gap-3">
        <h1 className="aw-h2 mr-1 min-w-0 truncate">{item.keyword}</h1>
        <StageTag stage={item.stage} />
        {saved ? <SaveStamp state={saved} /> : null}
        <span className="ml-auto flex flex-wrap items-center gap-2">
          {inWriterAt(item) ? (
            <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm" disabled={!brandId} onClick={() => brandId && openInLibrary(brandId, null)}>
              <Check size={14} /> In Library
            </button>
          ) : null}
          {state.kind === "busy" && brief && brandId ? (
            <button type="button" className="aw-text-link text-[13px]" onClick={() => openInLibrary(brandId, { kind: "brief", id: brief.id })}>
              Open outline
            </button>
          ) : null}
          <WriteButton state={state} busy={actions.busy.has(item.id)} canEdit={canEdit} onAct={() => void actions.act(item, state)} onOpen={() => actions.open(item, state)} />
        </span>
      </header>
      {error ? <p className="aw-error">{error}</p> : null}
      {actions.error ? <p className="aw-error">{actions.error}</p> : null}
      {brief?.status === "failed" && brief.error ? <p className="aw-error">{brief.error}</p> : null}
      {actions.overlays}

      <ol className="aw-frame grid grid-cols-5 gap-0 bg-white px-4 py-3" aria-label="Workflow">
        {WORKFLOW.map((w, n) => {
          const done = n < stepAt;
          const now = n === stepAt;
          return (
            <li key={w.id} className="flex min-w-0 flex-col gap-1.5" aria-current={now ? "step" : undefined}>
              <span className="flex items-center">
                <span
                  className={`aw-num flex h-6 w-6 shrink-0 items-center justify-center border text-[12px] ${done ? "border-brand bg-brand text-white" : now ? "border-brand text-brand" : "border-rule text-muted"}`}
                >
                  {done ? <Check size={14} /> : n + 1}
                </span>
                {n < WORKFLOW.length - 1 ? <span className={`h-px flex-1 ${done ? "bg-brand" : "bg-rule"}`} /> : null}
              </span>
              <span className={`truncate text-[13px] ${now ? "font-semibold text-brand" : done ? "text-ink" : "text-muted"}`}>{w.label}</span>
            </li>
          );
        })}
      </ol>

      <div className="aw-stats aw-stats--tight" style={{ ["--cols" as string]: 6 }}>
        <Stat label="Volume / mo" value={fmtNum(item.volume)} />
        <Stat label="KD %" value={<Difficulty kd={item.difficulty} />} />
        <Stat label="CPC" value={fmtCpc(item.cpc)} />
        <Stat label="Intent" value={<span className="capitalize">{item.intent ?? "–"}</span>} />
        <Stat label="Current ranking" value={item.current_rank ? `#${item.current_rank}` : <span className="text-muted">Not ranking</span>} />
        <Stat label="SERP features" value={features ?? "–"} />
      </div>

      {serp?.serp ? <SerpView serp={serp.serp} at={serp.serp_at} country={site.profile.country || "United States"} top={5} /> : null}

      <Details item={item} site={site} members={members} canEdit={canEdit} onPatch={save} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-[12px] text-muted">Added {formatDate(item.created_at, { year: true })}</span>
        {canEdit ? (
          <button type="button" className="aw-text-link text-[13px] text-neg!" onClick={onRemove}>
            Delete from Editorial Calendar
          </button>
        ) : null}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="aw-stat">
      <div className="aw-stat__lab">{label}</div>
      <span className="aw-stat__num">{value}</span>
    </div>
  );
}

/** Every detail of a piece, the same as its row in the Content Plan list, editable where the list is. */
function Details({ item, site, members, canEdit, onPatch }: { item: CalendarItem; site: Site; members: string[]; canEdit: boolean; onPatch: (p: Partial<CalendarItem>) => Promise<void> | void }) {
  const [keyword, setKeyword] = useState(item.keyword);
  const [slug, setSlug] = useState(slugOf(item));
  const [theme, setTheme] = useState(item.theme ?? "");
  const [also, setAlso] = useState(item.secondary.join(", "));
  const [notes, setNotes] = useState(item.notes ?? "");
  const [url, setUrl] = useState(item.url ?? "");
  const [extra, setExtra] = useState<Record<string, string>>(() => Object.fromEntries((site.profile.columns ?? []).map((c) => [c.id, String(item.extra?.[c.id] ?? "")])));
  const field = (label: string, input: React.ReactNode, wide = false) => (
    <label className={`flex min-w-0 flex-col gap-1 ${wide ? "sm:col-span-2 lg:col-span-3" : ""}`}>
      <span className="aw-label">{label}</span>
      {input}
    </label>
  );
  const box = `${FIELD} h-9 w-full rounded-md text-[13px]!`;
  const status = statusChoice(item);
  const owners = [...new Set([...(item.owner ? [item.owner] : []), ...members])];

  return (
    <section className="aw-frame grid gap-x-4 gap-y-3 bg-white p-4 sm:grid-cols-2 lg:grid-cols-3">
      {field("Keyword", <input value={keyword} disabled={!canEdit} onChange={(e) => setKeyword(e.target.value)} onBlur={() => keyword.trim() && keyword !== item.keyword && onPatch({ keyword: keyword.trim() })} className={box} />)}
      {field(
        "Suggested slug",
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
      {field(
        "Funnel stage",
        <Dropdown label="Funnel stage" value={item.stage ?? ""} disabled={!canEdit} onChange={(v) => onPatch({ stage: (v || null) as CalendarItem["stage"] })} className={box} options={[...STAGES.map((x) => ({ id: x.id as string, label: STAGE_LABEL[x.id] })), { id: "", label: "None" }]} />,
      )}
      {field(
        "Content status",
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
      {field("Publish date", <DateField label="Publish date" value={item.due_date ?? ""} disabled={!canEdit} onChange={(v) => onPatch({ due_date: v })} className={box} placeholder="Not scheduled" />)}
      {field("Owner", <Dropdown label="Owner" value={item.owner ?? ""} disabled={!canEdit} onChange={(v) => onPatch({ owner: v || null })} className={box} options={[{ id: "", label: "Unassigned" }, ...owners.map((m) => ({ id: m, label: m }))]} />)}
      {field(
        "Job",
        <Dropdown label="Job" value={item.action} disabled={!canEdit} onChange={(v) => onPatch({ action: v })} className={box} options={[{ id: "new" as const, label: "New page" }, { id: "update" as const, label: "Update page" }]} />,
      )}
      {field("Theme", <input value={theme} disabled={!canEdit} onChange={(e) => setTheme(e.target.value)} onBlur={() => theme !== (item.theme ?? "") && onPatch({ theme: theme.trim() || null })} className={box} />)}
      {field(
        "Live URL",
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
        ? field(
            "Page to update",
            <a href={item.current_url} target="_blank" rel="noopener noreferrer" className="flex h-9 items-center truncate text-[13px]">
              <span className="truncate">{item.current_url.replace(/^https?:\/\/(www\.)?/, "")}</span>
              <ExternalLink size={14} className="ml-1 shrink-0" />
            </a>,
          )
        : null}
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
        true,
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
        ),
      )}
      {field("Notes", <textarea value={notes} disabled={!canEdit} onChange={(e) => setNotes(e.target.value)} onBlur={() => notes !== (item.notes ?? "") && onPatch({ notes: notes || null })} rows={2} className="aw-textarea text-[13px]!" />, true)}
    </section>
  );
}
