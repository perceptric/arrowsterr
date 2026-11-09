"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { layout, mapStats, type ContentMap, type Topic, type TopicStatus } from "@/lib/contentMap";
import type { RunAuth } from "@/lib/runner";
import { ToolIntro } from "./ToolIntro";
import { Card, SidePanel, Thinking } from "./ui";
import { ChangeSetCard, useApi } from "./ZippiePage";

// Content Map (docs/content-map.md): the brand's topics as bubbles around their pillars. Green is covered, blue in
// progress, red dashed missing, amber two pages competing; a star means AI names the brand for it. Lines run from
// each pillar's main page: solid when it links to the topic's page, dashed when it doesn't.

type Row = { id: string; status: "running" | "done" | "failed"; step: string; error: string | null; created_at: string; result?: ContentMap | null };
type Brand = { id: string; name: string; domain: string };
type Filter = "all" | "missing" | "overlap" | "ai" | "unlinked";

const COLORS: Record<TopicStatus, [string, string]> = {
  covered: ["var(--aw-pos-bg)", "var(--aw-pos)"],
  progress: ["var(--aw-brand-bg)", "var(--aw-brand)"],
  missing: ["var(--aw-neg-bg)", "var(--aw-neg)"],
  overlap: ["var(--aw-warn-bg)", "var(--aw-warn)"],
};
const LABEL: Record<TopicStatus, string> = { covered: "Covered", progress: "In progress", missing: "Missing", overlap: "Two pages compete" };
const TAG: Record<TopicStatus, string> = { covered: "aw-status--ranked", progress: "aw-status--pending", missing: "aw-status--missed", overlap: "aw-status--warn" };
const n = (x: number) => x.toLocaleString("en-US");
const when = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));
const STAR = "M0-12l2.6 7 7.4 2.6-7.4 2.6L0 7.2l-2.6-7L-10-2.4l7.4-2.6z";

export function ContentMapPage({ brand, sb, auth, canEdit, onConnect }: { brand: Brand; sb: SupabaseClient; auth: RunAuth; canEdit: boolean; onConnect: () => void }) {
  const api = useApi(auth);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [map, setMap] = useState<{ id: string; m: ContentMap } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [sel, setSel] = useState<string | null>(null);
  const [planned, setPlanned] = useState<Set<string>>(new Set());
  const [setId, setSetId] = useState<string | null>(null);
  const [needsSite, setNeedsSite] = useState("");

  const load = useCallback(async () => {
    const { data, error: e } = await sb.from("content_maps").select("id, status, step, error, created_at").eq("brand_id", brand.id).order("created_at", { ascending: false }).limit(5);
    if (e) return setError(/content_maps/.test(e.message) ? "Run supabase/065_content_map.sql in Supabase." : e.message);
    const list = (data ?? []) as Row[];
    setRows(list);
    const done = list.find((r) => r.status === "done");
    if (done && done.id !== map?.id) {
      const { data: full } = await sb.from("content_maps").select("result").eq("id", done.id).maybeSingle();
      if (full?.result) setMap({ id: done.id, m: full.result as ContentMap });
    }
  }, [sb, brand.id, map?.id]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);
  const running = rows?.[0]?.status === "running" ? rows[0] : null;
  useEffect(() => {
    if (!running) return;
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [running, load]);

  const call = <T,>(action: string, extra: Record<string, unknown> = {}) => api<T>("/api/content-map", { action, brandId: brand.id, ...extra });
  async function build() {
    setBusy("build");
    setError("");
    try {
      await call("start");
      await load();
    } catch (e) {
      setError(msg(e));
    } finally {
      setBusy("");
    }
  }
  async function addToPlan(t: Topic) {
    setBusy(`plan:${t.id}`);
    setError("");
    try {
      await call("plan", { keyword: t.name, volume: t.volume, pillar: t.pillar });
      setPlanned((s) => new Set(s).add(t.id));
    } catch (e) {
      setError(msg(e));
    } finally {
      setBusy("");
    }
  }
  async function addLinks(hub: string) {
    setBusy("links");
    setError("");
    setNeedsSite("");
    try {
      setSetId((await call<{ setId: string }>("links", { hub })).setId);
    } catch (e) {
      if (/^Connect /.test(msg(e))) setNeedsSite(msg(e));
      else setError(msg(e));
    } finally {
      setBusy("");
    }
  }

  const m = map?.m ?? null;
  const geo = useMemo(() => (m ? layout(m) : null), [m]);
  const byId = useMemo(() => new Map((m?.topics ?? []).map((t) => [t.id, t])), [m]);
  const show = (t: Topic) => filter === "all" || (filter === "missing" && (t.status === "missing" || t.status === "progress")) || (filter === "overlap" && t.status === "overlap") || (filter === "ai" && t.ai) || (filter === "unlinked" && t.linked === false);
  const stats = m ? mapStats(m.topics) : null;
  const lastFailed = rows?.[0]?.status === "failed" ? rows[0] : null;

  const head = (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <h1 className="aw-h2 mb-0!">Content Map</h1>
      {m ? (
        <div className="flex flex-wrap items-center gap-3 text-[12px] text-muted">
          <span>Updated {when(m.at)}</span>
          {canEdit ? (
            <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm" onClick={build} disabled={Boolean(running) || busy === "build"}>
              {running ? "Building" : "Rebuild"}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );

  if (rows === null) return <div className="flex flex-col gap-6">{head}{error ? <p className="aw-error">{error}</p> : <Thinking text="Loading" />}</div>;

  return (
    <div className="flex flex-col gap-6">
      {head}
      {error ? <p className="aw-error">{error}</p> : null}
      {needsSite ? (
        <div className="aw-callout flex flex-wrap items-center justify-between gap-3">
          <span>{needsSite}</span>
          <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm" onClick={onConnect}>
            Connect website
          </button>
        </div>
      ) : null}
      {running ? <Thinking text={running.step || "Building"} /> : lastFailed ? <p className="aw-error">The last build failed: {lastFailed.error}</p> : null}

      {!m && !running ? (
        <ToolIntro
          title={`Map ${brand.domain}'s topics`}
          lead="Every topic you cover, the ones your rivals win and you don't, and the pages that compete with each other."
          action={canEdit ? <button type="button" className="aw-btn aw-btn--primary" onClick={build} disabled={busy === "build"}>{busy === "build" ? "Starting" : "Build the map"}</button> : <p className="aw-small">Ask an editor to build the map.</p>}
        />
      ) : null}

      {m && geo && stats ? (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <Stat label="Topics" value={stats.topics} />
            <Stat label="Covered" value={stats.covered} color="var(--aw-pos)" />
            <Stat label="Missing" value={stats.missing} color="var(--aw-neg)" />
            <Stat label="Pages competing" value={stats.overlap} color="var(--aw-warn)" />
            <Stat label="In progress" value={stats.progress} color="var(--aw-brand)" />
          </div>
          <div className="flex flex-wrap gap-2">
            {([["all", "All"], ["missing", "Missing"], ["overlap", "Competing"], ["ai", "Named by AI"], ["unlinked", "Link missing"]] as [Filter, string][]).map(([k, l]) => (
              <button key={k} type="button" aria-pressed={filter === k} onClick={() => setFilter(k)} className={`aw-btn aw-btn--sm ${filter === k ? "aw-btn--primary" : "aw-btn--secondary"}`}>
                {l}
              </button>
            ))}
          </div>
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
            <Card>
              <div className="overflow-x-auto p-3">
                <svg viewBox={`0 0 ${geo.w} ${geo.h}`} className="block h-auto w-full" style={{ minWidth: Math.min(geo.w, 720) }} role="img" aria-label="Content map">
                  {geo.nodes.filter((x) => !x.pillar).map((x) => {
                    const t = byId.get(x.id)!;
                    const hub = geo.nodes.find((p) => p.pillar && p.label === t.pillar)!;
                    return <line key={`l${x.id}`} x1={hub.x} y1={hub.y} x2={x.x} y2={x.y} stroke={t.linked === false ? "var(--aw-faint)" : "var(--aw-rule)"} strokeWidth={t.linked ? 2 : 1.2} strokeDasharray={t.linked === false ? "4 4" : t.linked === null ? "1 4" : undefined} opacity={show(t) ? 1 : 0.15} />;
                  })}
                  {geo.nodes.map((x) => {
                    if (x.pillar)
                      return (
                        <g key={x.id} className="cursor-pointer" onClick={() => setSel(x.id)} role="button" tabIndex={0} aria-label={x.label} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setSel(x.id)}>
                          <circle cx={x.x} cy={x.y} r={x.r} fill="var(--aw-surface)" stroke="var(--aw-ink)" strokeWidth={sel === x.id ? 3 : 2} />
                          <text x={x.x} y={x.y + x.r + 16} textAnchor="middle" fill="var(--aw-ink)" style={{ font: "600 12.5px Inter, system-ui, sans-serif" }}>
                            {x.label}
                          </text>
                        </g>
                      );
                    const t = byId.get(x.id)!;
                    const [fill, stroke] = COLORS[t.status];
                    return (
                      <g key={x.id} className="cursor-pointer" opacity={show(t) ? 1 : 0.18} onClick={() => setSel(x.id)} role="button" tabIndex={0} aria-label={`${t.name}, ${LABEL[t.status]}`} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setSel(x.id)}>
                        <circle cx={x.x} cy={x.y} r={x.r} fill={fill} stroke={stroke} strokeWidth={sel === x.id ? 3 : 1.5} strokeDasharray={t.status === "missing" ? "4 3" : undefined} />
                        {t.ai ? <path transform={`translate(${x.x + x.r * 0.7},${x.y - x.r * 0.7}) scale(.5)`} d={STAR} fill="var(--aw-brand)" /> : null}
                        <title>{`${t.name}: ${LABEL[t.status]}, ${n(t.volume)} searches`}</title>
                        <text x={x.x} y={x.y + x.r + 12} textAnchor="middle" fill="var(--aw-body)" style={{ font: "10.5px Inter, system-ui, sans-serif" }}>
                          {t.name.length > 26 ? `${t.name.slice(0, 25)}…` : t.name}
                        </text>
                      </g>
                    );
                  })}
                </svg>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 px-4 pb-4 text-[12px] text-muted">
                {(Object.keys(LABEL) as TopicStatus[]).map((s) => (
                  <span key={s} className="flex items-center gap-1.5">
                    <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: COLORS[s][0], boxShadow: `inset 0 0 0 1.5px ${COLORS[s][1]}` }} />
                    {LABEL[s]}
                  </span>
                ))}
                <span className="flex items-center gap-1.5">
                  <svg width="12" height="12" viewBox="-12 -12 24 24" aria-hidden="true">
                    <path d={STAR} fill="var(--aw-brand)" />
                  </svg>
                  Named by AI
                </span>
                <span>Dashed line: no link from the pillar&apos;s main page</span>
              </div>
            </Card>
            <Card>
              <div className="flex flex-col gap-3 px-5 py-4">
                <Detail m={m} sel={sel} canEdit={canEdit} busy={busy} planned={planned} onPlan={addToPlan} onLinks={addLinks} />
              </div>
            </Card>
          </div>
        </>
      ) : null}

      {setId ? (
        <SidePanel title="Review the links" onClose={() => setSetId(null)}>
          <ChangeSetCard id={setId} api={api} canEdit={canEdit} />
        </SidePanel>
      ) : null}
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <Card>
      <div className="flex flex-col gap-1 px-4 py-3.5">
        <span className="text-[12px] font-medium text-muted">{label}</span>
        <span className="aw-num text-[22px] font-semibold" style={{ color: color ?? "var(--aw-ink)" }}>
          {value}
        </span>
      </div>
    </Card>
  );
}

function Detail({ m, sel, canEdit, busy, planned, onPlan, onLinks }: { m: ContentMap; sel: string | null; canEdit: boolean; busy: string; planned: Set<string>; onPlan: (t: Topic) => void; onLinks: (hub: string) => void }) {
  if (sel?.startsWith("p:")) {
    const name = sel.slice(2);
    const p = m.pillars.find((x) => x.name === name);
    const list = m.topics.filter((t) => t.pillar === name);
    const gaps = list.filter((t) => t.status === "missing").sort((a, b) => b.volume - a.volume);
    const unlinked = list.filter((t) => t.linked === false);
    return (
      <>
        <h2 className="aw-h4">{name}</h2>
        <p className="text-[13px] text-muted">
          {list.length} topics, {gaps.length} missing
        </p>
        {p?.hub ? (
          <a href={p.hub} target="_blank" rel="noreferrer" className="text-[13px] text-brand wrap-anywhere hover:underline">
            {p.hub}
          </a>
        ) : (
          <p className="text-[13px] text-muted">No main page yet.</p>
        )}
        {p?.hub && unlinked.length && canEdit ? (
          <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm self-start" onClick={() => onLinks(p.hub!)} disabled={busy === "links"}>
            {busy === "links" ? "Preparing" : `Add internal links (${unlinked.length} missing)`}
          </button>
        ) : null}
        {gaps.length ? (
          <ul className="flex flex-col">
            {gaps.slice(0, 8).map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-2 border-t border-[var(--aw-rule)] py-2 text-[13px] first:border-t-0">
                <span className="min-w-0 text-ink wrap-break-word">{t.name}</span>
                <span className="aw-num text-muted">{n(t.volume)}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </>
    );
  }
  const t = m.topics.find((x) => x.id === sel);
  if (!t) {
    const s = mapStats(m.topics);
    return (
      <>
        <h2 className="aw-h4">Map summary</h2>
        <p className="text-[13px] text-body">
          {s.missing} topics missing, {s.overlap} with pages competing, {s.unlinked} not linked from their pillar&apos;s main page. AI names you for {s.ai}.
        </p>
        {m.rivals.length ? <p className="text-[12px] text-muted wrap-anywhere">Compared with {m.rivals.join(", ")}</p> : <p className="text-[12px] text-muted">Add competitors with websites to the brand to see what they win.</p>}
      </>
    );
  }
  const isPlanned = t.planned || planned.has(t.id);
  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="aw-h4 wrap-break-word">{t.name}</h2>
          <p className="text-[12px] text-muted">{t.pillar}</p>
        </div>
        <span className={`aw-status ${TAG[t.status]}`}>{LABEL[t.status]}</span>
      </div>
      <dl className="grid grid-cols-2 gap-3">
        <div>
          <dt className="text-[12px] text-muted">Searches a month</dt>
          <dd className="aw-num m-0 text-[18px] font-semibold text-ink">{n(t.volume)}</dd>
        </div>
        <div>
          <dt className="text-[12px] text-muted">{t.urls.length ? "Your visits" : "Named by AI"}</dt>
          <dd className="aw-num m-0 text-[18px] font-semibold text-ink">{t.urls.length ? n(t.traffic) : t.ai ? "Yes" : "No"}</dd>
        </div>
      </dl>
      {t.urls.length ? (
        <div className="flex flex-col gap-1">
          <span className="text-[12px] text-muted">{t.urls.length > 1 ? "Your pages that compete" : "Your page"}</span>
          {t.urls.map((u) => (
            <a key={u} href={u} target="_blank" rel="noreferrer" className="text-[13px] text-brand wrap-anywhere hover:underline">
              {u}
            </a>
          ))}
          {t.linked === false ? <span className="text-[12px] text-neg">Not linked from the pillar&apos;s main page</span> : null}
        </div>
      ) : null}
      {t.rivals.length ? <p className="text-[13px] text-body wrap-anywhere">Ranks for it: {t.rivals.join(", ")}</p> : null}
      <p className="text-[12px] text-muted wrap-break-word">{t.keywords.join(", ")}</p>
      {canEdit && !t.urls.length ? (
        <button type="button" className="aw-btn aw-btn--primary aw-btn--sm self-start" onClick={() => onPlan(t)} disabled={isPlanned || busy === `plan:${t.id}`}>
          {isPlanned ? "On the Content Plan" : busy === `plan:${t.id}` ? "Adding" : "Add to Content Plan"}
        </button>
      ) : null}
    </>
  );
}
