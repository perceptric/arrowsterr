"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { COUNTRIES } from "@/lib/research";
import { DAILY_DEPTH, moveOf, positionLabel, readKeywords, readTarget, summarize, type Move } from "@/lib/rankTrack";
import type { KeywordRow } from "@/lib/rankTrackServer";
import type { RunAuth } from "@/lib/runner";
import { useStash } from "@/lib/stash";
import { askConfirm } from "./Dialogs";
import { EmptyScreen } from "./Drawing";
import { Dropdown } from "./Pickers";
import { Modal } from "./reports/Dialog";
import { post } from "./research/shared";
import { Sheet, type Col } from "./Sheet";
import { Seg, Spark, StatStrip, Thinking } from "./ui";

// Visibility › Traffic: projects that track where a domain or one page ranks on Google for chosen keywords, every day.
// The list shows each project's numbers; a project opens to its keywords with their positions and moves.

type Summary = ReturnType<typeof summarize>;
type ProjectRow = {
  id: string;
  name: string;
  target: string;
  scope: "domain" | "url";
  location: number;
  device: "desktop" | "mobile";
  paused: boolean;
  created_at: string;
  keywords: number;
  lastDay: string | null;
  now: Summary | null;
  before: Summary | null;
  trend: number[];
};
type ListData = { projects: ProjectRow[]; used: number; limit: number };
type Detail = { project: ProjectRow; keywords: KeywordRow[] };

const fmt = (n: number) => n.toLocaleString("en-US");
const countryOf = (loc: number) => COUNTRIES.find((c) => c.location === loc);
const flag = (iso: string | undefined) => (iso && iso.length === 2 ? String.fromCodePoint(...[...iso.toUpperCase()].map((c) => 127397 + c.charCodeAt(0))) : "");
const shortDay = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric" });

/** A move as a small colored number: green up, red down. */
function MoveTag({ m, unit = "" }: { m: Move; unit?: string }) {
  if (m.kind === "up") return <span className="aw-move is-up">▲ {m.by}{unit}</span>;
  if (m.kind === "down") return <span className="aw-move is-down">▼ {m.by}{unit}</span>;
  if (m.kind === "new") return <span className="aw-move is-up">New</span>;
  if (m.kind === "lost") return <span className="aw-move is-down">Lost</span>;
  return <span className="text-muted">–</span>;
}
/** A number's change, where up is good: visibility and counts. */
function Delta({ now, before, unit = "" }: { now: number | null | undefined; before: number | null | undefined; unit?: string }) {
  if (now == null || before == null) return null;
  const d = Math.round((now - before) * 10) / 10;
  if (!d) return null;
  return <span className={`aw-move ${d > 0 ? "is-up" : "is-down"}`}>{d > 0 ? "▲" : "▼"} {Math.abs(d)}{unit}</span>;
}

export function TrafficProjects({ auth, canEdit, brandId, brandDomain }: { auth: RunAuth; canEdit: boolean; brandId: string; brandDomain: string }) {
  const [list, setList] = useStash<ListData | null>(`rank:${auth.workspaceId}`, null);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [open, setOpen] = useState<string | null>(() => (typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("project")));

  const load = useCallback(async () => {
    try {
      setList(await post<ListData>(auth, "/api/rank", { action: "list" }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setList({ projects: [], used: 0, limit: 0 });
    }
  }, [auth, setList]);
  useEffect(() => {
    // Loading on first render is the point of this effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  // The open project lives in the address, so a link opens it and Back closes it.
  const openProject = (id: string | null) => {
    setOpen(id);
    const params = new URLSearchParams(window.location.search);
    if (id) params.set("project", id);
    else params.delete("project");
    window.history.pushState(null, "", window.location.pathname + (params.size ? `?${params}` : ""));
  };
  useEffect(() => {
    const back = () => setOpen(new URLSearchParams(window.location.search).get("project"));
    window.addEventListener("popstate", back);
    return () => window.removeEventListener("popstate", back);
  }, []);

  if (!list) return <Thinking text="Loading projects..." />;
  const project = open ? list.projects.find((p) => p.id === open) : null;
  if (open && project)
    return (
      <ProjectPage
        auth={auth}
        canEdit={canEdit}
        project={project}
        limit={list.limit}
        used={list.used}
        onBack={() => {
          openProject(null);
          load();
        }}
        onChanged={load}
      />
    );

  const dialog = creating ? (
    <NewProject
      auth={auth}
      brandId={brandId}
      suggest={brandDomain}
      room={Math.max(0, list.limit - list.used)}
      onClose={() => setCreating(false)}
      onCreated={(id) => {
        setCreating(false);
        load().then(() => openProject(id));
      }}
    />
  ) : null;

  const head = (
    <header className="flex flex-wrap items-center justify-between gap-3">
      <h1 className="aw-h2 mb-0!">Traffic</h1>
      {list.projects.length && canEdit ? (
        <span className="flex flex-wrap items-center gap-3">
          <span className="text-[13px] text-muted">
            {fmt(list.used)} of {fmt(list.limit)} keywords
          </span>
          <button type="button" className="aw-btn aw-btn--primary aw-btn--sm" onClick={() => setCreating(true)}>
            New project
          </button>
        </span>
      ) : null}
    </header>
  );

  if (!list.projects.length)
    return (
      <div className="flex flex-col gap-5">
        {head}
        {error ? <p className="aw-error">{error}</p> : null}
        <EmptyScreen
          drawing="traffic"
          title="Track where you rank"
          action={
            canEdit ? (
              <button type="button" className="aw-btn aw-btn--primary" onClick={() => setCreating(true)}>
                New project
              </button>
            ) : undefined
          }
        >
          {canEdit ? "Pick a site or a page and the keywords to follow. Arrowsterr checks Google every day." : "Ask an editor to create a project."}
        </EmptyScreen>
        {dialog}
      </div>
    );

  const cols: Col<ProjectRow>[] = [
    {
      id: "name",
      label: "Project",
      type: "text",
      width: 280,
      value: (p) => p.name,
      cell: (p) => (
        <span className="flex min-w-0 flex-col py-0.5 leading-tight">
          <span className="font-medium text-ink">{p.name}</span>
          <span className="text-[12px] text-muted">
            {flag(countryOf(p.location)?.iso)} {p.target}
            {p.scope === "url" ? " (page)" : ""}
          </span>
        </span>
      ),
    },
    { id: "keywords", label: "Keywords", type: "number", width: 110, value: (p) => p.keywords },
    {
      id: "visibility",
      label: "Visibility",
      type: "number",
      width: 150,
      value: (p) => p.now?.visibility ?? null,
      cell: (p) =>
        p.now ? (
          <span className="inline-flex items-center gap-2">
            {p.now.visibility}%
            <Delta now={p.now.visibility} before={p.before?.visibility} />
          </span>
        ) : (
          <span className="text-muted">–</span>
        ),
    },
    { id: "trend", label: "Last 30 days", type: "number", width: 150, value: (p) => p.trend.at(-1) ?? null, cell: (p) => (p.trend.length > 1 ? <Spark values={p.trend} className="aw-spark--cell" /> : <span className="text-muted">–</span>) },
    { id: "avg", label: "Avg position", type: "number", width: 120, value: (p) => p.now?.avg ?? null },
    { id: "top3", label: "Top 3", type: "number", width: 90, value: (p) => p.now?.top3 ?? null },
    { id: "top10", label: "Top 10", type: "number", width: 90, value: (p) => p.now?.top10 ?? null },
    { id: "device", label: "Device", type: "list", width: 100, value: (p) => (p.device === "mobile" ? "Mobile" : "Desktop") },
    { id: "last", label: "Checked", type: "date", width: 110, value: (p) => p.lastDay, cell: (p) => (p.paused ? <span className="aw-status aw-status--pending">Paused</span> : p.lastDay ? shortDay(p.lastDay) : <span className="text-muted">Today</span>) },
  ];

  return (
    <div className="flex flex-col gap-5">
      {head}
      {error ? <p className="aw-error">{error}</p> : null}
      <Sheet<ProjectRow> id="rank-projects" label="Projects" rows={list.projects} cols={cols} rowKey={(p) => p.id} sort={{ key: "visibility", desc: true }} onOpen={(p) => openProject(p.id)} letters height="70vh" />
      {dialog}
    </div>
  );
}

function NewProject({ auth, brandId, suggest, room, onClose, onCreated }: { auth: RunAuth; brandId: string; suggest: string; room: number; onClose: () => void; onCreated: (id: string) => void }) {
  const [name, setName] = useState("");
  const [target, setTarget] = useState(suggest);
  const [location, setLocation] = useState(2840);
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [keywords, setKeywords] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const t = readTarget(target);
  const count = readKeywords(keywords).length;
  async function create() {
    if (!t) return setError("Type a domain like stride.com, or a page's address.");
    setBusy(true);
    setError("");
    try {
      const res = await post<{ project: { id: string } }>(auth, "/api/rank", { action: "create", name, target, location, device, keywords, brandId });
      onCreated(res.project.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }
  return (
    <Modal title="New project" onClose={onClose}>
      <div className="mt-4 flex flex-col gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="aw-field-label">Site or page</span>
          <input className="aw-input" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="stride.com or stride.com/blog/best-shoes" autoFocus />
          {target && t ? <span className="text-[12px] text-muted">{t.scope === "url" ? "Only this page counts" : "Every page on this site counts"}</span> : null}
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="aw-field-label">Name</span>
          <input className="aw-input" value={name} onChange={(e) => setName(e.target.value)} placeholder={t?.target ?? "Project name"} />
        </label>
        <div className="flex flex-wrap gap-3">
          <label className="flex min-w-48 flex-1 flex-col gap-1.5">
            <span className="aw-field-label">Country</span>
            <Dropdown label="Country" value={location} onChange={setLocation} options={COUNTRIES.map((c) => ({ id: c.location, label: `${flag(c.iso)} ${c.name}` }))} />
          </label>
          <div className="flex flex-col gap-1.5">
            <span className="aw-field-label">Device</span>
            <Seg label="Device" value={device} onChange={setDevice} options={[{ id: "desktop", label: "Desktop" }, { id: "mobile", label: "Mobile" }]} />
          </div>
        </div>
        <label className="flex flex-col gap-1.5">
          <span className="aw-field-label">Keywords</span>
          <textarea className="aw-input h-32! py-2!" value={keywords} onChange={(e) => setKeywords(e.target.value)} placeholder={"One per line\nbest running shoes\nrunning shoes for flat feet"} />
          <span className={`text-[12px] ${count > room ? "text-neg" : "text-muted"}`}>
            {count} of {fmt(room)} left on your plan
          </span>
        </label>
        {error ? <p className="aw-error">{error}</p> : null}
        <div className="flex justify-end gap-2">
          <button type="button" className="aw-btn aw-btn--secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="aw-btn aw-btn--primary" onClick={create} disabled={busy || !t}>
            {busy ? "Creating..." : "Create project"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function ProjectPage({ auth, canEdit, project, limit, used, onBack, onChanged }: { auth: RunAuth; canEdit: boolean; project: ProjectRow; limit: number; used: number; onBack: () => void; onChanged: () => void }) {
  const [days, setDays] = useState<"7" | "30" | "90">("30");
  const [data, setData] = useState<Detail | null>(null);
  const [error, setError] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await post<Detail>(auth, "/api/rank", { action: "detail", projectId: project.id, days: Number(days) }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [auth, project.id, days]);
  useEffect(() => {
    // Loading on first render, and again when the range changes, is the point of this effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);
  // While today's checks are out, look again every 20 seconds.
  const waiting = Boolean(data?.keywords.some((k) => k.history.length && !k.history.at(-1)!.checked));
  useEffect(() => {
    if (!waiting) return;
    const t = setInterval(load, 20_000);
    return () => clearInterval(t);
  }, [waiting, load]);

  const rows = useMemo(() => data?.keywords ?? [], [data]);
  const lastChecked = (k: KeywordRow) => [...k.history].reverse().find((h) => h.checked);
  const nowOf = (k: KeywordRow) => lastChecked(k)?.position ?? null;
  const agoOf = (k: KeywordRow, n: number) => {
    const last = lastChecked(k);
    if (!last) return undefined;
    const cut = new Date(new Date(`${last.day}T12:00:00Z`).getTime() - n * 864e5).toISOString().slice(0, 10);
    const h = [...k.history].reverse().find((x) => x.checked && x.day <= cut);
    return h ? h.position : undefined;
  };
  const sum = summarize(rows.map((k) => (lastChecked(k) ? nowOf(k) : undefined)));
  const sumBefore = summarize(rows.map((k) => agoOf(k, 7)));
  // Visibility by day across the range, for the lead number's line.
  const daysList = [...new Set(rows.flatMap((k) => k.history.filter((h) => h.checked).map((h) => h.day)))].sort();
  const trend = daysList.map((d) => summarize(rows.map((k) => k.history.find((h) => h.day === d && h.checked)?.position ?? null)).visibility);

  async function remove(ids: string[]) {
    if (!ids.length) return;
    if (!(await askConfirm({ title: ids.length === 1 ? "Stop tracking this keyword?" : `Stop tracking ${ids.length} keywords?`, text: "Its history goes too.", action: "Remove" }))) return;
    try {
      await post(auth, "/api/rank", { action: "keywords_remove", projectId: project.id, ids });
      setPicked(new Set());
      load();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }
  async function deleteProject() {
    if (!(await askConfirm({ title: `Delete ${project.name}?`, text: "Its keywords and their history go too.", action: "Delete" }))) return;
    try {
      await post(auth, "/api/rank", { action: "delete", projectId: project.id });
      onBack();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }
  async function pause() {
    try {
      await post(auth, "/api/rank", { action: "update", projectId: project.id, paused: !project.paused });
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  const cols: Col<KeywordRow>[] = [
    { id: "keyword", label: "Keyword", type: "text", width: 280, value: (k) => k.keyword },
    {
      id: "position",
      label: "Position",
      type: "number",
      width: 100,
      value: (k) => nowOf(k),
      cell: (k) => {
        const last = lastChecked(k);
        if (!last) return <span className="text-muted">{k.error ? "Retrying" : "Checking"}</span>;
        const label = positionLabel(last.position, last.depth, true);
        return last.position ? <span className="font-medium text-ink">{label}</span> : <span className="text-muted">{label}</span>;
      },
    },
    { id: "d1", label: "1 day", type: "number", width: 90, value: (k) => { const m = moveOf(nowOf(k), agoOf(k, 1)); return m.kind === "up" ? m.by : m.kind === "down" ? -m.by : null; }, cell: (k) => <MoveTag m={moveOf(nowOf(k), agoOf(k, 1))} /> },
    { id: "d7", label: "7 days", type: "number", width: 90, value: (k) => { const m = moveOf(nowOf(k), agoOf(k, 7)); return m.kind === "up" ? m.by : m.kind === "down" ? -m.by : null; }, cell: (k) => <MoveTag m={moveOf(nowOf(k), agoOf(k, 7))} /> },
    { id: "best", label: "Best", type: "number", width: 80, value: (k) => { const p = k.history.map((h) => h.position).filter((x): x is number => Boolean(x)); return p.length ? Math.min(...p) : null; } },
    {
      id: "history",
      label: `Last ${days} days`,
      type: "number",
      width: 140,
      value: (k) => nowOf(k),
      cell: (k) => {
        const pts = k.history.filter((h) => h.checked).map((h) => -(h.position ?? (h.depth || DAILY_DEPTH) + 1));
        return pts.length > 1 ? <Spark values={pts} className="aw-spark--cell" /> : <span className="text-muted">–</span>;
      },
    },
    { id: "volume", label: "Searches", type: "number", width: 110, value: (k) => k.volume },
    { id: "url", label: "Ranking page", type: "text", width: 280, value: (k) => k.url, cell: (k) => (k.url ? <span className="text-muted">{k.url.replace(/^https?:\/\/(www\.)?/, "")}</span> : <span className="text-muted">–</span>) },
    { id: "features", label: "On the page", type: "text", width: 220, value: (k) => k.features.join(", ") },
    { id: "tags", label: "Tags", type: "text", width: 140, value: (k) => k.tags.join(", "), cell: (k) => (k.tags.length ? <span className="flex gap-1">{k.tags.map((t) => <span key={t} className="aw-chip">{t}</span>)}</span> : <span className="text-muted">–</span>) },
  ];

  const opened = open ? rows.find((k) => k.id === open) : null;
  const country = countryOf(project.location);
  const bulk = picked.size ? (
    <span className="flex flex-wrap items-center gap-2">
      <span className="text-[13px] font-medium text-ink">{picked.size} selected</span>
      <button type="button" className="aw-btn aw-btn--ghost aw-btn--sm" onClick={() => remove([...picked])}>
        Remove
      </button>
    </span>
  ) : null;

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-3">
        <button type="button" className="aw-text-link self-start text-[13px]" onClick={onBack}>
          ← Traffic
        </button>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 flex-col">
            <h1 className="aw-h2 mb-0!">{project.name}</h1>
            <span className="text-[13px] text-muted">
              {flag(country?.iso)} {country?.name}, {project.device === "mobile" ? "mobile" : "desktop"}, {project.target}
              {project.scope === "url" ? " (this page only)" : ""}
            </span>
          </div>
          <span className="flex flex-wrap items-center gap-2">
            <Seg label="Range" value={days} onChange={setDays} options={[{ id: "7", label: "7 days" }, { id: "30", label: "30 days" }, { id: "90", label: "90 days" }]} />
            {canEdit ? (
              <>
                <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm" onClick={pause}>
                  {project.paused ? "Resume" : "Pause"}
                </button>
                <button type="button" className="aw-btn aw-btn--ghost aw-btn--sm" onClick={deleteProject}>
                  Delete
                </button>
                <button type="button" className="aw-btn aw-btn--primary aw-btn--sm" onClick={() => setAdding(true)}>
                  Add keywords
                </button>
              </>
            ) : null}
          </span>
        </div>
      </header>
      {error ? <p className="aw-error">{error}</p> : null}
      {!data ? (
        <Thinking text="Loading keywords..." />
      ) : !rows.length ? (
        <EmptyScreen
          drawing="search"
          title="Add the keywords to follow"
          fill={false}
          action={
            canEdit ? (
              <button type="button" className="aw-btn aw-btn--primary" onClick={() => setAdding(true)}>
                Add keywords
              </button>
            ) : undefined
          }
        >
          The first check runs within a few minutes.
        </EmptyScreen>
      ) : (
        <>
          <StatStrip
            spark={trend.length > 1 ? trend : undefined}
            stats={[
              { label: "Visibility", value: `${sum.visibility}%`, delta: <Delta now={sum.visibility} before={sumBefore.checked ? sumBefore.visibility : null} unit=" pts" /> },
              { label: "Avg position", value: sum.avg ?? "–", delta: sum.avg != null && sumBefore.avg != null && sum.avg !== sumBefore.avg ? <MoveTag m={moveOf(Math.round(sum.avg), Math.round(sumBefore.avg))} /> : null },
              { label: "Top 3", value: sum.top3, delta: <Delta now={sum.top3} before={sumBefore.checked ? sumBefore.top3 : null} /> },
              { label: "Top 10", value: sum.top10, delta: <Delta now={sum.top10} before={sumBefore.checked ? sumBefore.top10 : null} /> },
              { label: "Keywords", value: `${rows.length}`, sub: `${fmt(used)} of ${fmt(limit)} on your plan` },
            ]}
          />
          <Sheet<KeywordRow>
            id={`rank:${project.id}`}
            label="Keywords"
            rows={rows}
            cols={cols}
            rowKey={(k) => k.id}
            sort={{ key: "volume", desc: true }}
            letters
            selected={canEdit ? picked : undefined}
            onSelect={canEdit ? setPicked : undefined}
            onOpen={(k) => setOpen(k.id)}
            onDeleteRows={canEdit ? remove : undefined}
            toolbar={bulk}
            height="64vh"
          />
        </>
      )}
      {adding ? (
        <AddKeywords
          auth={auth}
          projectId={project.id}
          room={Math.max(0, limit - used)}
          onClose={() => setAdding(false)}
          onAdded={() => {
            setAdding(false);
            load();
            onChanged();
          }}
        />
      ) : null}
      {opened ? <KeywordPanel row={opened} onClose={() => setOpen(null)} /> : null}
    </div>
  );
}

function AddKeywords({ auth, projectId, room, onClose, onAdded }: { auth: RunAuth; projectId: string; room: number; onClose: () => void; onAdded: () => void }) {
  const [text, setText] = useState("");
  const [tag, setTag] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const count = readKeywords(text).length;
  async function add() {
    setBusy(true);
    setError("");
    try {
      const res = await post<{ added: number; skipped: number }>(auth, "/api/rank", { action: "keywords_add", projectId, text, tags: tag.trim() ? [tag.trim()] : [] });
      if (res.skipped && !res.added) {
        setError("Your plan has no room for more keywords.");
        setBusy(false);
        return;
      }
      onAdded();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }
  return (
    <Modal title="Add keywords" onClose={onClose}>
      <div className="mt-4 flex flex-col gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="aw-field-label">Keywords</span>
          <textarea className="aw-input h-40! py-2!" value={text} onChange={(e) => setText(e.target.value)} placeholder="One per line" autoFocus />
          <span className={`text-[12px] ${count > room ? "text-neg" : "text-muted"}`}>
            {count} of {fmt(room)} left on your plan
          </span>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="aw-field-label">Tag</span>
          <input className="aw-input" value={tag} onChange={(e) => setTag(e.target.value)} placeholder="Optional, like Blog or Product" />
        </label>
        {error ? <p className="aw-error">{error}</p> : null}
        <div className="flex justify-end gap-2">
          <button type="button" className="aw-btn aw-btn--secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="aw-btn aw-btn--primary" onClick={add} disabled={busy || !count}>
            {busy ? "Adding..." : count ? `Add ${count}` : "Add"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function KeywordPanel({ row, onClose }: { row: KeywordRow; onClose: () => void }) {
  const checked = row.history.filter((h) => h.checked);
  return (
    <Modal title={row.keyword} onClose={onClose} width="max-w-2xl">
      <div className="mt-4 flex flex-col gap-5">
        {row.top?.length ? (
          <section className="flex flex-col gap-2">
            <h3 className="aw-h4">Top 10 on the last check</h3>
            <table className="aw-table text-[13px]">
              <tbody>
                {row.top.map((t) => (
                  <tr key={`${t.rank}-${t.url}`} className={row.url && t.url === row.url ? "bg-[var(--v10-signal-soft)]" : ""}>
                    <td className="w-10 text-right font-mono">{t.rank}</td>
                    <td className="wrap-anywhere">{t.url.replace(/^https?:\/\/(www\.)?/, "")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ) : null}
        {checked.length ? (
          <section className="flex flex-col gap-2">
            <h3 className="aw-h4">By day</h3>
            <div className="flex flex-wrap gap-1.5">
              {[...checked].reverse().slice(0, 30).map((h) => (
                <span key={h.day} className="aw-chip" title={h.day}>
                  {shortDay(h.day)}: {positionLabel(h.position, h.depth, true)}
                </span>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </Modal>
  );
}
