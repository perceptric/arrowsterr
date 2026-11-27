"use client";

import { DateField, Dropdown } from "../Pickers";
import type { SupabaseClient } from "@supabase/supabase-js";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Serp } from "@/lib/briefTypes";
import { getSerp, listMembers, type CalendarItem, type Site } from "@/lib/db";
import { statusChoice, statusPatch } from "@/lib/library";
import { inWriterAt } from "@/lib/writerImport";
import { writerStateFor, type BriefLite, type DraftLite } from "@/lib/writerLibrary";
import type { RunAuth } from "@/lib/runner";
import { nextMonday, STAGES } from "@/lib/research";
import { writeState } from "@/lib/writeFlow";
import { openInLibrary } from "../writer/parts";
import { useWriteActions, WriteButton } from "../writer/WriteButton";
import type { WriterAccess } from "./shared";
import { FIELD, fmtCpc, slugify, slugOf, STAGE_LABEL, STATUS_PICK, Tick } from "./shared";
import { errorText } from "@/lib/errors";
import { ErrorNote } from "../ui";

const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** How hard a keyword is to rank for, in words and its color. */
function ease(kd: number | null): { word: string; tone: string } | null {
  if (kd === null || kd === undefined) return null;
  if (kd < 30) return { word: "Easy to rank", tone: "text-pos" };
  if (kd < 50) return { word: "Medium to rank", tone: "text-warn" };
  return { word: kd < 70 ? "Hard to rank" : "Very hard to rank", tone: "text-neg" };
}

/**
 * The keyword's page, kept simple: the keyword with its searches, ease and intent in one line, the Write button, one
 * card with what people change most (status, date, owner, the page to update), a note for the writer, and the rest
 * under More details. Briefs and drafts are made and kept in Drafts.
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
      setError(errorText(e));
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

  const features = serp?.serp?.features.length ?? null;
  const brandId = site.brand_id;
  const brief = ws?.brief ?? null;
  const state = writeState({ item: { status: item.status, url: item.url ?? null }, brief, draft: ws?.draft ?? null });
  const kd = ease(item.difficulty);
  const facts = [
    item.volume ? <span key="v">{item.volume.toLocaleString("en-US")} searches a month</span> : null,
    kd ? (
      <span key="kd" className={`font-medium ${kd.tone}`}>
        {kd.word}
      </span>
    ) : null,
    item.intent ? (
      <span key="i" className="capitalize">
        {item.intent}
      </span>
    ) : null,
  ].filter(Boolean);

  return (
    <div className="mx-auto flex w-full max-w-[760px] flex-col gap-8 pb-10">
      <button type="button" className="aw-text-link self-start text-[13px]" onClick={onBack}>
        ← Editorial Calendar
      </button>

      <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
        <div className="flex min-w-0 flex-col gap-3">
          <h1 className="text-[32px] leading-tight font-bold tracking-tight text-ink [overflow-wrap:anywhere]">{item.keyword}</h1>
          {facts.length ? (
            <p className="flex flex-wrap gap-x-2 text-[15px] text-muted">
              {facts.map((f, i) => (
                <span key={i} className="flex gap-2">
                  {i ? <span aria-hidden="true">·</span> : null}
                  {f}
                </span>
              ))}
            </p>
          ) : null}
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
      {error ? <ErrorNote error={error} /> : null}
      {actions.error ? <ErrorNote error={actions.error} /> : null}
      {brief?.status === "failed" && brief.error ? <ErrorNote error={brief.error} /> : null}
      {actions.overlays}

      <Details item={item} site={site} members={members} features={features} canEdit={canEdit} onPatch={onPatch} />

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-rule-faint pt-5">
        <span className="text-[13px] text-muted">Added {item.created_at ? new Date(item.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "–"}</span>
        {canEdit ? (
          <button type="button" className="aw-text-link text-[13px] text-neg!" onClick={onRemove}>
            Remove from Editorial Calendar
          </button>
        ) : null}
      </div>
    </div>
  );
}

/**
 * The piece's details: the four people change most in one card, a note for the writer, and the rest under More
 * details. Every row saves the way the Content Plan list does.
 */
function Details({ item, site, members, features, canEdit, onPatch }: { item: CalendarItem; site: Site; members: string[]; features: number | null; canEdit: boolean; onPatch: (p: Partial<CalendarItem>) => void }) {
  const [keyword, setKeyword] = useState(item.keyword);
  const [slug, setSlug] = useState(slugOf(item));
  const [theme, setTheme] = useState(item.theme ?? "");
  const [also, setAlso] = useState(item.secondary.join(", "));
  const [notes, setNotes] = useState(item.notes ?? "");
  const [url, setUrl] = useState(item.url ?? "");
  const [extra, setExtra] = useState<Record<string, string>>(() => Object.fromEntries((site.profile.columns ?? []).map((c) => [c.id, String(item.extra?.[c.id] ?? "")])));
  const [noting, setNoting] = useState(Boolean(item.notes));
  const [more, setMore] = useState(false);
  // One row: the name on the left, the control on the right, the same width in every row so they line up.
  const row = (label: string, input: React.ReactNode, first = false) => (
    <label key={label} className={`aw-props__row min-h-13 gap-4 ${first ? "" : "border-t border-rule-faint"}`}>
      <span className="aw-props__label text-[14px]!">{label}</span>
      <span className="ml-auto w-full max-w-[320px] min-w-0">{input}</span>
    </label>
  );
  const text = (value: React.ReactNode, muted = false) => <span className={`flex h-9 items-center text-[14px] ${muted ? "text-muted" : "text-ink"}`}>{value}</span>;
  const box = `${FIELD} h-9 w-full rounded-aw text-[14px]!`;
  const status = statusChoice(item);
  const owners = [...new Set([...(item.owner ? [item.owner] : []), ...members])];

  return (
    <div className="flex flex-col gap-5">
      <section className="aw-frame aw-props bg-white px-3! py-1.5!" aria-label="Plan">
        {row(
          "Status",
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
          true,
        )}
        {row("Publish date", <DateField label="Publish date" value={item.due_date ?? ""} disabled={!canEdit} onChange={(v) => onPatch({ due_date: v })} className={box} placeholder="Set a date" />)}
        {row(
          "Owner",
          <Dropdown
            label="Owner"
            value={item.owner ?? ""}
            disabled={!canEdit}
            onChange={(v) => onPatch({ owner: v || null })}
            className={box}
            placeholder="Assign"
            options={[...(item.owner ? [{ id: "", label: "No owner" }] : []), ...owners.map((m) => ({ id: m, label: m }))]}
          />,
        )}
        {item.action === "update" && item.current_url
          ? row(
              "Page to update",
              <a href={item.current_url} target="_blank" rel="noopener noreferrer" className="block truncate text-[14px] leading-9">
                {item.current_url.replace(/^https?:\/\/(www\.)?/, "")} ↗
              </a>,
            )
          : null}
      </section>

      {noting ? (
        <label className="flex flex-col gap-2">
          <span className="text-[14px] font-medium text-ink">Note for the writer</span>
          <textarea
            value={notes}
            disabled={!canEdit}
            autoFocus={!item.notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={() => notes !== (item.notes ?? "") && onPatch({ notes: notes || null })}
            rows={4}
            placeholder="The angle, sections it must have, stories or proof to use"
            className="aw-textarea text-[14px]!"
          />
        </label>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        {!noting && canEdit ? (
          <button type="button" className="aw-text-link text-[14px]" onClick={() => setNoting(true)}>
            + Add a note for the writer
          </button>
        ) : (
          <span />
        )}
        <button type="button" className="aw-text-link text-[14px] text-muted!" aria-expanded={more} onClick={() => setMore((m) => !m)}>
          {more ? "Fewer details" : "More details"}
        </button>
      </div>

      {more ? (
        <section className="aw-frame aw-props bg-white px-3! py-1.5!" aria-label="More details">
          {row("Theme", <input value={theme} disabled={!canEdit} onChange={(e) => setTheme(e.target.value)} onBlur={() => theme !== (item.theme ?? "") && onPatch({ theme: theme.trim() || null })} className={box} />, true)}
          {row(
            "Related keywords",
            <input
              value={also}
              disabled={!canEdit}
              onChange={(e) => setAlso(e.target.value)}
              onBlur={() => {
                const list = also.split(",").map((x) => x.trim()).filter(Boolean);
                if (list.join("|") !== item.secondary.join("|")) onPatch({ secondary: list });
              }}
              placeholder="Other keywords, with commas"
              className={box}
            />,
          )}
          {(site.profile.columns ?? []).map((c) =>
            row(
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
          {row(
            "Impact",
            <Dropdown label="Impact" value={item.stage ?? ""} disabled={!canEdit} onChange={(v) => onPatch({ stage: (v || null) as CalendarItem["stage"] })} className={box} options={[...STAGES.map((x) => ({ id: x.id as string, label: STAGE_LABEL[x.id] })), { id: "", label: "None" }]} />,
          )}
          {row(
            "Job",
            <Dropdown label="Job" value={item.action} disabled={!canEdit} onChange={(v) => onPatch({ action: v })} className={box} options={[{ id: "new" as const, label: "New page" }, { id: "update" as const, label: "Update page" }]} />,
          )}
          {row(
            "Slug",
            <input
              value={slug}
              disabled={!canEdit}
              onChange={(e) => setSlug(e.target.value)}
              onBlur={() => {
                const next = slug.trim() ? `/${slugify(slug)}` : null;
                if (next !== slugOf(item)) onPatch({ extra: { ...(item.extra ?? {}), slug: next } });
                setSlug(next ?? slugOf({ ...item, extra: { ...(item.extra ?? {}), slug: null } }));
              }}
              className={`${box} font-mono text-[13px]!`}
            />,
          )}
          {row(
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
          {row("Keyword", <input value={keyword} disabled={!canEdit} onChange={(e) => setKeyword(e.target.value)} onBlur={() => keyword.trim() && keyword !== item.keyword && onPatch({ keyword: keyword.trim() })} className={box} />)}
          {row("Cost per click", text(fmtCpc(item.cpc), item.cpc === null || item.cpc === undefined))}
          {row("Current ranking", text(item.current_rank ? `#${item.current_rank}` : "Not ranking yet", !item.current_rank))}
          {row("SERP features", text(features === null ? "–" : features ? String(features) : "None found", !features))}
        </section>
      ) : null}
    </div>
  );
}
