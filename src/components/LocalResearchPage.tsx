"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { GRID, reviewHistory, SPACINGS, type ListingCheck, type Location, type Place, type ScanResult } from "@/lib/local";
import type { RunAuth } from "@/lib/runner";
import { demoLocal } from "@/lib/demo";
import { ToolStart } from "./ToolStart";
import { Card, Delta, Seg, Thinking } from "./ui";
import { useApi } from "./ZippiePage";

// Local Research (docs/local-research.md): where the business ranks in Google Maps from 49 points around it, who holds
// the map pack, reviews against rivals over time, and whether the website agrees with the Google listing. Until a
// business is picked, the screen shows an example business under the Find form.

type Brand = { id: string; name: string; domain: string };
type Scan = { id: string; keyword: string; status: "running" | "done" | "failed"; step: string; error: string | null; created_at: string; result: (ScanResult & { listing?: ListingCheck[] }) | null };

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));
const when = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
const rankColor = (r: number | null, error?: boolean): [string, string] =>
  error ? ["var(--aw-surface)", "var(--aw-faint)"] : r === null ? ["var(--aw-surface-2)", "var(--aw-muted)"] : r <= 3 ? ["var(--aw-pos-bg)", "var(--aw-pos)"] : r <= 10 ? ["var(--aw-warn-bg)", "var(--aw-warn)"] : ["var(--aw-neg-bg)", "var(--aw-neg)"];

export function LocalResearchPage({ brand, sb, auth, canEdit }: { brand: Brand; sb: SupabaseClient; auth: RunAuth; canEdit: boolean }) {
  const api = useApi(auth);
  const [loc, setLoc] = useState<Location | null | undefined>(undefined);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState("");
  const call = useCallback(<T,>(action: string, extra: Record<string, unknown> = {}) => api<T>("/api/local", { action, brandId: brand.id, ...extra }), [api, brand.id]);
  const demo = useMemo(() => demoLocal({ name: brand.name, domain: brand.domain }), [brand.name, brand.domain]);
  // With no business picked, the tool's start page (ToolStart) explains Local Research, with an example business
  // inside it. Its search box finds the real one.
  const [showExample, setShowExample] = useState(false);

  useEffect(() => {
    let live = true;
    sb.from("brands")
      .select("profile")
      .eq("id", brand.id)
      .maybeSingle()
      .then(({ data }) => live && setLoc(((data?.profile as { location?: Location } | null)?.location as Location | undefined) ?? null));
    return () => {
      live = false;
    };
  }, [sb, brand.id]);

  async function run<T>(key: string, fn: () => Promise<T>) {
    setBusy(key);
    setError("");
    setNote("");
    try {
      return await fn();
    } catch (e) {
      setError(msg(e));
      return null;
    } finally {
      setBusy("");
    }
  }
  const save = async (extra: Record<string, unknown>) => {
    const r = await run("settings", () => call<{ location: Location }>("settings", extra));
    if (r) setLoc(r.location);
  };

  const page = (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="mr-auto flex flex-wrap items-center gap-3">
          <h1 className="aw-h2 mb-0!">Local Research</h1>
          {loc === null ? <span className="aw-status aw-status--pending">Example data</span> : null}
          {loc === null ? (
            <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm" onClick={() => setShowExample(false)}>
              {canEdit ? "Find your business" : "About Local Research"}
            </button>
          ) : null}
        </div>
        {loc ? (
          <div className="flex flex-wrap items-center gap-3 text-[13px]">
            <span className="text-body wrap-break-word">
              <b className="font-semibold text-ink">{loc.title}</b>
              {loc.address ? `, ${loc.address}` : ""}
            </span>
            {canEdit ? (
              <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm" onClick={async () => (await run("clear", () => call("clear"))) && setLoc(null)} disabled={busy === "clear"}>
                Change business
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
      {error ? <p className="aw-error">{error}</p> : null}
      {note ? <p className="aw-callout">{note}</p> : null}
      {loc === undefined ? (
        <Thinking text="Loading" />
      ) : loc === null ? (
        <Scans brand={brand} loc={demo.loc} sb={sb} canEdit={false} busy={busy} call={call} run={run} save={save} onNote={setNote} demoScans={demo.scans} />
      ) : (
        <Scans key={loc.cid ?? loc.title} brand={brand} loc={loc} sb={sb} canEdit={canEdit} busy={busy} call={call} run={run} save={save} onNote={setNote} />
      )}
    </div>
  );

  if (loc === null && !showExample) return <LocalStart brand={brand} call={call} canEdit={canEdit} error={error} onSet={setLoc} onError={setError} example={page} onOpenExample={() => setShowExample(true)} />;
  return page;
}

type Call = <T>(action: string, extra?: Record<string, unknown>) => Promise<T>;

function LocalStart({ brand, call, canEdit, error, onSet, onError, example, onOpenExample }: { brand: Brand; call: Call; canEdit: boolean; error: string; onSet: (l: Location) => void; onError: (e: string) => void; example: React.ReactNode; onOpenExample: () => void }) {
  const [query, setQuery] = useState(`${brand.name} `);
  const [places, setPlaces] = useState<Place[] | null>(null);
  const [busy, setBusy] = useState("");
  async function find() {
    setBusy("find");
    onError("");
    try {
      setPlaces((await call<{ places: Place[] }>("find", { query })).places);
    } catch (e) {
      onError(msg(e));
    } finally {
      setBusy("");
    }
  }
  async function pick(p: Place) {
    setBusy(p.cid ?? p.title);
    onError("");
    try {
      onSet((await call<{ location: Location }>("set", { place: p })).location);
    } catch (e) {
      onError(msg(e));
      setBusy("");
    }
  }
  return (
    <ToolStart
      tool="local"
      error={error}
      example={example}
      onOpenExample={onOpenExample}
      onCta={
        canEdit
          ? () => {
              window.scrollTo({ top: 0, behavior: "smooth" });
              document.getElementById("ts-local-query")?.focus();
            }
          : undefined
      }
      form={
        canEdit ? (
          <form
            className="ts-q"
            onSubmit={(e) => {
              e.preventDefault();
              find();
            }}
          >
            <input id="ts-local-query" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Business name and city" aria-label="Business name and city" />
            <button type="submit" className="ts-btn ts-btn--primary ts-btn--lg" disabled={query.trim().length < 3 || busy === "find"}>
              {busy === "find" ? "Finding" : "Find"} <span className="ts-arr">→</span>
            </button>
          </form>
        ) : (
          <div className="ts-q">
            <span className="ts-domain">{brand.name}</span>
          </div>
        )
      }
      below={
        places ? (
          <div className="ts-places">
            {places.length ? (
              places.map((p) => (
                <div key={p.cid ?? `${p.title}${p.address}`} className="ts-place">
                  <span>
                    <b>{p.title}</b>
                    <small>{[p.category, p.address, p.rating !== null ? `★ ${p.rating} (${p.reviews ?? 0})` : null].filter(Boolean).join(", ")}</small>
                  </span>
                  <button type="button" className="ts-btn ts-btn--quiet ts-btn--sm" onClick={() => pick(p)} disabled={Boolean(busy) || p.lat === null}>
                    {busy === (p.cid ?? p.title) ? "Saving" : "This is us"}
                  </button>
                </div>
              ))
            ) : (
              <div className="ts-place">
                <span>
                  <b>No business found.</b>
                </span>
              </div>
            )}
          </div>
        ) : null
      }
    />
  );
}

function Scans({ brand, loc, sb, canEdit, busy, call, run, save, onNote, demoScans }: { brand: Brand; loc: Location; sb: SupabaseClient; canEdit: boolean; busy: string; call: Call; run: <T>(k: string, fn: () => Promise<T>) => Promise<T | null>; save: (x: Record<string, unknown>) => Promise<void>; onNote: (s: string) => void; demoScans?: Scan[] }) {
  const [kw, setKw] = useState(loc.keywords[0] ?? "");
  const [saved, setScans] = useState<Scan[] | null>(null);
  const scans = demoScans ? demoScans.filter((s) => s.keyword === kw) : saved;
  // Example data: the controls show, and only the keyword switch and the map work.
  const lock = Boolean(demoScans);
  const controls = canEdit || lock;
  const [pt, setPt] = useState<number | null>(null);
  const [newKw, setNewKw] = useState("");
  const load = useCallback(async () => {
    if (demoScans) return;
    if (!kw) return setScans([]);
    const { data } = await sb.from("local_scans").select("id, keyword, status, step, error, created_at, result").eq("brand_id", brand.id).eq("keyword", kw).order("created_at", { ascending: false }).limit(12);
    setScans((data ?? []) as Scan[]);
  }, [sb, brand.id, kw, demoScans]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);
  const running = scans?.[0]?.status === "running" ? scans[0] : null;
  useEffect(() => {
    if (!running) return;
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [running, load]);

  const done = (scans ?? []).filter((s) => s.status === "done" && s.result);
  const cur = done[0]?.result ?? null;
  const prev = done[1]?.result ?? null;
  const failed = scans?.[0]?.status === "failed" ? scans[0] : null;

  return (
    <div className="flex flex-col gap-4">
      <Card tour={1}>
        <div className="flex flex-col gap-3 px-5 py-4">
          <div className="flex flex-wrap items-center gap-2">
            {loc.keywords.map((k) => (
              <span key={k} className="inline-flex items-center">
                <button type="button" aria-pressed={kw === k} onClick={() => { setKw(k); setPt(null); }} className={`aw-btn aw-btn--sm ${kw === k ? "aw-btn--primary" : "aw-btn--secondary"}`}>
                  {k}
                </button>
                {controls ? (
                  <button type="button" className="aw-iconbtn h-6! w-6!" aria-label={`Remove ${k}`} disabled={lock} onClick={() => save({ keywords: loc.keywords.filter((x) => x !== k) })}>
                    ×
                  </button>
                ) : null}
              </span>
            ))}
            {controls && loc.keywords.length < 5 ? (
              <form
                className="flex items-center gap-2"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const k = newKw.trim().toLowerCase();
                  if (!k) return;
                  await save({ keywords: [...loc.keywords, k] });
                  setNewKw("");
                  setKw(k);
                }}
              >
                <input id="local-kw" className="aw-input py-1.5! text-[13px]!" value={newKw} onChange={(e) => setNewKw(e.target.value)} placeholder="emergency dentist" aria-label="Add a keyword" />
                <button type="submit" className="aw-btn aw-btn--secondary aw-btn--sm" disabled={lock || !newKw.trim()}>
                  Add
                </button>
              </form>
            ) : null}
          </div>
          {controls ? (
            <div className="flex flex-wrap items-center gap-3">
              <Seg label="Grid spacing" value={String(loc.spacing)} onChange={(v) => !lock && save({ spacing: Number(v) })} options={SPACINGS.map((s) => ({ id: String(s), label: `${s} mi` }))} />
              <label className="flex cursor-pointer items-center gap-2 text-[13px] text-body">
                <button type="button" role="switch" aria-checked={loc.weekly} aria-label="Weekly scan" className={`aw-toggle ${loc.weekly ? "is-on" : ""}`} disabled={lock} onClick={() => save({ weekly: !loc.weekly })} />
                Weekly scan
              </label>
              <button type="button" className="aw-btn aw-btn--primary aw-btn--sm" disabled={lock || !kw || Boolean(running) || busy === "scan"} onClick={async () => (await run("scan", () => call("scan", { keyword: kw }))) && load()}>
                {running ? "Scanning" : busy === "scan" ? "Starting" : "Scan now"}
              </button>
              {loc.city ? (
                <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm" disabled={lock || busy === "prompts"} onClick={async () => { const r = await run("prompts", () => call<{ added: string[] }>("prompts")); if (r) onNote(`Tracking ${r.added.length} local prompts in AI Visibility, under the topic Local.`); }}>
                  Track in AI answers
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </Card>

      {running ? <Thinking text={running.step || "Scanning"} /> : failed ? <p className="aw-error">The last scan failed: {failed.error}</p> : null}
      {kw && scans && !done.length && !running && !failed ? <p className="aw-small">No scan for “{kw}”.</p> : null}

      {cur ? (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Stat label="Average rank" value={cur.avg === null ? "–" : String(cur.avg)} delta={cur.avg !== null && prev?.avg != null ? <Delta now={cur.avg} before={prev.avg} lowerIsBetter /> : null} />
            <Stat label="Top 3 on the map" value={`${cur.read ? Math.round((cur.top3 / cur.read) * 100) : 0}%`} sub={`${cur.top3} of ${cur.read} points`} />
            <Stat label="In the top 20" value={`${cur.found} of ${cur.read}`} sub={cur.read < GRID * GRID ? `${GRID * GRID - cur.read} points didn't load` : undefined} />
          </div>
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
            <Card tour={2} title={`“${cur.keyword}”, ${cur.spacing} mi apart, ${when(done[0].created_at)}`}>
              <div className="px-4 pb-4">
                <Grid scan={cur} sel={pt} onSel={setPt} />
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-muted">
                  <Key c={rankColor(2)} t="Top 3" />
                  <Key c={rankColor(7)} t="4 to 10" />
                  <Key c={rankColor(15)} t="11 to 20" />
                  <Key c={rankColor(null)} t="Not in the top 20" />
                </div>
              </div>
            </Card>
            <div className="flex min-w-0 flex-col gap-4">
              <Card title={pt === null ? "Map pack at the centre" : `Map pack at point ${pt + 1}`}>
                <PackAt scan={cur} i={pt ?? Math.floor((GRID * GRID) / 2)} you={loc.title} />
              </Card>
              {cur.listing ? (
                <Card tour={3} title="Listing check">
                  <ul className="flex flex-col px-5 pb-4">
                    {cur.listing.map((c) => (
                      <li key={c.id} className="flex items-start gap-3 border-t border-[var(--aw-rule)] py-2.5 first:border-t-0">
                        <span className={`mt-0.5 grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full text-[11px] font-bold ${c.status === "pass" ? "bg-[var(--aw-pos-bg)] text-pos" : c.status === "warn" ? "bg-[var(--aw-warn-bg)] text-warn" : "bg-[var(--aw-neg-bg)] text-neg"}`} aria-label={c.status}>
                          {c.status === "pass" ? "✓" : c.status === "warn" ? "!" : "×"}
                        </span>
                        <span className="flex min-w-0 flex-col">
                          <span className="text-[13.5px] font-medium text-ink">{c.label}</span>
                          <span className="text-[12px] text-muted wrap-break-word">{c.detail}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </Card>
              ) : null}
            </div>
          </div>
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
            <Card tour={4} title="Local rivals">
              <div className="overflow-x-auto">
                <table className="aw-table">
                  <thead>
                    <tr>
                      <th>Business</th>
                      <th>Rating</th>
                      <th className="text-right">Reviews</th>
                      <th>Top 3 on the map</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="min-w-40 font-semibold text-ink wrap-break-word">{loc.title}</td>
                      <td className="whitespace-nowrap">{cur.you?.rating != null ? `★ ${cur.you.rating}` : "–"}</td>
                      <td className="aw-num text-right">{cur.you?.reviews ?? "–"}</td>
                      <td className="min-w-36"><Bar share={cur.read ? cur.top3 / cur.read : 0} you /></td>
                    </tr>
                    {cur.rivals.map((r) => (
                      <tr key={r.cid ?? r.title}>
                        <td className="min-w-40">
                          <span className="flex flex-col">
                            <span className="text-ink wrap-break-word">{r.title}</span>
                            {r.category ? <span className="text-[12px] text-muted">{r.category}</span> : null}
                          </span>
                        </td>
                        <td className="whitespace-nowrap">{r.rating !== null ? `★ ${r.rating}` : "–"}</td>
                        <td className="aw-num text-right">{r.reviews ?? "–"}</td>
                        <td className="min-w-36"><Bar share={cur.read ? r.top3 / cur.read : 0} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
            <Card title="Reviews over time">
              <Reviews done={done} you={loc.title} />
            </Card>
          </div>
        </>
      ) : null}
    </div>
  );
}

function Stat({ label, value, delta, sub }: { label: string; value: string; delta?: React.ReactNode; sub?: string }) {
  return (
    <Card>
      <div className="flex flex-col gap-1 px-4 py-3.5">
        <span className="text-[12px] font-medium text-muted">{label}</span>
        <span className="flex flex-wrap items-baseline gap-2">
          <span className="aw-num text-[22px] font-semibold text-ink">{value}</span>
          {delta}
        </span>
        {sub ? <span className="text-[12px] text-muted">{sub}</span> : null}
      </div>
    </Card>
  );
}

const Key = ({ c, t }: { c: [string, string]; t: string }) => (
  <span className="flex items-center gap-1.5">
    <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: c[0], boxShadow: `inset 0 0 0 1.5px ${c[1]}` }} />
    {t}
  </span>
);

function Bar({ share, you = false }: { share: number; you?: boolean }) {
  return (
    <span className="grid grid-cols-[minmax(0,1fr)_40px] items-center gap-2">
      <span className="block h-2 rounded-full bg-[var(--aw-surface-2)]">
        <span className="block h-full rounded-full" style={{ width: `${Math.round(share * 100)}%`, background: you ? "var(--aw-brand)" : "var(--aw-faint)" }} />
      </span>
      <span className="aw-num text-right text-[12px]">{Math.round(share * 100)}%</span>
    </span>
  );
}

/** The 49 points on a plain street grid, the business pin in the middle. */
function Grid({ scan, sel, onSel }: { scan: ScanResult; sel: number | null; onSel: (i: number) => void }) {
  const W = 560;
  const pad = 46;
  const step = (W - pad * 2) / (GRID - 1);
  const mid = Math.floor(GRID / 2);
  return (
    <svg viewBox={`0 0 ${W} ${W}`} className="block h-auto w-full max-w-[560px]" role="img" aria-label="Google Maps rank at each point">
      <rect width={W} height={W} rx="12" fill="var(--aw-surface-2)" />
      {Array.from({ length: GRID * 2 + 1 }, (_, k) => (
        <g key={k} stroke="var(--aw-surface)" strokeWidth={k % 4 === 0 ? 6 : 2.5}>
          <line x1={0} x2={W} y1={(W / (GRID * 2)) * k} y2={(W / (GRID * 2)) * k} />
          <line y1={0} y2={W} x1={(W / (GRID * 2)) * k} x2={(W / (GRID * 2)) * k} />
        </g>
      ))}
      {scan.points.map((p) => {
        const x = pad + (p.i % GRID) * step;
        const y = pad + Math.floor(p.i / GRID) * step;
        const [fill, stroke] = rankColor(p.rank, p.error);
        return (
          <g key={p.i} className="cursor-pointer" onClick={() => onSel(p.i)} role="button" tabIndex={0} aria-label={`Point ${p.i + 1}: ${p.error ? "no answer" : p.rank === null ? "not in the top 20" : `rank ${p.rank}`}`} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onSel(p.i)}>
            <circle cx={x} cy={y} r="18" fill={fill} stroke={stroke} strokeWidth={sel === p.i ? 3 : 1.5} strokeDasharray={p.error ? "3 3" : undefined} />
            <text x={x} y={y + 4} textAnchor="middle" fill={stroke} style={{ font: "600 12px Inter, system-ui, sans-serif" }}>
              {p.error ? "?" : p.rank === null ? "20+" : p.rank}
            </text>
          </g>
        );
      })}
      <g transform={`translate(${pad + mid * step + 24},${pad + mid * step - 22})`}>
        <path d="M0 0c-8-10-12-15-12-21a12 12 0 0 1 24 0c0 6-4 11-12 21z" fill="var(--aw-ink)" />
        <circle cx="0" cy="-21" r="4.5" fill="var(--aw-surface)" />
      </g>
      <text x={W - 12} y={W - 12} textAnchor="end" fill="var(--aw-muted)" style={{ font: "11px Inter, system-ui, sans-serif" }}>
        N ↑
      </text>
    </svg>
  );
}

function PackAt({ scan, i, you }: { scan: ScanResult; i: number; you: string }) {
  const p = scan.points.find((x) => x.i === i);
  if (!p) return null;
  if (p.error) return <p className="px-5 pb-4 text-[13px] text-muted">Google Maps didn&apos;t answer for this point.</p>;
  return (
    <div className="flex flex-col gap-2 px-5 pb-4">
      <p className="text-[13px] text-body">{p.rank === null ? "You're not in the top 20 here." : `You rank #${p.rank} here.`}</p>
      <ol className="flex flex-col">
        {p.top.map((t, k) => (
          <li key={`${t.cid ?? t.title}${k}`} className="flex items-center gap-3 border-t border-[var(--aw-rule)] py-2 first:border-t-0">
            <span className="aw-num w-6 text-[12px] text-muted">#{k + 1}</span>
            <span className={`min-w-0 text-[13px] wrap-break-word ${t.title === you ? "font-semibold text-brand" : "text-ink"}`}>{t.title}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Review counts per scan: the business and the two rivals holding the top 3 most. */
function Reviews({ done, you }: { done: Scan[]; you: string }) {
  const latest = done[0]?.result;
  const names = (latest?.rivals ?? []).slice(0, 2).map((r) => r.title);
  const h = reviewHistory(done.map((s) => ({ at: s.created_at, you: s.result!.you, rivals: s.result!.rivals })), names);
  const series = [{ name: you, color: "var(--aw-brand)", vals: h.map((x) => x.you) }, ...names.map((n, k) => ({ name: n, color: k ? "var(--aw-muted)" : "var(--aw-ink)", vals: h.map((x) => x.rivals[n]) }))];
  if (h.length < 2) {
    return (
      <div className="flex flex-col gap-1 px-5 pb-4 text-[13px] text-body">
        {series.map((s) => (
          <span key={s.name} className="flex justify-between gap-3">
            <span className="wrap-break-word">{s.name}</span>
            <span className="aw-num">{s.vals.at(-1) ?? "–"}</span>
          </span>
        ))}
      </div>
    );
  }
  const all = series.flatMap((s) => s.vals).filter((v): v is number => v !== null);
  const min = Math.min(...all);
  const max = Math.max(...all, min + 1);
  const W = 320;
  const H = 150;
  const x = (k: number) => 30 + (k / (h.length - 1)) * (W - 40);
  const y = (v: number) => 10 + (1 - (v - min) / (max - min)) * (H - 34);
  return (
    <div className="flex flex-col gap-2 px-5 pb-4">
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label="Review counts over time">
        {[min, max].map((v) => (
          <text key={v} x={24} y={y(v) + 4} textAnchor="end" fill="var(--aw-muted)" style={{ font: "10px Inter, system-ui, sans-serif" }}>
            {v}
          </text>
        ))}
        {series.map((s) => {
          const pts = s.vals.map((v, k) => (v === null ? null : `${x(k)},${y(v)}`)).filter(Boolean).join(" ");
          return pts ? <polyline key={s.name} points={pts} fill="none" stroke={s.color} strokeWidth="2" /> : null;
        })}
        <text x={x(0)} y={H - 4} fill="var(--aw-muted)" style={{ font: "10px Inter, system-ui, sans-serif" }}>
          {when(h[0].at)}
        </text>
        <text x={x(h.length - 1)} y={H - 4} textAnchor="end" fill="var(--aw-muted)" style={{ font: "10px Inter, system-ui, sans-serif" }}>
          {when(h[h.length - 1].at)}
        </text>
      </svg>
      <div className="flex flex-wrap gap-3 text-[12px] text-body">
        {series.map((s) => (
          <span key={s.name} className="flex items-center gap-1.5">
            <span className="inline-block h-[3px] w-3.5 rounded" style={{ background: s.color }} />
            {s.name}
          </span>
        ))}
      </div>
    </div>
  );
}
