"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { addCalendarItems, deleteCalendarItems, updateCalendarItem, type KeywordRun, type Site } from "@/lib/db";
import { groupOf, isOpportunity, LEVELS, listOpportunities, OPP_STATES, oppState, OTHER_GROUP, STAGE_LABEL, type OppCluster, type OppItem, type OppState } from "@/lib/oppData";
import { slots } from "@/lib/research";
import type { RunAuth } from "@/lib/runner";
import { useStash } from "@/lib/stash";
import { quietly, recordUndo } from "@/lib/undo";
import { importPatch } from "@/lib/writerImport";
import { askConfirm } from "../Dialogs";
import { EmptyScreen } from "../Drawing";
import { EngineName } from "../Engines";
import { Sheet, type Col, type SheetGroups } from "../Sheet";
import { SidePanel, Thinking } from "../ui";
import { PlanProgress } from "./AgenticResearch";
import { toItem, type Refresh } from "./EditorialCalendar";
import { post } from "./shared";

// Opportunities (docs/content-v3-plan.md, section 3): every idea from the content plan in one sheet, grouped by
// cluster with its pillar first, scored, and with the reason it's here. Find opportunities runs the plan again.

const REFRESH_DAYS = 30;
const PER_WEEK = 2; // Add to calendar gives one date every few days, 2 a week
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const short = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
const fmt = (n: number) => n.toLocaleString("en-US");

export function OpportunitiesPage({ sb, auth, site, canEdit, refresh, onDrafts }: { sb: SupabaseClient; auth: RunAuth; site: Site; canEdit: boolean; refresh?: Refresh; onDrafts?: () => void }) {
  const [data, setData] = useStash<{ items: OppItem[]; clusters: OppCluster[] } | null>(`opp:${site.id}`, null);
  const [runs] = useStash<KeywordRun[] | null>(`agentic:${site.id}:runs`, null);
  const [error, setError] = useState("");
  const [flash, setFlash] = useState("");
  const [tick, setTick] = useState(0);
  const [starting, setStarting] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await listOpportunities(sb, site.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setData({ items: [], clusters: [] });
    }
  }, [sb, site.id, setData]);
  useEffect(() => {
    // Loading on first render is the point of this effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);
  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(""), 4000);
    return () => clearTimeout(t);
  }, [flash]);

  // A finished plan saves its own rows on the server. If that failed, its rows come in here, as ideas with no date.
  const onRows = useCallback(
    (rows: Parameters<typeof toItem>[1][]) => {
      addCalendarItems(sb, auth.workspaceId, rows.map((r) => toItem(site.id, r)))
        .then(load)
        .catch((e) => setError(e instanceof Error ? e.message : String(e)));
    },
    [sb, auth.workspaceId, site.id, load],
  );
  const run = runs?.[0] ?? null;
  const running = run?.status === "running";
  const wasRunning = useRef(false);
  useEffect(() => {
    // Reload once when a plan finishes.
    if (wasRunning.current && !running) load();
    wasRunning.current = running;
  }, [running, load]);

  const items = useMemo(() => (data?.items ?? []).filter(isOpportunity), [data]);
  const clusters = useMemo(() => data?.clusters ?? [], [data]);
  const clusterIds = useMemo(() => new Set(clusters.map((c) => c.id)), [clusters]);

  if (!data) return <Thinking text="Loading opportunities..." />;

  const lastDone = (runs ?? []).find((r) => r.status === "done");
  const nextRefresh = lastDone ? new Date(new Date(lastDone.created_at).getTime() + REFRESH_DAYS * 864e5) : null;
  const canFind = !lastDone || Boolean(refresh?.paid && nextRefresh && nextRefresh <= new Date());

  async function find() {
    setStarting(true);
    setError("");
    try {
      await post(auth, "/api/research/agentic", { siteId: site.id });
      setTick((n) => n + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setStarting(false);
    }
  }

  /** Save fields on rows, with one step for Undo. */
  async function patch(list: OppItem[], change: (i: OppItem) => Partial<OppItem>, label: string) {
    if (!list.length) return;
    const before = new Map(list.map((i) => [i.id, i]));
    const after = new Map(list.map((i) => [i.id, change(i)]));
    const apply = async (pick: (i: OppItem) => Partial<OppItem>) => {
      setData((d) => (d ? { ...d, items: d.items.map((i) => (before.has(i.id) ? { ...i, ...pick(before.get(i.id)!) } : i)) } : d));
      for (let k = 0; k < list.length; k += 8)
        await Promise.all(
          list.slice(k, k + 8).map((i) => {
            const p = pick(i);
            return updateCalendarItem(sb, i.id, p as Parameters<typeof updateCalendarItem>[2]);
          }),
        );
    };
    const back = (i: OppItem) => Object.fromEntries(Object.keys(after.get(i.id) ?? {}).map((k) => [k, i[k as keyof OppItem]])) as Partial<OppItem>;
    recordUndo({ label, undo: () => apply(back), redo: () => apply((i) => after.get(i.id)!) });
    try {
      await quietly(() => apply((i) => after.get(i.id)!));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      load();
    }
  }

  /** Dates for new calendar rows: 2 a week, after the last date already planned. */
  function nextDates(n: number): string[] {
    const today = iso(new Date());
    const last = (data?.items ?? []).map((i) => i.due_date).filter((d): d is string => Boolean(d) && d! >= today).sort().at(-1);
    const start = last ? new Date(`${last}T12:00:00`) : new Date();
    if (last) start.setDate(start.getDate() + 1);
    return slots(start, PER_WEEK, n);
  }
  const addToCalendar = (list: OppItem[]) => {
    const todo = list.filter((i) => ["new", "dismissed"].includes(oppState(i)));
    const dates = nextDates(todo.length);
    const at = new Map(todo.map((i, n) => [i.id, dates[n]]));
    patch(todo, (i) => ({ due_date: at.get(i.id)!, dismissed_at: null }), todo.length === 1 ? `adding "${todo[0].keyword}" to the calendar` : "adding to the calendar");
    if (todo.length) setFlash(todo.length === 1 ? `Added to the calendar for ${short(new Date(`${dates[0]}T12:00:00`))}` : `${todo.length} added to the calendar, ${PER_WEEK} a week`);
  };
  const addToDrafts = (list: OppItem[]) => {
    const todo = list.filter((i) => !["drafts", "published"].includes(oppState(i)));
    const at = new Date().toISOString();
    patch(todo, (i) => ({ ...importPatch(i, at), dismissed_at: null }), todo.length === 1 ? `adding "${todo[0].keyword}" to Drafts` : "adding to Drafts");
    if (todo.length) setFlash(todo.length === 1 ? `Added "${todo[0].keyword}" to Drafts` : `${todo.length} added to Drafts`);
  };
  const dismiss = (list: OppItem[]) => {
    const todo = list.filter((i) => oppState(i) === "new" || oppState(i) === "calendar");
    const at = new Date().toISOString();
    patch(todo, () => ({ dismissed_at: at, due_date: null }), todo.length === 1 ? `dismissing "${todo[0].keyword}"` : "dismissing");
  };
  const setState = (i: OppItem, s: OppState) => {
    if (s === oppState(i)) return;
    if (s === "calendar") return addToCalendar([i]);
    if (s === "drafts") return addToDrafts([i]);
    if (s === "dismissed") return dismiss([i]);
    if (s === "new") patch([i], () => ({ due_date: null, dismissed_at: null }), `moving "${i.keyword}" back to New`);
  };
  async function remove(list: OppItem[]) {
    if (!list.length) return;
    if (!(await askConfirm({ title: list.length === 1 ? `Delete "${list[0].keyword}"?` : `Delete ${list.length} opportunities?`, text: "They come off the plan and the calendar.", action: "Delete" }))) return;
    const ids = new Set(list.map((i) => i.id));
    setData((d) => (d ? { ...d, items: d.items.filter((i) => !ids.has(i.id)) } : d));
    setPicked(new Set());
    try {
      await deleteCalendarItems(sb, [...ids]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      load();
    }
  }

  const progress = (
    <PlanProgress
      sb={sb}
      site={site}
      refresh={tick}
      onRows={(rows) => onRows(rows)}
      onStop={canEdit ? (runId) => post(auth, "/api/research/agentic", { action: "stop", runId }).then(() => {}) : undefined}
    />
  );
  const findButton = canEdit ? (
    canFind ? (
      <button type="button" className="aw-btn aw-btn--primary aw-btn--sm" onClick={find} disabled={starting || running}>
        {starting || running ? "Finding..." : "Find opportunities"}
      </button>
    ) : refresh && !refresh.paid ? (
      <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm" onClick={refresh.onUpgrade}>
        Monthly refresh
      </button>
    ) : nextRefresh ? (
      <span className="text-[13px] text-muted">Next refresh {short(nextRefresh)}</span>
    ) : null
  ) : null;
  const head = (
    <header className="flex flex-wrap items-center justify-between gap-3">
      <h1 className="aw-h2 mb-0!">Content Opportunities</h1>
      {items.length ? (
        <span className="flex flex-wrap items-center gap-3">
          {lastDone ? <span className="text-[13px] text-muted">Found {short(new Date(lastDone.created_at))}</span> : null}
          {findButton}
        </span>
      ) : null}
    </header>
  );

  // Before the first plan: the picture and one button.
  if (!items.length)
    return (
      <div className="flex flex-col gap-5">
        {head}
        {error ? <p className="aw-error">{error}</p> : null}
        {progress}
        {running ? null : (
          <EmptyScreen
            drawing="opportunities"
            title="Find what to write next"
            action={
              canEdit ? (
                <button type="button" className="aw-btn aw-btn--primary" onClick={find} disabled={starting}>
                  {starting ? "Starting..." : "Find opportunities"}
                </button>
              ) : undefined
            }
          >
            {canEdit ? "Arrowsterr finds the searches and AI answers you can win, grouped into clusters." : "Ask an editor to find opportunities."}
          </EmptyScreen>
        )}
      </div>
    );

  const byId = new Map(items.map((i) => [i.id, i]));
  const pickedRows = [...picked].map((id) => byId.get(id)).filter((i): i is OppItem => Boolean(i));
  const clusterName = (id: string | null) => clusters.find((c) => c.id === id)?.name ?? null;

  const cols: Col<OppItem>[] = [
    {
      id: "keyword",
      label: "Keyword",
      type: "text",
      width: 300,
      value: (i) => i.keyword,
      cell: (i) => (
        <span className="inline-flex items-center gap-2">
          {i.keyword}
          {i.cluster_role === "pillar" && clusterIds.has(i.cluster_id ?? "") ? <span className="aw-badge">Pillar</span> : null}
        </span>
      ),
    },
    {
      id: "state",
      label: "Status",
      type: "list",
      width: 130,
      options: Object.values(OPP_STATES).map((s) => s.label),
      value: (i) => OPP_STATES[oppState(i)].label,
      cell: (i) => <span className={`aw-status ${OPP_STATES[oppState(i)].tone}`}>{OPP_STATES[oppState(i)].label}</span>,
      edit: canEdit
        ? {
            kind: "select",
            options: (["new", "calendar", "drafts", "dismissed"] as const).map((s) => ({ id: s, label: OPP_STATES[s].label })),
            value: (i) => oppState(i),
            save: (i, v) => v && oppState(i) !== "published" && setState(i, v as OppState),
          }
        : undefined,
    },
    { id: "type", label: "Type", type: "list", width: 110, value: (i) => (i.action === "update" ? "Update" : "New page"), cell: (i) => (i.action === "update" ? <span className="aw-status aw-status--warn">Update</span> : <span className="aw-tag">New page</span>) },
    {
      id: "stage",
      label: "Stage",
      type: "list",
      width: 110,
      value: (i) => (i.stage ? STAGE_LABEL[i.stage] : null),
      edit: canEdit
        ? {
            kind: "select",
            options: (["bofu", "mofu", "tofu"] as const).map((s) => ({ id: s, label: STAGE_LABEL[s] })),
            value: (i) => i.stage ?? "",
            save: (i, v) => patch([i], () => ({ stage: (v as OppItem["stage"]) ?? null }), `a change to "${i.keyword}"`),
          }
        : undefined,
    },
    { id: "volume", label: "Searches", type: "number", width: 110, value: (i) => i.volume },
    { id: "difficulty", label: "Difficulty", type: "number", width: 105, value: (i) => i.difficulty },
    {
      id: "level",
      label: "Chance",
      type: "list",
      width: 110,
      options: ["High", "Medium", "Low"],
      value: (i) => (i.level ? LEVELS[i.level].label : null),
      cell: (i) => (i.level ? <span className={`aw-status ${LEVELS[i.level].tone}`}>{LEVELS[i.level].label}</span> : <span className="text-muted">–</span>),
    },
    { id: "score", label: "Score", type: "number", width: 100, value: (i) => (i.score === null ? null : Math.round(i.score)) },
    {
      id: "reason",
      label: "Why",
      type: "text",
      width: 300,
      value: (i) => i.reason,
      cell: (i) =>
        i.reason ? (
          <span className="inline-flex items-center gap-2">
            {i.reason_engine ? <EngineName engine={i.reason_engine} size={16} /> : null}
            {i.reason_engine && i.reason.startsWith(i.reason_engine) ? i.reason.slice(i.reason_engine.length).trim() : i.reason}
          </span>
        ) : (
          <span className="text-muted">–</span>
        ),
    },
    { id: "rank", label: "Your rank", type: "number", width: 105, value: (i) => i.current_rank },
  ];

  const groups: SheetGroups<OppItem> = {
    of: (i) => groupOf(i, clusterIds),
    list: [
      ...clusters.map((c) => {
        const rows = items.filter((i) => i.cluster_id === c.id);
        const vol = rows.reduce((n, i) => n + (i.volume ?? 0), 0);
        const fresh = rows.filter((i) => oppState(i) === "new");
        return {
          id: c.id,
          name: c.name,
          meta: `${rows.length} ${rows.length === 1 ? "page" : "pages"}, ${fmt(vol)} searches a month`,
          tools:
            canEdit && fresh.length ? (
              <span className="flex items-center gap-1">
                <button type="button" className="aw-text-link text-[12px]" onClick={() => addToCalendar(fresh.sort((a, b) => Number(b.cluster_role === "pillar") - Number(a.cluster_role === "pillar")))}>
                  Add to calendar
                </button>
                <span className="text-faint" aria-hidden="true">
                  |
                </span>
                <button type="button" className="aw-text-link text-[12px]" onClick={() => addToDrafts(fresh)}>
                  Add to Drafts
                </button>
              </span>
            ) : null,
        };
      }),
      { id: OTHER_GROUP, name: clusters.length ? "Other ideas" : "Ideas", meta: `${items.filter((i) => groupOf(i, clusterIds) === OTHER_GROUP).length} pages` },
    ],
  };

  const bulk = pickedRows.length ? (
    <span className="flex flex-wrap items-center gap-2">
      <span className="text-[13px] font-medium text-ink">{pickedRows.length} selected</span>
      <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm" onClick={() => (addToCalendar(pickedRows), setPicked(new Set()))}>
        Add to calendar
      </button>
      <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm" onClick={() => (addToDrafts(pickedRows), setPicked(new Set()))}>
        Add to Drafts
      </button>
      <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm" onClick={() => (dismiss(pickedRows), setPicked(new Set()))}>
        Dismiss
      </button>
      <button type="button" className="aw-btn aw-btn--ghost aw-btn--sm" onClick={() => remove(pickedRows)}>
        Delete
      </button>
    </span>
  ) : null;

  const opened = open ? (byId.get(open) ?? null) : null;
  return (
    <div className="flex flex-col gap-5">
      {head}
      {error ? <p className="aw-error">{error}</p> : null}
      {progress}
      <Sheet<OppItem>
        id={`opp:${site.id}`}
        label="Opportunities"
        rows={items}
        cols={cols}
        rowKey={(i) => i.id}
        sort={{ key: "score", desc: true }}
        groups={groups}
        letters
        selected={canEdit ? picked : undefined}
        onSelect={canEdit ? setPicked : undefined}
        canSelect={(i) => oppState(i) !== "published"}
        onOpen={(i) => setOpen(i.id)}
        onDeleteRows={canEdit ? (ids) => remove(ids.map((id) => byId.get(id)).filter((i): i is OppItem => Boolean(i))) : undefined}
        toolbar={bulk}
        height="74vh"
      />
      {opened ? (
        <OppPanel
          item={opened}
          cluster={clusterName(opened.cluster_id)}
          siblings={items.filter((i) => i.cluster_id && i.cluster_id === opened.cluster_id && i.id !== opened.id)}
          canEdit={canEdit}
          onClose={() => setOpen(null)}
          onCalendar={() => addToCalendar([opened])}
          onDrafts={() => addToDrafts([opened])}
          onDismiss={() => dismiss([opened])}
          onOpenDrafts={onDrafts}
        />
      ) : null}
      {flash ? (
        <div className="aw-undo" role="status">
          {flash}
        </div>
      ) : null}
    </div>
  );
}

function OppPanel({
  item: i,
  cluster,
  siblings,
  canEdit,
  onClose,
  onCalendar,
  onDrafts,
  onDismiss,
  onOpenDrafts,
}: {
  item: OppItem;
  cluster: string | null;
  siblings: OppItem[];
  canEdit: boolean;
  onClose: () => void;
  onCalendar: () => void;
  onDrafts: () => void;
  onDismiss: () => void;
  onOpenDrafts?: () => void;
}) {
  const state = oppState(i);
  const row = (label: string, value: React.ReactNode) => (
    <tr>
      <th scope="row" className="w-36 text-left font-normal text-muted">
        {label}
      </th>
      <td>{value ?? <span className="text-muted">–</span>}</td>
    </tr>
  );
  return (
    <SidePanel title={i.keyword} kicker={cluster ?? undefined} onClose={onClose}>
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`aw-status ${OPP_STATES[state].tone}`}>{OPP_STATES[state].label}</span>
          {canEdit && (state === "new" || state === "dismissed") ? (
            <button type="button" className="aw-btn aw-btn--primary aw-btn--sm" onClick={onCalendar}>
              Add to calendar
            </button>
          ) : null}
          {canEdit && state !== "drafts" && state !== "published" ? (
            <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm" onClick={onDrafts}>
              Add to Drafts
            </button>
          ) : null}
          {state === "drafts" && onOpenDrafts ? (
            <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm" onClick={onOpenDrafts}>
              Open Drafts
            </button>
          ) : null}
          {canEdit && (state === "new" || state === "calendar") ? (
            <button type="button" className="aw-btn aw-btn--ghost aw-btn--sm" onClick={onDismiss}>
              Dismiss
            </button>
          ) : null}
        </div>
        <table className="aw-table text-[13px]">
          <tbody>
            {row("Why", i.reason)}
            {i.ai_prompt ? row("AI prompt", i.ai_prompt) : null}
            {row("Type", i.action === "update" ? "Update" : "New page")}
            {i.current_url ? row("Page", <span className="wrap-anywhere">{i.current_url}</span>) : null}
            {row("Stage", i.stage ? STAGE_LABEL[i.stage] : null)}
            {row("Searches", i.volume === null ? null : `${fmt(i.volume)} a month`)}
            {row("Difficulty", i.difficulty)}
            {row("Chance", i.level ? `${LEVELS[i.level].label}${i.chance !== null ? `, ${Math.round(i.chance * 100)}%` : ""}` : null)}
            {row("Score", i.score === null ? null : fmt(Math.round(i.score)))}
            {row("Your rank", i.current_rank)}
            {row("Due", i.due_date ? short(new Date(`${i.due_date}T12:00:00`)) : null)}
          </tbody>
        </table>
        {i.secondary.length ? (
          <section className="flex flex-col gap-2">
            <h3 className="aw-h4">Also covers</h3>
            <div className="flex flex-wrap gap-1.5">
              {i.secondary.map((k) => (
                <span key={k} className="aw-chip">
                  {k}
                </span>
              ))}
            </div>
          </section>
        ) : null}
        {siblings.length ? (
          <section className="flex flex-col gap-2">
            <h3 className="aw-h4">{i.cluster_role === "pillar" ? "Pages that link here" : "Other pages in this cluster"}</h3>
            <ul className="flex flex-col gap-1 text-[13px]">
              {siblings.map((s) => (
                <li key={s.id} className="flex items-center gap-2">
                  {s.keyword}
                  {s.cluster_role === "pillar" ? <span className="aw-badge">Pillar</span> : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </SidePanel>
  );
}
