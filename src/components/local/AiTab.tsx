"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { grid, placeText, type Location, type ScanResult } from "@/lib/local";
import { aiGridOf, aiVsMaps, type AiReads, type AiResult } from "@/lib/localAi";
import { LocalMap, MAP_COLORS, type MapDot } from "../LocalMap";
import { Card, StatStrip, Thinking } from "../ui";
import { saveCsv } from "./saveCsv";

// Local Research, AI answers (docs/local-research-plan.md, 4.6): where Google's AI Mode names the business across the
// grid, its place in the answer, what ChatGPT and Gemini say for the city, the businesses AI names instead and the
// sites AI cites.

type Call = <T>(action: string, extra?: Record<string, unknown>) => Promise<T>;
type Row = { id: string; keyword: string; status: "running" | "done" | "failed"; step: string; error: string | null; created_at: string; result: AiResult | null; reads: AiReads | null };
type Maps = { result: ScanResult | null; created_at: string };

const when = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
const pct = (x: number | null) => (x === null ? "–" : `${Math.round(x * 100)}%`);
const place = (n: number | null | undefined) => (n === null || n === undefined ? "–" : `#${n}`);
const engineCell = (v: number | null) => (v === null ? "–" : v === 0 ? "Not named" : `#${v}`);

const KEY = [
  { label: "Named 1st to 3rd", dot: MAP_COLORS.top3 },
  { label: "Named 4th or later", dot: MAP_COLORS.top10 },
  { label: "Not named", dot: "#E5484D" },
  { label: "No answer", dot: "#C8C8C8" },
];

/** A grid point as a dot: the business's place in the AI answer there. */
function aiDot(p: number | null | undefined): MapDot {
  if (p === undefined) return { label: "?", bg: "#FFFFFF", fg: "#9A9A9A", border: "#C8C8C8", dashed: true, aria: "No answer" };
  if (p === null) return { label: "–", bg: "#E5484D", fg: "#FFFFFF", border: "#FFFFFF", aria: "Not named" };
  return { label: String(p), bg: p <= 3 ? MAP_COLORS.top3 : MAP_COLORS.top10, fg: "#FFFFFF", border: "#FFFFFF", aria: `Named ${p}` };
}

export function AiTab({ sb, loc, canEdit, call, onError }: { sb: SupabaseClient; loc: Location & { id: string }; canEdit: boolean; call: Call; onError: (e: string) => void }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [maps, setMaps] = useState<Record<string, Maps>>({});
  const [kw, setKw] = useState(loc.keywords[0] ?? "");
  const [busy, setBusy] = useState(false);
  const [pt, setPt] = useState<number | null>(null);
  const [mapFailed, setMapFailed] = useState(false);
  const load = useCallback(async () => {
    const { data, error } = await sb.from("local_ai_scans").select("id, keyword, status, step, error, created_at, result, reads").eq("location_id", loc.id).order("created_at", { ascending: false }).limit(40);
    if (error) onError(/local_ai_scans/.test(error.message) ? "Run supabase/074_local_ai_scans.sql on the VPS database." : error.message);
    setRows((data ?? []) as Row[]);
    const { data: m } = await sb.from("local_scans").select("keyword, created_at, result").eq("location_id", loc.id).eq("status", "done").order("created_at", { ascending: false }).limit(30);
    const latest: Record<string, Maps> = {};
    for (const r of (m ?? []) as (Maps & { keyword: string })[]) if (!latest[r.keyword]) latest[r.keyword] = r;
    setMaps(latest);
  }, [sb, loc.id, onError]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);
  const running = rows?.some((r) => r.keyword === kw && r.status === "running") ?? false;
  useEffect(() => {
    if (!running) return;
    const t = setInterval(load, 15_000);
    return () => clearInterval(t);
  }, [running, load]);

  const mine = useMemo(() => (rows ?? []).filter((r) => r.keyword === kw), [rows, kw]);
  const last = mine.find((r) => r.status === "done" && r.result) ?? null;
  const live = mine[0]?.status === "running" ? mine[0] : null;
  const failed = mine[0]?.status === "failed" ? mine[0] : null;

  async function scanNow() {
    onError("");
    setBusy(true);
    try {
      await call("aiscan", { locationId: loc.id, keyword: kw });
      await load();
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const head = (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Keywords">
        {loc.keywords.map((k) => (
          <button
            key={k}
            type="button"
            aria-pressed={kw === k}
            onClick={() => {
              setKw(k);
              setPt(null);
            }}
            className="aw-chip aw-chip--btn"
          >
            {k}
          </button>
        ))}
      </div>
      {canEdit && kw ? (
        <button type="button" className="aw-btn aw-btn--primary aw-btn--sm" onClick={scanNow} disabled={busy || running}>
          {running ? "Asking AI" : "Scan now"}
        </button>
      ) : null}
    </div>
  );

  if (rows === null) return <Thinking text="Loading" />;
  if (!loc.keywords.length)
    return (
      <Card>
        <p className="px-5 py-5 text-[13.5px] text-body">Add a keyword on Rankings first.</p>
      </Card>
    );
  if (!last)
    return (
      <div className="flex flex-col gap-4">
        {head}
        <Card>
          <div className="flex flex-col items-start gap-3 px-5 py-5">
            <span className="aw-h4">{live ? "Asking AI" : `No AI answers for “${kw}” yet`}</span>
            <span className="text-[13.5px] text-body">
              Google&apos;s AI Mode is asked &ldquo;best {kw}&rdquo; from 25 points around you, and ChatGPT and Gemini once for your city. You see where AI names you, in what place, which businesses it names instead, and the sites it cites. It runs every month with your scans.
            </span>
            {live ? <Thinking text={live.step} /> : failed ? <span className="text-[13px] text-neg">{failed.error}</span> : null}
          </div>
        </Card>
      </div>
    );

  const r = last.result!;
  const reads = last.reads ?? {};
  const g = aiGridOf({ lat: r.center.lat, lng: r.center.lng, spacing: r.spacing, size: r.size, shape: r.shape, center: r.center });
  const inGrid = new Set(g.points.map((p) => p.i));
  const dots = Array.from({ length: r.size * r.size }, (_, i) => (inGrid.has(i) ? aiDot(r.pos[i]) : aiDot(undefined)));
  const m = maps[kw]?.result ?? null;
  const vs =
    m && m.center
      ? aiVsMaps(
          { pos: r.pos, points: g.points },
          { ranks: Array.from({ length: m.size * m.size }, (_, i) => { const p = m.points.find((x) => x.i === i); return p ? (p.error ? undefined : p.rank) : undefined; }), points: grid(m.center.lat, m.center.lng, m.spacing, m.size, m.shape ?? "square") },
        )
      : null;
  const me = r.businesses.find((b) => b.you);
  const ahead = r.businesses.filter((b) => !b.you && b.share > (me?.share ?? 0));
  const at = pt !== null ? reads[String(pt)] : undefined;
  const centre = Math.floor((r.size * r.size) / 2);

  return (
    <div className="flex flex-col gap-4">
      {head}
      {live ? <Thinking text={live.step} /> : null}
      <StatStrip
        stats={[
          { label: "AI Mode names you", value: pct(r.share), sub: `${me?.points ?? 0} of ${r.read} points`, tone: r.share !== null && r.share < 0.5 ? "warn" : undefined },
          { label: "Average place in the answer", value: place(r.avgPos) },
          { label: "ChatGPT, for the city", value: r.chatgpt ? (r.chatgpt.named ? `#${r.chatgpt.pos}` : "Not named") : "–", tone: r.chatgpt && !r.chatgpt.named ? "neg" : undefined },
          { label: "Gemini, for the city", value: r.gemini ? (r.gemini.named ? `#${r.gemini.pos}` : "Not named") : "–", tone: r.gemini && !r.gemini.named ? "neg" : undefined },
          { label: "Named more often than you", value: String(ahead.length), tone: ahead.length ? "warn" : undefined },
        ]}
      />
      {vs && (vs.mapsOnly || vs.aiOnly) ? (
        <p className="rounded-[10px] bg-[var(--signal-soft)] px-3.5 py-3 text-[13.5px] text-ink wrap-break-word">
          {vs.mapsOnly ? `At ${vs.mapsOnly} ${vs.mapsOnly === 1 ? "point" : "points"} you're in the Maps top 3 but AI Mode doesn't name you.` : ""}
          {vs.mapsOnly && vs.aiOnly ? " " : ""}
          {vs.aiOnly ? `At ${vs.aiOnly} ${vs.aiOnly === 1 ? "point" : "points"} AI Mode names you though you're outside the Maps top 3.` : ""}
        </p>
      ) : null}

      <Card title={`AI Mode across the grid, “${kw}”`}>
        <div className="relative px-3 pb-3">
          {mapFailed ? (
            <DotGrid dots={dots} size={r.size} inGrid={inGrid} sel={pt ?? -1} onSel={(i) => setPt(i === pt ? null : i)} />
          ) : (
            <LocalMap lat={r.center.lat} lng={r.center.lng} spacing={r.spacing} size={r.size} shape={r.shape} pin={{ lat: loc.lat, lng: loc.lng }} dots={dots} sel={pt ?? -1} onSel={(i) => setPt(i === pt ? null : i)} onFail={() => setMapFailed(true)} />
          )}
          {pt !== null ? (
            <div className="pointer-events-none absolute top-3 left-6 z-10 w-[min(320px,calc(100%-48px))]">
              <div className="pointer-events-auto rounded-[12px] bg-[var(--aw-surface)] shadow-[0_2px_12px_rgb(0_0_0_/_0.14)]">
                <div className="flex items-center justify-between gap-2 py-1.5 pr-1.5 pl-4">
                  <span className="text-[12px] font-semibold text-ink">{pt === centre ? "AI Mode at the centre" : `AI Mode ${placeText(pt, r.spacing, r.size)}`}</span>
                  <button type="button" className="aw-iconbtn h-7! w-7!" aria-label="Close" onClick={() => setPt(null)}>
                    ×
                  </button>
                </div>
                <div className="flex flex-col gap-2 px-4 pb-3 text-[13px]">
                  {at === undefined || at === null ? (
                    <span className="text-muted">No answer from this point.</span>
                  ) : !at.shown ? (
                    <span className="text-muted">Google showed no AI answer here.</span>
                  ) : at.named.length ? (
                    <ol className="flex flex-col gap-1">
                      {at.named.slice(0, 8).map((n) => (
                        <li key={n.key} className={`flex gap-2 ${n.you ? "font-semibold text-ink" : "text-body"}`}>
                          <span className="aw-num w-5 shrink-0 text-right">{n.pos}</span>
                          <span className="min-w-0 wrap-break-word">{n.you ? `${n.title} (you)` : n.title}</span>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <span className="text-muted">The answer names none of the businesses on Maps.</span>
                  )}
                  {at?.shown && at.text ? <p className="max-h-[140px] overflow-y-auto border-t border-[var(--border-medium)] pt-2 text-[12px] text-muted wrap-break-word">{at.text.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/[#*_`>]+/g, "")}</p> : null}
                </div>
              </div>
            </div>
          ) : null}
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 px-1 text-[12px] text-body">
            {KEY.map((t) => (
              <span key={t.label} className="flex items-center gap-1.5">
                <i className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: t.dot }} />
                {t.label}
              </span>
            ))}
            <span className="ml-auto text-muted">
              {r.size} × {r.size}, {r.spacing} mi between points, {when(last.created_at)}
            </span>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Card
          title="Businesses AI names"
          action={
            <button
              type="button"
              className="aw-btn aw-btn--secondary aw-btn--sm"
              onClick={() =>
                saveCsv(
                  `ai answers ${kw} ${last.created_at.slice(0, 10)}.csv`,
                  ["Business", "You", "AI Mode share", "Points named", "Points answered", "Average place", "ChatGPT", "Gemini", "Matched by"],
                  r.businesses.map((b) => [b.title, b.you ? "Yes" : "", `${Math.round(b.share * 100)}%`, b.points, r.read, b.avgPos, b.chatgpt === null ? "" : b.chatgpt === 0 ? "Not named" : b.chatgpt, b.gemini === null ? "" : b.gemini === 0 ? "Not named" : b.gemini, b.byName ? "Name" : "Link"]),
                )
              }
            >
              Export CSV
            </button>
          }
        >
          <div className="overflow-x-auto">
            <table className="aw-table">
              <thead>
                <tr>
                  <th>Business</th>
                  <th className="text-right">AI Mode</th>
                  <th className="text-right">Average place</th>
                  <th className="text-right">ChatGPT</th>
                  <th className="text-right">Gemini</th>
                </tr>
              </thead>
              <tbody>
                {r.businesses.map((b) => (
                  <tr key={b.key}>
                    <th scope="row" className={`text-left wrap-break-word ${b.you ? "font-semibold text-ink" : "font-medium text-body"}`}>
                      {b.you ? `${b.title} (you)` : b.title}
                      {b.byName && b.points ? <span className="aw-status ml-2 align-middle">By name</span> : null}
                    </th>
                    <td className="aw-num text-right">{pct(b.share)}</td>
                    <td className="aw-num text-right">{place(b.avgPos)}</td>
                    <td className="aw-num text-right">{engineCell(b.chatgpt)}</td>
                    <td className="aw-num text-right">{engineCell(b.gemini)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <Card title="Sites AI cites">
          {r.sources.length ? (
            <ul className="flex flex-col">
              {r.sources.map((s) => (
                <li key={s.domain} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-[var(--border-medium)] px-5 py-2.5 text-[13px] first:border-t-0">
                  <a href={`/backlinks?q=${encodeURIComponent(s.domain)}`} className="min-w-0 font-medium text-ink wrap-anywhere hover:underline">
                    {s.domain}
                  </a>
                  {s.whose ? <span className={`aw-status ${s.whose === "you" ? "aw-status--ranked" : ""}`}>{s.whose === "you" ? "Your site" : "Competitor site"}</span> : null}
                  <span className="aw-num ml-auto text-muted">
                    {s.n} {s.n === 1 ? "answer" : "answers"}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-5 pb-5 text-[13.5px] text-body">The answers cite no sites.</p>
          )}
        </Card>
      </div>
    </div>
  );
}

/** The grid drawn without a map, when the map can't load. */
function DotGrid({ dots, size, inGrid, sel, onSel }: { dots: MapDot[]; size: number; inGrid: Set<number>; sel: number; onSel: (i: number) => void }) {
  return (
    <div className="mx-auto grid max-w-[420px] gap-3 p-4" style={{ gridTemplateColumns: `repeat(${size}, minmax(0, 1fr))` }}>
      {dots.map((d, i) =>
        inGrid.has(i) ? (
          <button key={i} type="button" aria-label={d.aria} onClick={() => onSel(i)} className="aw-num mx-auto grid h-9 w-9 place-items-center rounded-full text-[12px] font-semibold" style={{ background: d.bg, color: d.fg, border: `2px ${d.dashed ? "dashed" : "solid"} ${i === sel ? "#111111" : d.border}` }}>
            {d.label}
          </button>
        ) : (
          <span key={i} />
        ),
      )}
    </div>
  );
}
