"use client";

import { DateField, Dropdown } from "../Pickers";
import type { SupabaseClient } from "@supabase/supabase-js";
import { useCallback, useEffect, useRef, useState } from "react";
import { formatDate } from "@/lib/dates";
import { addCalendarItems, keywordRunResult, listMembers, saveSite, type BankRow, type CalendarItem, type CalendarStatus, type NewCalendarItem, type SheetColumn, type Site } from "@/lib/db";
import { nextMonday, schedulePlan, slots, STAGES, type Stage } from "@/lib/research";
import type { RunAuth } from "@/lib/runner";
import { quietly, recordUndo } from "@/lib/undo";
import { canImport, inWriterAt } from "@/lib/writerImport";
import { isBusy, writeState, type WriteState } from "@/lib/writeFlow";
import { writerStates, type BriefLite, type DraftLite } from "@/lib/writerLibrary";
import { usePoll } from "../writer/parts";
import { useWriteActions, WriteButton } from "../writer/WriteButton";
import { Sheet, type Col, type Edit } from "../Sheet";
import { Confirm } from "../reports/Dialog";
import { ChevronDown, Search } from "../Icons";
import { SkelRows } from "../states";
import { SidePanel } from "../ui";
import { goToPath } from "../writer/parts";
import { CalendarGrid, TopicSidebar } from "./CalendarGrid";
import { STATUSES, type WriterAccess } from "./ContentPiece";
import { KeywordDeepDive } from "./KeywordDeepDive";
import { DayPanel } from "./DayPanel";
import { byStage, CalendarViewIcon, SelectionBar, Difficulty, downloadCsv, FIELD, ListViewIcon, post, slugify, slugOf, STAGE_LABEL, StageTag, STATUS_PICK, statusLabel, ViewSwitch } from "./shared";
import { PlanProgress, planRows } from "./AgenticResearch";
import { PlanIntro, PlanSample } from "./PlanIntro";
import { usePlan } from "./usePlan";

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const parse = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};
const dayLabel = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
const STAGE_ORDER = (s: Stage | null) => (s ? STAGES.findIndex((x) => x.id === s) : 3);
const REFRESH_DAYS = 30;
/** Paid plans can refresh the Editorial Calendar once a month. */
export type Refresh = { paid: boolean; onUpgrade: () => void };
type PlanRow = Omit<BankRow, "id" | "added">;

type CalView = "list" | "month" | "week";
const WeekViewIcon = () => (
  <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x={3.5} y={5} width={17} height={15} rx={2.5} />
    <path d="M9 5v15M15 5v15" />
  </svg>
);
const VIEWS: { id: CalView; label: string; icon: React.ReactNode }[] = [
  { id: "list", label: "List", icon: <ListViewIcon /> },
  { id: "month", label: "Month", icon: <CalendarViewIcon /> },
  { id: "week", label: "Week", icon: <WeekViewIcon /> },
];
/** A plan row as an Editorial Calendar item. */
const toItem = (siteId: string, r: PlanRow & { due_date?: string | null }): NewCalendarItem => ({
  site_id: siteId,
  keyword: r.keyword,
  secondary: r.others ?? [],
  stage: r.stage,
  theme: r.theme ?? null,
  volume: r.volume,
  difficulty: r.kd,
  intent: r.intent,
  cpc: r.cpc ?? null,
  source: r.source,
  notes: r.notes,
  due_date: r.due_date ?? null,
  action: r.action ?? "new",
  current_url: r.url ?? null,
  current_rank: r.rank ?? null,
});

const WRITE_LABEL: Record<WriteState["kind"], string> = { outline: "Write outline", busy: "Working", draft: "Write draft", publish: "Publish", view: "View post", retry: "Try again" };

const icon = (d: React.ReactNode) => (
  <svg viewBox="0 0 24 24" width={17} height={17} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {d}
  </svg>
);
const AiIconSmall = () => icon(<path d="M12 3c.6 4.6 1.9 5.9 6.5 6.5-4.6.6-5.9 1.9-6.5 6.5-.6-4.6-1.9-5.9-6.5-6.5C10.1 8.9 11.4 7.6 12 3Z" />);

/**
 * The Editorial Calendar: every piece as a list (a sheet edited like a spreadsheet), a month or a week. The list has
 * its own address (/editorial-calendar/list, sub "list"); the calendar is the page's own. In the calendar views every unscheduled piece waits in the sidebar to be dragged onto a day, and
 * Auto-schedule gives them all dates at a set pace. The Write column takes each piece from outline to draft to a
 * live post (docs/agentic-writing.md); the first outline puts it in the Library.
 */
export function EditorialCalendar({
  sb,
  auth,
  site,
  canEdit,
  writer,
  onSite,
  refresh,
  sub,
  onSub,
}: {
  sb: SupabaseClient;
  auth: RunAuth;
  site: Site;
  canEdit: boolean;
  writer?: WriterAccess;
  brandName: string;
  onSite: (s: Site) => void;
  refresh?: Refresh;
  /** The view from the address: "list" for the list, nothing for the calendar. */
  sub?: string;
  onSub?: (sub?: string) => void;
}) {
  const { items, runs, error, setError, load, patch, addOn, remove: removeItems, importToWriter, toast } = usePlan({ sb, auth, site });
  // The address says list or calendar; month or week is kept for this visit. Without onSub the view stays local.
  const [calMode, setCalMode] = useState<"month" | "week">("month");
  const [ownList, setOwnList] = useState(false);
  const view: CalView = (onSub ? sub === "list" : ownList) ? "list" : calMode;
  const setView = (v: CalView) => {
    if (v !== "list") setCalMode(v);
    if (onSub) onSub(v === "list" ? "list" : undefined);
    else setOwnList(v === "list");
  };
  const [q, setQ] = useState("");
  const [tick, setTick] = useState(0); // reloads the plan progress after a build starts
  const [building, setBuilding] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [panel, setPanel] = useState<{ day: string | null; piece: string | null } | null>(null);
  const [perWeek, setPerWeek] = useState(2);
  const [start, setStart] = useState(() => iso(new Date()));
  const [dropCol, setDropCol] = useState<SheetColumn | null>(null);
  const custom = site.profile.columns ?? [];
  // Each piece's outline and draft, for the Write column. Asked again every 5 seconds while the writer works.
  const [writing, setWriting] = useState<Map<string, { brief: BriefLite | null; draft: DraftLite | null }>>(new Map());
  const loadWriting = useCallback(() => {
    writerStates(sb, site.id)
      .then(setWriting)
      .catch(() => {});
  }, [sb, site.id]);
  useEffect(loadWriting, [loadWriting]);
  // Everyone in the workspace, to pick as a piece's owner.
  const [members, setMembers] = useState<string[]>([]);
  useEffect(() => {
    listMembers(sb, auth.workspaceId)
      .then((m) => setMembers(m.map((x) => x.email).filter((e): e is string => Boolean(e))))
      .catch(() => {});
  }, [sb, auth.workspaceId]);

  // Keywords saved in the old Topic Bank move into the Editorial Calendar as ideas, once.
  const oldBank = site.profile.bank;
  useEffect(() => {
    if (!canEdit || !oldBank?.length) return;
    const s2 = { ...site, profile: { ...site.profile, bank: undefined } };
    addCalendarItems(sb, auth.workspaceId, oldBank.map((b) => toItem(site.id, b)))
      .then(() => saveSite(sb, s2))
      .then(() => {
        onSite(s2);
        load();
      })
      .catch(() => {});
    // Only when old rows are found.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [oldBank?.length]);

  // A finished plan lands here: the first one with dates, a monthly refresh as new ideas.
  const onPlan = useCallback(
    (rows: PlanRow[], first: boolean) => {
      const list = first ? schedulePlan(rows, nextMonday()) : rows;
      addCalendarItems(sb, auth.workspaceId, list.map((r) => toItem(site.id, r)))
        .then(load)
        .catch((e) => setError(e instanceof Error ? e.message : String(e)));
    },
    [sb, auth.workspaceId, site.id, load, setError],
  );

  const stateOf = (i: CalendarItem): WriteState => writeState({ item: { status: i.status, url: i.url ?? null }, brief: writing.get(i.id)?.brief ?? null, draft: writing.get(i.id)?.draft ?? null });
  const anyBusy = Boolean(items?.some((i) => isBusy(stateOf(i))));
  usePoll(anyBusy, 5000, loadWriting);
  // When the writer finishes, it moves the piece's status on: read the plan again once.
  const wasBusy = useRef(false);
  useEffect(() => {
    if (wasBusy.current && !anyBusy) load();
    wasBusy.current = anyBusy;
  }, [anyBusy, load]);
  // The first outline puts a piece in the Library; one already there, or published, is left as it is.
  const actions = useWriteActions({
    sb,
    auth,
    brandId: site.brand_id ?? null,
    siteId: site.id,
    canEdit,
    onUpgrade: writer && !writer.open ? writer.onUpgrade : undefined,
    onChanged: () => {
      loadWriting();
      load();
    },
    beforeOutline: async (id) => {
      const it = items?.find((x) => x.id === id);
      if (it && canImport(it)) await importToWriter([id]);
    },
  });

  if (!items)
    return (
      <div className="flex flex-col gap-5" aria-busy="true">
        <h1 className="aw-h2 mb-0!">Editorial Calendar</h1>
        <section className="aw-frame overflow-hidden">
          <table className="aw-table">
            <tbody>
              <SkelRows rows={8} cols={5} />
            </tbody>
          </table>
        </section>
      </div>
    );

  const remove = (ids: string[]) => removeItems(ids, () => setPicked(new Set()));

  async function build() {
    setBuilding(true);
    setError("");
    try {
      await post(auth, "/api/research/agentic", { siteId: site.id });
      setTick((n) => n + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBuilding(false);
    }
  }

  /** Put the AI's last plan back, with fresh dates. Pieces still on the plan are skipped. */
  async function restore() {
    const done = (runs ?? []).find((r) => r.status === "done");
    if (!done) return;
    setError("");
    try {
      const result = await keywordRunResult(sb, done.id);
      const rows = schedulePlan(planRows({ ...result, approved: [] }), nextMonday());
      await addCalendarItems(sb, auth.workspaceId, rows.map((r) => toItem(site.id, r)));
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  const undated = items.filter((i) => !i.due_date && i.status !== "published");
  /** Give every unscheduled piece a date, BOFU first and then by volume, at the chosen pace. One step for Undo. */
  async function autoSchedule() {
    const todo = [...undated].sort((a, b) => STAGE_ORDER(a.stage) - STAGE_ORDER(b.stage) || (b.volume ?? 0) - (a.volume ?? 0));
    const dates = slots(parse(start), perWeek, todo.length);
    const before = new Map(todo.map((i) => [i.id, i.due_date]));
    recordUndo({
      label: "auto-scheduling",
      undo: () => Promise.all(todo.map((i) => patch(i.id, { due_date: before.get(i.id) ?? null }))),
      redo: () => Promise.all(todo.map((i, n) => patch(i.id, { due_date: dates[n] }))),
    });
    await quietly(() => Promise.all(todo.map((i, n) => patch(i.id, { due_date: dates[n] }))));
  }

  const needle = q.trim().toLowerCase();
  const ordered = [...items].filter((i) => !needle || i.keyword.toLowerCase().includes(needle) || i.secondary.some((x) => x.toLowerCase().includes(needle))).sort(byStage);
  const pickedPieces = () => items.filter((i) => picked.has(i.id)).map((i) => ({ piece: i, state: stateOf(i) }));
  /** Keywords pasted below the last row become new ideas. */
  async function appendRows(list: Record<string, string>[]) {
    const fresh = list.map((r) => (r.keyword ?? Object.values(r)[0] ?? "").trim().replace(/\s+/g, " ")).filter(Boolean);
    if (!fresh.length) return;
    try {
      await addCalendarItems(
        sb,
        auth.workspaceId,
        fresh.map((keyword) => ({ site_id: site.id, keyword, secondary: [], stage: null, theme: null, volume: null, difficulty: null, intent: null, cpc: null, source: "pasted", due_date: null, notes: null })),
      );
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  const text = (k: "keyword" | "theme" | "owner" | "notes"): Edit<CalendarItem> => ({
    kind: "text",
    save: (i, v) => (k === "keyword" ? v && patch(i.id, { keyword: v }) : patch(i.id, { [k]: v })),
  });
  const ed = <E,>(x: E) => (canEdit ? x : undefined);
  const writeCell = (i: CalendarItem) => <WriteButton secondary state={stateOf(i)} busy={actions.busy.has(i.id)} canEdit={canEdit} onAct={() => void actions.act(i, stateOf(i))} onOpen={() => actions.open(i, stateOf(i))} />;
  const caret = canEdit ? (
    <span className="aw-cellpick__caret">
      <ChevronDown size={12} />
    </span>
  ) : null;
  const writeCol: Col<CalendarItem> = {
    id: "write",
    label: "Write",
    type: "list",
    value: (i) => WRITE_LABEL[stateOf(i).kind],
    options: Object.values(WRITE_LABEL),
    width: 200,
    cell: writeCell,
  };
  const owners = [{ id: "", label: "Unassigned" }, ...members.map((m) => ({ id: m, label: m }))];
  const cols: Col<CalendarItem>[] = [
    { id: "keyword", label: "Keyword", type: "text", value: (i) => i.keyword, width: 240, edit: ed(text("keyword")) },
    { id: "volume", label: "Volume", type: "number", value: (i) => i.volume, width: 90 },
    { id: "kd", label: "KD %", type: "number", value: (i) => i.difficulty, width: 110, cell: (i) => <Difficulty kd={i.difficulty} /> },
    {
      id: "status",
      label: "Status",
      type: "list",
      value: (i) => statusLabel(i),
      options: STATUS_PICK.map((s) => s.label),
      width: 140,
      cell: (i) => (
        <span className="aw-cellpick">
          <span className={`aw-status ${STATUS_PICK.find((s) => s.label === statusLabel(i))?.tone ?? "aw-status--pending"}`}>{statusLabel(i)}</span>
          {caret}
        </span>
      ),
      edit: ed<Edit<CalendarItem>>({
        kind: "select",
        options: STATUS_PICK,
        value: (i) => (i.status === "planned" && !i.due_date ? "idea" : i.status),
        save: (i, v) => {
          if (!v) return;
          if (v === "idea") return patch(i.id, { status: "planned", due_date: null });
          // Planned means it has a day. An idea picked as Planned gets next Monday until it is moved.
          patch(i.id, v === "planned" && !i.due_date ? { status: "planned", due_date: iso(nextMonday()) } : { status: v as CalendarStatus });
        },
      }),
    },
    {
      id: "due",
      label: "Due",
      type: "date",
      value: (i) => i.due_date,
      width: 140,
      cell: (i) => (
        <span className="aw-cellpick">
          {i.due_date ? parse(i.due_date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) : <span className="text-muted">No date</span>}
          {caret}
        </span>
      ),
      edit: ed<Edit<CalendarItem>>({ kind: "date", value: (i) => i.due_date ?? "", save: (i, v) => patch(i.id, { due_date: v }) }),
    },
    writeCol,
    {
      id: "stage",
      label: "Stage",
      type: "list",
      value: (i) => (i.stage ? STAGE_LABEL[i.stage] : ""),
      options: ["BOFU", "MOFU", "TOFU"],
      width: 90,
      cell: (i) => <StageTag stage={i.stage} />,
      edit: ed<Edit<CalendarItem>>({
        kind: "select",
        options: [...STAGES.map((x) => ({ id: x.id, label: STAGE_LABEL[x.id] })), { id: "", label: "None" }],
        value: (i) => i.stage ?? "",
        save: (i, v) => patch(i.id, { stage: (v || null) as Stage | null }),
      }),
    },
    {
      id: "owner",
      label: "Owner",
      type: "list",
      value: (i) => i.owner,
      width: 170,
      cell: (i) =>
        i.owner ? (
          <span className="aw-cellpick">
            <span className="aw-avatar-xs">{i.owner.slice(0, 1)}</span>
            <span className="truncate">{i.owner.split("@")[0]}</span>
            {caret}
          </span>
        ) : (
          <span className="aw-cellpick text-muted">
            Unassigned{caret}
          </span>
        ),
      edit: ed<Edit<CalendarItem>>({ kind: "select", options: owners, value: (i) => i.owner ?? "", save: (i, v) => patch(i.id, { owner: v }) }),
    },
    { id: "action", label: "Job", type: "list", value: (i) => (i.action === "update" ? "Update page" : "New page"), options: ["New page", "Update page"] },
    { id: "theme", label: "Theme", type: "list", value: (i) => i.theme, edit: ed(text("theme")) },
    {
      id: "url",
      label: "Page URL",
      type: "text",
      value: (i) => i.url ?? i.current_url,
      width: 200,
      edit: ed<Edit<CalendarItem>>({
        kind: "text",
        save: (i, url) => patch(i.id, url && i.action === "new" ? { url, status: "published" } : { url }),
      }),
    },
    { id: "notes", label: "Notes", type: "text", value: (i) => i.notes, width: 180, edit: ed(text("notes")) },
    { id: "rank", label: "Now ranks", type: "number", value: (i) => i.current_rank, cell: (i) => (i.current_rank ? `#${i.current_rank}` : <span className="text-muted">–</span>) },
    { id: "also", label: "Also covers", type: "text", value: (i) => i.secondary.join(", "), width: 200, cell: (i) => <span className="block max-w-72 truncate" title={i.secondary.join("\n")}>{i.secondary.join(" · ") || "–"}</span> },
    { id: "source", label: "Source", type: "list", value: (i) => i.source },
    ...custom.map(
      (c): Col<CalendarItem> => ({
        id: `x:${c.id}`,
        label: c.name,
        type: c.type === "number" ? "number" : c.type === "date" ? "date" : "text",
        value: (i) => i.extra?.[c.id] ?? null,
        edit: ed<Edit<CalendarItem>>({
          kind: c.type,
          value: (i) => String(i.extra?.[c.id] ?? ""),
          save: (i, v) => patch(i.id, { extra: { ...(i.extra ?? {}), [c.id]: c.type === "number" && v !== null ? Number(v) : v } }),
        }),
        onRemove: canEdit ? () => setDropCol(c) : undefined,
      }),
    ),
    {
      id: "slug",
      label: "Suggested slug",
      type: "text",
      value: (i) => slugOf(i),
      width: 220,
      cell: (i) => <span className="font-mono text-[12px] text-body">{slugOf(i)}</span>,
      edit: ed<Edit<CalendarItem>>({ kind: "text", value: (i) => slugOf(i), save: (i, v) => patch(i.id, { extra: { ...(i.extra ?? {}), slug: v ? `/${slugify(v)}` : null } }) }),
    },
  ];

  async function saveColumns(next: SheetColumn[]) {
    const s2 = { ...site, profile: { ...site.profile, columns: next } };
    try {
      await saveSite(sb, s2);
      onSite(s2);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  // The latest finished plan, and when the next monthly refresh opens.
  const lastDone = (runs ?? []).find((r) => r.status === "done") ?? null;
  const running = (runs ?? [])[0]?.status === "running";
  const nextRefresh = lastDone ? new Date(new Date(lastDone.created_at).getTime() + REFRESH_DAYS * 864e5) : null;
  const canRefresh = Boolean(refresh?.paid && nextRefresh && nextRefresh <= new Date());

  const built = Boolean(items.length || lastDone);
  const exportCsv = () =>
    downloadCsv(
      `editorial-calendar-${site.domain}.csv`,
      ["keyword", "job", "stage", "theme", "volume", "kd %", "status", "due date", "owner", "page url", "now ranks", "also covers", "in writer"],
      items.map((i) => [i.keyword, i.action, i.stage, i.theme, i.volume, i.difficulty, i.status, i.due_date, i.owner, i.url ?? i.current_url, i.current_rank, i.secondary.join("; "), inWriterAt(i)]),
    );
  const head = (
    <header className="flex flex-wrap items-center justify-between gap-3">
      <span className="flex flex-wrap items-center gap-3">
        <h1 className="aw-h2 mb-0!">Editorial Calendar</h1>
        {items.length ? (
          <span className="aw-small text-muted">
            {items.length} {items.length === 1 ? "piece" : "pieces"} · {undated.length} unscheduled
          </span>
        ) : null}
        {built ? <ViewSwitch value={view} onChange={setView} options={VIEWS} /> : null}
      </span>
      {built ? (
        <span className="flex flex-wrap items-center gap-2">
          {lastDone && canEdit && !running ? (
            refresh?.paid ? (
              canRefresh ? (
                <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm" onClick={build} disabled={building}>
                  <AiIconSmall />
                  {building ? "Starting..." : "Refresh plan"}
                </button>
              ) : nextRefresh ? (
                <span className="text-[13px] text-muted">Next refresh {formatDate(nextRefresh)}</span>
              ) : null
            ) : (
              <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm" onClick={refresh?.onUpgrade}>
                <AiIconSmall />
                Monthly refresh
              </button>
            )
          ) : null}
          {canEdit && undated.length ? (
            <>
              <Dropdown label="Posts per week" value={perWeek} onChange={setPerWeek} className={FIELD} options={[1, 2, 3, 4, 5].map((n) => ({ id: n, label: `${n} per week` }))} />
              <DateField label="Start on" value={start} onChange={(v) => v && setStart(v)} className={FIELD} clearable={false} />
              <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm" onClick={autoSchedule}>
                Auto-schedule {undated.length}
              </button>
            </>
          ) : null}
          <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm" onClick={exportCsv} disabled={!items.length}>
            Export CSV
          </button>
        </span>
      ) : null}
    </header>
  );
  const progress = <PlanProgress sb={sb} site={site} refresh={tick} onRows={onPlan} onStop={canEdit ? (runId) => post(auth, "/api/research/agentic", { action: "stop", runId }).then(() => {}) : undefined} />;

  // Before the first plan: what it is, a sample, and one button.
  if (!built && !running)
    return (
      <div className="flex flex-col gap-5">
        {error ? <p className="aw-error">{error}</p> : null}
        {head}
        <PlanIntro canEdit={canEdit} busy={building || running} built={built} onBuild={build} trial={refresh && !refresh.paid ? { onUpgrade: refresh.onUpgrade } : undefined} />
        {progress}
        <PlanSample />
        {toast}
      </div>
    );

  const openItem = panel?.piece ? (items.find((i) => i.id === panel.piece) ?? null) : null;
  const move = (id: string, date: string | null) => {
    const was = items.find((i) => i.id === id);
    if (was && was.due_date !== date) patch(id, { due_date: date });
  };
  const openPiece = (id: string) => setPanel({ day: items.find((i) => i.id === id)?.due_date ?? null, piece: id });


  // A keyword opens as its own screen, the Keyword Deep Dive.
  if (openItem) {
    const back = () => setPanel(panel?.day && view !== "list" ? { day: panel.day, piece: null } : null);
    return (
      <>
        <KeywordDeepDive
          key={openItem.id}
          sb={sb}
          auth={auth}
          site={site}
          item={openItem}
          canEdit={canEdit}
          writer={writer}
          onPatch={(p) => patch(openItem.id, p)}
          onRemove={() => removeItems([openItem.id], back)}
          onBack={back}
          onImport={() => importToWriter([openItem.id])}
          onRefresh={load}
        />
        {toast}
      </>
    );
  }
  return (
    <div className="flex flex-col gap-5">
      {error ? <p className="aw-error">{error}</p> : null}
      {actions.error ? <p className="aw-error">{actions.error}</p> : null}
      {head}
      {progress}
      {!items.length && lastDone && !running ? (
        <section className="aw-frame flex flex-col items-center gap-3 px-6 py-12 text-center">
          <h2 className="aw-h4">Editorial Calendar is empty</h2>
          <span className="flex flex-wrap items-center justify-center gap-3">
            {canEdit ? (
              <button type="button" className="aw-btn aw-btn--accent" onClick={restore}>
                Restore the AI&apos;s plan
              </button>
            ) : null}
            <button type="button" className="aw-text-link" onClick={() => goToPath("/keywords")}>
              Add keywords from Keyword Research
            </button>
          </span>
        </section>
      ) : null}

      {view === "list" ? (
        <section className="aw-frame flex min-w-0 flex-col">
          {picked.size && canEdit ? (
            <SelectionBar count={picked.size} noun={picked.size === 1 ? "piece" : "pieces"} onClear={() => setPicked(new Set())}>
              <button type="button" className="aw-btn aw-btn--primary aw-btn--sm" onClick={() => void actions.actMany(pickedPieces(), "outline")}>
                Write outline
              </button>
              <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm" onClick={() => void actions.actMany(pickedPieces(), "draft")}>
                Write draft
              </button>
              <Dropdown<CalendarStatus | ""> label="Set status" value="" placeholder="Set status" onChange={(st) => st && [...picked].forEach((id) => patch(id, { status: st }))} className={FIELD} options={STATUSES.map((s) => ({ id: s.id, label: s.label }))} />
              <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm" onClick={() => remove([...picked])}>
                Delete
              </button>
            </SelectionBar>
          ) : null}
          <Sheet
            id={`plan:${site.id}`}
            label="Editorial Calendar"
            height="calc(100vh - 210px)"
            toolbar={
              <label className="flex items-center gap-1.5">
                <Search size={14} />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search keywords" aria-label="Search keywords" className="aw-pop__field w-48" />
              </label>
            }
            rows={ordered}
            cols={cols}
            rowKey={(i) => i.id}
            sort={{ key: "stage", desc: false }}
            onDeleteRows={canEdit ? remove : undefined}
            onAppend={canEdit ? appendRows : undefined}
            selected={canEdit ? picked : undefined}
            onSelect={canEdit ? setPicked : undefined}
            onOpen={(i) => setPanel({ day: null, piece: i.id })}
          />
        </section>
      ) : (
        <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
          <CalendarGrid key={view} items={items} mode={view} canEdit={canEdit} onMove={move} onDay={(day) => setPanel({ day, piece: null })} onOpen={openPiece} />
          <TopicSidebar items={items} canEdit={canEdit} onOpen={openPiece} onMove={move} />
        </div>
      )}

      {panel?.day ? (
        <SidePanel title={dayLabel(panel.day)} kicker="Editorial Calendar" onClose={() => setPanel(null)}>
          <DayPanel
            items={items.filter((i) => i.due_date === panel.day)}
            canEdit={canEdit}
            onOpen={(id) => setPanel({ day: panel.day, piece: id })}
            onAdd={(p) => addOn(p.keyword, panel.day, p)}
            writeCell={writeCell}
          />
        </SidePanel>
      ) : null}
      {dropCol ? (
        <Confirm
          title="Delete column"
          text={`"${dropCol.name}" leaves the sheet. Its values stay saved but hidden.`}
          action="Delete"
          onConfirm={() => {
            saveColumns(custom.filter((x) => x.id !== dropCol.id));
            setDropCol(null);
          }}
          onClose={() => setDropCol(null)}
        />
      ) : null}
      {actions.overlays}
      {toast}
    </div>
  );
}
