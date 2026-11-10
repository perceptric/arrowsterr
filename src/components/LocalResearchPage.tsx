"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { businesses, GRID, gridOf, headToHead, isBusiness, keywordSuggestions, keywordTable, localInsights, mapOwners, placeKey, placeText, rankBands, rankMoves, reviewHistory, scanTasks, scheduleOf, SCHEDULES, SIZES, SPACINGS, type Business, type Duel, type KeywordRun, type ListingCheck, type Location, type MapOwner, type Move, type Place, type ScanResult } from "@/lib/local";
import { LocalMap, rankDot, type MapDot } from "./LocalMap";
import type { RunAuth } from "@/lib/runner";
import { Dropdown } from "./Pickers";
import { BAR_INPUT } from "./research/shared";
import { SearchBar, SearchButton } from "./SearchBar";
import { Card, Delta, Seg, Thinking } from "./ui";
import { LocalIntro } from "./ToolIntros";
import { useApi } from "./ZippiePage";

// Local Research (docs/local-research.md): where the business ranks in Google Maps from 49 points around it, who holds
// the map pack, reviews against rivals over time, and whether the website agrees with the Google listing. Until a
// business is picked, the screen is the Find bar.

type Brand = { id: string; name: string; domain: string };
type Scan = { id: string; keyword: string; status: "running" | "done" | "failed"; step: string; error: string | null; created_at: string; result: (ScanResult & { listing?: ListingCheck[] }) | null };

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));
const when = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
type SavedLoc = Location & { id: string };
type Limits = { locations: number; keywords: number };

export function LocalResearchPage({ brand, sb, auth, canEdit }: { brand: Brand; sb: SupabaseClient; auth: RunAuth; canEdit: boolean }) {
  const api = useApi(auth);
  const [locs, setLocs] = useState<SavedLoc[] | undefined>(undefined);
  const [sel, setSel] = useState("");
  const [adding, setAdding] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [limits, setLimits] = useState<Limits | null>(null);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState("");
  const call = useCallback(<T,>(action: string, extra: Record<string, unknown> = {}) => api<T>("/api/local", { action, brandId: brand.id, ...extra }), [api, brand.id]);

  useEffect(() => {
    let live = true;
    sb.from("local_locations")
      .select("id, data")
      .eq("brand_id", brand.id)
      .order("position")
      .order("created_at")
      .then(({ data, error: e }) => {
        if (!live) return;
        if (e) {
          setError(/local_locations/.test(e.message) ? "Run supabase/071_local_locations.sql on the VPS database." : e.message);
          setLocs([]);
          return;
        }
        const list = ((data ?? []) as { id: string; data: Location }[]).map((r) => ({ ...r.data, id: r.id }));
        setLocs(list);
        setSel(list.length > 1 ? "all" : (list[0]?.id ?? ""));
      });
    return () => {
      live = false;
    };
  }, [sb, brand.id]);
  useEffect(() => {
    if (!canEdit) return;
    call<{ limits: Limits }>("limits").then((r) => setLimits(r.limits)).catch(() => undefined);
  }, [canEdit, call]);

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
  const put = (l: SavedLoc) => setLocs((all) => (all ?? []).some((x) => x.id === l.id) ? (all ?? []).map((x) => (x.id === l.id ? l : x)) : [...(all ?? []), l]);
  const loc = locs?.find((l) => l.id === sel) ?? null;
  const save = async (extra: Record<string, unknown>) => {
    if (!loc) return;
    const r = await run("settings", () => call<{ location: SavedLoc }>("settings", { locationId: loc.id, ...extra }));
    if (r) put(r.location);
  };
  const canAdd = canEdit && (locs?.length ?? 0) < (limits?.locations ?? 1);
  const finding = locs !== undefined && (locs.length === 0 || adding || replacing);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="aw-h2 mb-0!">Local Research</h1>
        {loc && !finding ? (
          <div className="flex flex-wrap items-center gap-3 text-[13px]">
            <span className="text-body wrap-break-word">
              <b className="font-semibold text-ink">{loc.title}</b>
              {loc.address ? `, ${loc.address}` : ""}
            </span>
            {canEdit ? (
              <>
                <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm" onClick={() => setReplacing(true)}>
                  Change business
                </button>
                <button
                  type="button"
                  className={`aw-btn aw-btn--sm ${removing ? "aw-btn--danger" : "aw-btn--ghost"}`}
                  disabled={busy === "remove"}
                  onClick={async () => {
                    if (!removing) return setRemoving(true);
                    const r = await run("remove", () => call<{ removed: string }>("remove", { locationId: loc.id }));
                    setRemoving(false);
                    if (!r) return;
                    const rest = (locs ?? []).filter((x) => x.id !== loc.id);
                    setLocs(rest);
                    setSel(rest.length > 1 ? "all" : (rest[0]?.id ?? ""));
                  }}
                  onBlur={() => setRemoving(false)}
                >
                  {removing ? "Delete it and its scans" : "Remove location"}
                </button>
              </>
            ) : null}
          </div>
        ) : null}
      </div>

      {locs && locs.length && !finding ? (
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Locations">
          {locs.length > 1 ? (
            <button type="button" aria-pressed={sel === "all"} onClick={() => setSel("all")} className="aw-chip aw-chip--btn">
              All locations
            </button>
          ) : null}
          {locs.map((l) => (
            <button key={l.id} type="button" aria-pressed={sel === l.id} onClick={() => setSel(l.id)} className="aw-chip aw-chip--btn">
              {l.name || l.city || l.title}
            </button>
          ))}
          {canEdit ? (
            canAdd ? (
              <button type="button" className="aw-chip aw-chip--btn aw-chip--quiet" onClick={() => setAdding(true)}>
                + Add location
              </button>
            ) : limits ? (
              <span className="text-[12px] text-muted">{limits.locations} of {limits.locations} locations on your plan</span>
            ) : null
          ) : null}
        </div>
      ) : null}

      {finding ? (
        <>
          <Find
            brand={brand}
            call={call}
            canEdit={canEdit}
            locationId={replacing ? loc?.id : undefined}
            onSet={(l) => {
              put(l as SavedLoc);
              setSel((l as SavedLoc).id);
              setAdding(false);
              setReplacing(false);
            }}
            onError={setError}
          />
          {locs && locs.length ? (
            <div>
              <button type="button" className="aw-btn aw-btn--ghost aw-btn--sm" onClick={() => { setAdding(false); setReplacing(false); }}>
                Cancel
              </button>
            </div>
          ) : null}
        </>
      ) : null}
      {error ? <p className="aw-error">{error}</p> : null}
      {note ? <p className="aw-callout">{note}</p> : null}
      {locs === undefined ? (
        <Thinking text="Loading" />
      ) : finding ? null : sel === "all" && locs.length > 1 ? (
        <Overview brand={brand} sb={sb} locs={locs} onPick={setSel} />
      ) : loc ? (
        <Scans key={loc.id} brand={brand} loc={loc} sb={sb} canEdit={canEdit} busy={busy} call={call} run={run} save={save} onNote={setNote} maxKeywords={limits?.keywords ?? 5} />
      ) : null}
    </div>
  );
}

type Call = <T>(action: string, extra?: Record<string, unknown>) => Promise<T>;

/** The business search: a name and city, then the matching Google Maps listings to pick from. */
function Find({ brand, call, canEdit, locationId, onSet, onError }: { brand: Brand; call: Call; canEdit: boolean; locationId?: string; onSet: (l: Location) => void; onError: (e: string) => void }) {
  const [query, setQuery] = useState(`${brand.name} `);
  const [places, setPlaces] = useState<Place[] | null>(null);
  const [busy, setBusy] = useState("");
  async function find() {
    if (query.trim().length < 3) return;
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
      onSet((await call<{ location: Location }>("set", { place: p, ...(locationId ? { locationId } : {}) })).location);
    } catch (e) {
      onError(msg(e));
      setBusy("");
    }
  }
  return (
    <>
      <SearchBar onSubmit={find}>
        <input id="local-query" className={BAR_INPUT} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Business name and city" aria-label="Business name and city" disabled={!canEdit} />
        {canEdit ? <SearchButton label="Find" busyLabel="Finding" busy={busy === "find"} disabled={query.trim().length < 3} /> : null}
      </SearchBar>
      {places ? (
        <Card>
          {places.length ? (
            <ul className="flex flex-col px-5 py-2">
              {places.map((p) => (
                <li key={p.cid ?? `${p.title}${p.address}`} className="flex flex-wrap items-center gap-3 border-t border-[var(--aw-rule)] py-3 first:border-t-0">
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="text-[14px] font-medium text-ink wrap-break-word">{p.title}</span>
                    <span className="text-[12px] text-muted wrap-break-word">{[p.category, p.address, p.rating !== null ? `★ ${p.rating} (${p.reviews ?? 0})` : null].filter(Boolean).join(", ")}</span>
                  </span>
                  <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm" onClick={() => pick(p)} disabled={Boolean(busy) || p.lat === null}>
                    {busy === (p.cid ?? p.title) ? "Saving" : "This is us"}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-5 py-5 text-[13px] text-muted">No business found.</p>
          )}
        </Card>
      ) : null}
      {locationId ? null : <LocalIntro />}
    </>
  );
}

/** Every location at a glance: the latest average rank for each keyword, the change since the scan before, top 3 share and reviews. */
function Overview({ brand, sb, locs, onPick }: { brand: Brand; sb: SupabaseClient; locs: SavedLoc[]; onPick: (id: string) => void }) {
  type Run = { location_id: string | null; keyword: string; created_at: string; avg: number | null; top3: number | null; read: number | null; you: { rating: number | null; reviews: number | null } | null };
  const [runs, setRuns] = useState<Run[] | null>(null);
  useEffect(() => {
    let live = true;
    sb.from("local_scans")
      .select("location_id, keyword, created_at, avg:result->avg, top3:result->top3, read:result->read, you:result->you")
      .eq("brand_id", brand.id)
      .eq("status", "done")
      .order("created_at", { ascending: false })
      .limit(1000)
      .then(({ data }) => live && setRuns((data ?? []) as unknown as Run[]));
    return () => {
      live = false;
    };
  }, [sb, brand.id]);
  if (!runs) return <Thinking text="Loading" />;
  const rows = locs.map((l) => {
    const mine = runs.filter((r) => r.location_id === l.id);
    const kws = l.keywords.map((k) => {
      const list = mine.filter((r) => r.keyword === k);
      return { k, now: list[0] ?? null, before: list[1] ?? null };
    });
    const latest = kws.map((x) => x.now).filter((x): x is Run => Boolean(x));
    const avgOf = (xs: (number | null | undefined)[]) => {
      const v = xs.filter((x): x is number => typeof x === "number");
      return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : null;
    };
    const read = latest.reduce((a, r) => a + (r.read ?? 0), 0);
    const top3 = latest.reduce((a, r) => a + (r.top3 ?? 0), 0);
    const you = latest.find((r) => r.you)?.you ?? null;
    const last = latest.map((r) => r.created_at).sort().pop() ?? null;
    return { l, kws, avg: avgOf(latest.map((r) => r.avg)), top3: read ? Math.round((top3 / read) * 100) : null, you, last };
  });
  const fill = (v: number | null) => (v === null ? "var(--aw-surface-2)" : v <= 3 ? MAP.top3 : v <= 10 ? MAP.top10 : v <= 20 ? MAP.top20 : "#E5484D");
  return (
    <Card title={`${locs.length} locations`}>
      <div className="overflow-x-auto">
        <table className="aw-table">
          <thead>
            <tr>
              <th>Location</th>
              <th>Keywords, latest average rank</th>
              <th className="text-right">Avg rank</th>
              <th className="text-right">Top 3</th>
              <th className="text-right">Rating</th>
              <th className="text-right">Reviews</th>
              <th className="text-right">Last scan</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.l.id} className="cursor-pointer" onClick={() => onPick(r.l.id)}>
                <td className="min-w-48">
                  <button type="button" className="text-left font-medium text-ink hover:underline" onClick={() => onPick(r.l.id)}>
                    {r.l.name || r.l.city || r.l.title}
                  </button>
                  <span className="block text-[12px] text-muted wrap-break-word">{r.l.address ?? r.l.title}</span>
                </td>
                <td>
                  <span className="flex flex-wrap gap-1.5">
                    {r.kws.map((x) => {
                      const d = x.now?.avg != null && x.before?.avg != null ? Math.round((x.before.avg - x.now.avg) * 10) / 10 : null;
                      return (
                        <span key={x.k} className="inline-flex items-center gap-1.5 text-[12.5px] text-body">
                          {x.k}
                          <span className="aw-num grid h-5 min-w-8 place-items-center rounded-full px-1.5 text-[11.5px] font-semibold text-white" style={{ background: fill(x.now?.avg ?? null), color: x.now ? "#fff" : "var(--aw-muted)" }}>
                            {x.now?.avg ?? "–"}
                          </span>
                          {d ? <span className={`aw-num text-[11.5px] font-medium ${d > 0 ? "text-pos" : "text-neg"}`}>{d > 0 ? `+${d}` : d}</span> : null}
                        </span>
                      );
                    })}
                  </span>
                </td>
                <td className="aw-num text-right font-medium text-ink">{r.avg ?? "–"}</td>
                <td className="aw-num text-right">{r.top3 === null ? "–" : `${r.top3}%`}</td>
                <td className="aw-num text-right">{r.you?.rating ?? "–"}</td>
                <td className="aw-num text-right">{r.you?.reviews?.toLocaleString("en-US") ?? "–"}</td>
                <td className="text-right text-muted">{r.last ? when(r.last) : "Not yet"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function Scans({ brand, loc, sb, canEdit, busy, call, run, save, onNote, maxKeywords }: { brand: Brand; loc: SavedLoc; sb: SupabaseClient; canEdit: boolean; busy: string; call: Call; run: <T>(k: string, fn: () => Promise<T>) => Promise<T | null>; save: (x: Record<string, unknown>) => Promise<void>; onNote: (s: string) => void; maxKeywords: number }) {
  const [kw, setKw] = useState(loc.keywords[0] ?? "");
  const [scans, setScans] = useState<Scan[] | null>(null);
  const controls = canEdit;
  const [pt, setPt] = useState<number | null>(null);
  const [newKw, setNewKw] = useState("");
  const [picking, setPicking] = useState(false);
  const [name, setName] = useState(loc.name ?? "");
  const load = useCallback(async () => {
    if (!kw) return setScans([]);
    const { data } = await sb.from("local_scans").select("id, keyword, status, step, error, created_at, result").eq("location_id", loc.id).eq("keyword", kw).order("created_at", { ascending: false }).limit(12);
    setScans((data ?? []) as Scan[]);
  }, [sb, loc.id, kw]);
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
  // Earlier scans drawn on the same grid can be compared with the latest one, point by point.
  const same = (r: ScanResult | null) => Boolean(cur && r && r.size === cur.size && (r.shape ?? "square") === (cur.shape ?? "square") && r.spacing === cur.spacing && (r.center?.lat ?? null) === (cur.center?.lat ?? null) && (r.center?.lng ?? null) === (cur.center?.lng ?? null));
  const comparable = done.slice(1).filter((d) => same(d.result));
  const [compareId, setCompareId] = useState<string | null>(null);
  const prevScan = comparable.find((d) => d.id === compareId) ?? comparable[0] ?? null;
  // The saved Google Maps results of the latest scan and the one it's compared with, so every business's rank at every
  // point, and how it moved, can go on the map.
  const curId = done[0]?.id ?? null;
  const raw = useRaw(sb, curId);
  const prevRaw = useRaw(sb, prevScan?.id ?? null);
  const prev = prevScan?.result ?? null;
  // Every keyword's numbers from each finished scan, for the keyword table and the history chart.
  const [history, setHistory] = useState<KeywordRun[]>([]);
  const lastDone = done[0]?.id ?? "";
  useEffect(() => {
    let live = true;
    sb.from("local_scans")
      .select("keyword, created_at, avg:result->avg, top3:result->top3, found:result->found, read:result->read")
      .eq("location_id", loc.id)
      .eq("status", "done")
      .order("created_at", { ascending: false })
      .limit(200)
      .then(({ data }) => {
        if (!live) return;
        const num = (v: unknown) => (typeof v === "number" ? v : null);
        setHistory(((data ?? []) as Record<string, unknown>[]).map((r) => ({ keyword: String(r.keyword), at: String(r.created_at), avg: num(r.avg), top3: num(r.top3) ?? 0, found: num(r.found) ?? 0, read: num(r.read) ?? 0 })));
      });
    return () => {
      live = false;
    };
  }, [sb, loc.id, lastDone]);
  const failed = scans?.[0]?.status === "failed" ? scans[0] : null;
  const g = gridOf(loc);
  const suggestions = keywordSuggestions(loc, cur?.rivals ?? []).slice(0, Math.max(0, Math.min(5, maxKeywords - loc.keywords.length)));
  const addKeyword = async (k: string) => {
    await save({ keywords: [...loc.keywords, k] });
    setKw(k);
    setPt(null);
  };
  const pickCenter = async (p: { lat: number; lng: number }) => {
    setPicking(false);
    await save({ center: p });
    onNote("The grid's centre moved. The next scan uses it.");
  };

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <div className="flex flex-col gap-3 px-5 py-4">
          <div className="flex flex-wrap items-center gap-2">
            {loc.keywords.map((k) => (
              <span key={k} className="inline-flex items-center">
                <button type="button" aria-pressed={kw === k} onClick={() => { setKw(k); setPt(null); }} className="aw-chip aw-chip--btn">
                  {k}
                </button>
                {controls ? (
                  <button type="button" className="aw-iconbtn h-6! w-6!" aria-label={`Remove ${k}`} onClick={() => save({ keywords: loc.keywords.filter((x) => x !== k) })}>
                    ×
                  </button>
                ) : null}
              </span>
            ))}
            {controls && loc.keywords.length < maxKeywords ? (
              <form
                className="flex items-center gap-2"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const k = newKw.trim().toLowerCase();
                  if (!k) return;
                  await addKeyword(k);
                  setNewKw("");
                }}
              >
                <input id="local-kw" className="aw-input py-1.5! text-[13px]!" value={newKw} onChange={(e) => setNewKw(e.target.value)} placeholder="emergency dentist" aria-label="Add a keyword" />
                <button type="submit" className="aw-btn aw-btn--secondary aw-btn--sm" disabled={!newKw.trim()}>
                  Add
                </button>
              </form>
            ) : null}
          </div>
          {controls && suggestions.length ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[12.5px] text-muted">Suggested</span>
              {suggestions.map((k) => (
                <button key={k} type="button" className="aw-chip aw-chip--btn aw-chip--brand" onClick={() => addKeyword(k)} disabled={busy === "settings"}>
                  + {k}
                </button>
              ))}
            </div>
          ) : null}
          {controls ? (
            <div className="flex flex-wrap items-center gap-3">
              <Seg label="Grid size" value={String(g.size)} onChange={(v) => save({ size: Number(v) })} options={SIZES.map((n) => ({ id: String(n), label: `${n} × ${n}` }))} />
              <Seg label="Grid shape" value={g.shape} onChange={(v) => save({ shape: v })} options={[{ id: "square", label: "Square" }, { id: "circle", label: "Round" }]} />
              <Dropdown<number> label="Spacing" value={loc.spacing} onChange={(v) => save({ spacing: v })} options={SPACINGS.map((n) => ({ id: n, label: `${n} mi apart` }))} />
              <Dropdown<string> label="Schedule" value={scheduleOf(loc)} onChange={(v) => save({ schedule: v })} options={SCHEDULES.map((x) => ({ id: x.id, label: x.id === "off" ? "No scheduled scans" : `${x.label} scan` }))} />
            </div>
          ) : null}
          {controls ? (
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" className="aw-btn aw-btn--primary aw-btn--sm" title={`${scanTasks(g.points.length, true)} tasks`} disabled={!kw || Boolean(running) || busy === "scan"} onClick={async () => (await run("scan", () => call("scan", { locationId: loc.id, keyword: kw }))) && load()}>
                {running ? "Scanning" : busy === "scan" ? "Starting" : "Scan now"}
              </button>
              <span className="text-[12.5px] text-muted">{g.points.length} points</span>
              <button type="button" className={`aw-btn aw-btn--sm ${picking ? "aw-btn--primary" : "aw-btn--secondary"}`} aria-pressed={picking} onClick={() => setPicking(!picking)}>
                {picking ? "Click the map" : "Move centre"}
              </button>
              {loc.center ? (
                <button type="button" className="aw-btn aw-btn--ghost aw-btn--sm" onClick={() => save({ center: null })}>
                  Centre on the business
                </button>
              ) : null}
              {loc.city ? (
                <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm" disabled={busy === "prompts"} onClick={async () => { const r = await run("prompts", () => call<{ added: string[] }>("prompts", { locationId: loc.id })); if (r) onNote(`Tracking ${r.added.length} local prompts in AI Visibility, under the topic Local.`); }}>
                  Track in AI answers
                </button>
              ) : null}
              <form className="ml-auto flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); if (name.trim() && name.trim() !== loc.name) save({ name: name.trim() }); }}>
                <label htmlFor="local-name" className="text-[12.5px] text-muted">Name</label>
                <input id="local-name" className="aw-input w-40 py-1.5! text-[13px]!" value={name} onChange={(e) => setName(e.target.value)} onBlur={() => name.trim() && name.trim() !== loc.name && save({ name: name.trim() })} />
              </form>
            </div>
          ) : null}
        </div>
      </Card>

      {running ? <Thinking text={running.step || "Scanning"} /> : failed ? <p className="aw-error">The last scan failed: {failed.error}</p> : null}
      {kw && scans && !done.length && !running && !failed ? <p className="aw-small">No scan for “{kw}”.</p> : null}

      {cur && !picking ? (
        <Results cur={cur} prev={prev} prevAt={prevScan?.created_at ?? null} compare={comparable.map((d) => ({ id: d.id, at: d.created_at }))} compareId={prevScan?.id ?? null} onCompare={setCompareId} done={done} loc={loc} domain={brand.domain} raw={raw} prevRaw={prevRaw} history={history} keyword={kw} onKeyword={(k) => { setKw(k); setPt(null); }} pt={pt} onPt={setPt} />
      ) : scans && (picking || !done.length) ? (
        <Card title={picking ? "Click where the grid's centre should be" : `The grid, ${g.points.length} points`}>
          <div className="p-3">
            <LocalMap lat={g.center.lat} lng={g.center.lng} spacing={g.spacing} size={g.size} shape={g.shape} pin={{ lat: loc.lat, lng: loc.lng }} dots={[]} sel={-1} onSel={() => undefined} onFail={() => undefined} onPick={picking ? pickCenter : undefined} />
          </div>
        </Card>
      ) : null}
    </div>
  );
}

type Sort = "rank" | "reviews" | "rating";

type Mode = "ranks" | "change" | "duel";

function Results({ cur, prev, prevAt, compare, compareId, onCompare, done, loc, domain, raw, prevRaw, history, keyword, onKeyword, pt, onPt }: { cur: ScanResult & { listing?: ListingCheck[] }; prev: ScanResult | null; prevAt: string | null; compare: { id: string; at: string }[]; compareId: string | null; onCompare: (id: string) => void; done: Scan[]; loc: Location; domain: string; raw: Record<string, Place[] | null> | null; prevRaw: Record<string, Place[] | null> | null; history: KeywordRun[]; keyword: string; onKeyword: (k: string) => void; pt: number | null; onPt: (i: number | null) => void }) {
  const owners = useMemo(() => mapOwners(cur, loc), [cur, loc]);
  const { headline, insights } = useMemo(() => localInsights(cur, prev, loc), [cur, prev, loc]);
  const fixes = (cur.listing ?? []).filter((c) => c.status !== "pass").length;
  const size = cur.size ?? GRID;
  const centre = Math.floor((size * size) / 2);
  const at = pt ?? centre;
  const center = cur.center ?? { lat: loc.lat, lng: loc.lng };
  const inGrid = useMemo(() => new Set(cur.points.map((p) => p.i)), [cur]);
  // Every business with its rank at each point. Until the saved results load, the business itself from the summary.
  const list = useMemo<Business[]>(() => {
    if (raw) return businesses(Object.entries(raw).map(([i, results]) => ({ i: Number(i), results })), { ...loc, domain }, size);
    const ranks = Array.from({ length: size * size }, (_, i) => {
      const p = cur.points.find((x) => x.i === i);
      return !p || p.error ? undefined : p.rank;
    });
    return [{ key: "__you", title: loc.title, you: true, address: loc.address, category: loc.category, rating: cur.you?.rating ?? null, reviews: cur.you?.reviews ?? null, ranks, avg: cur.avg, top3: cur.top3, found: cur.found, voice: cur.read ? cur.top3 / (cur.read * 3) : 0 }];
  }, [raw, cur, loc, domain, size]);
  const [pick, setPick] = useState("__you");
  const [sort, setSort] = useState<Sort>("rank");
  const [mapFailed, setMapFailed] = useState(false);
  const onFail = useCallback(() => setMapFailed(true), []);
  const picked = list.find((b) => b.key === pick) ?? list.find((b) => b.you)!;
  const you = list.find((b) => b.you)!;
  // The same businesses in the scan before, for the change view.
  const prevList = useMemo<Business[] | null>(() => {
    if (prevRaw) return businesses(Object.entries(prevRaw).map(([i, results]) => ({ i: Number(i), results })), { ...loc, domain }, size);
    if (!prev) return null;
    const ranks = Array.from({ length: size * size }, (_, i) => {
      const p = prev.points.find((x) => x.i === i);
      return !p || p.error ? undefined : p.rank;
    });
    return [{ key: "__you", title: loc.title, you: true, address: null, category: null, rating: null, reviews: null, ranks, avg: prev.avg, top3: prev.top3, found: prev.found, voice: 0 }];
  }, [prevRaw, prev, loc, domain, size]);
  const [mode, setMode] = useState<Mode>("ranks");
  const before = prevList?.find((b) => b.key === picked.key) ?? null;
  const view: Mode = mode === "duel" && picked.you ? "ranks" : mode === "change" && !before ? "ranks" : mode;
  const moves = useMemo(() => (before ? rankMoves(picked.ranks, before.ranks) : null), [picked, before]);
  const duel = useMemo(() => (picked.you ? null : headToHead(you.ranks, picked.ranks)), [picked, you]);
  const dots = useMemo<MapDot[]>(() => {
    if (view === "change" && moves) return moves.map(moveDot);
    if (view === "duel" && duel) return duel.points.map((d, i) => duelDot(d, you.ranks[i], picked.ranks[i], picked.title));
    return picked.ranks.map(rankDot);
  }, [view, moves, duel, picked, you]);
  const legend = view === "change" ? CHANGE_KEY : view === "duel" ? [{ label: "You rank higher", dot: "var(--signal)" }, { label: `${picked.title} ranks higher`, dot: "#111111" }, { label: "Same rank", dot: "#9CA3AF" }, { label: "Neither in the top 20", dot: "#E5E7EB" }] : TONES;
  const summary =
    view === "change" && moves
      ? `Since ${prevAt ? when(prevAt) : "the scan before"}: better at ${moves.filter((m) => m.kind === "up" || m.kind === "new").length} points, worse at ${moves.filter((m) => m.kind === "down" || m.kind === "lost").length}.`
      : view === "duel" && duel
        ? `You rank higher at ${duel.you} points, ${picked.title} at ${duel.them}${duel.tie ? `, the same at ${duel.tie}` : ""}.`
        : null;
  const bands = rankBands(picked.ranks);
  const shown = [...list].sort((a, b) => (sort === "reviews" ? (b.reviews ?? -1) - (a.reviews ?? -1) : sort === "rating" ? (b.rating ?? -1) - (a.rating ?? -1) : (a.avg ?? 99) - (b.avg ?? 99))).slice(0, 20);
  const pct = (n: number) => (bands.read ? Math.round((n / bands.read) * 100) : 0);
  const prevAvg = picked.you ? prev?.avg ?? null : null;

  const others = list.filter((b) => b.key !== picked.key).sort((a, b) => b.voice - a.voice);
  const voice = [
    { label: picked.you ? "You" : picked.title, value: picked.voice, color: "var(--signal)" },
    ...others.slice(0, 3).map((b, k) => ({ label: b.you ? "You" : b.title, value: b.voice, color: ["#1F2937", "#6B7280", "#B0B6C0"][k] })),
  ];
  const rest = Math.max(0, 1 - voice.reduce((a, v) => a + v.value, 0));
  if (rest > 0.001) voice.push({ label: "Everyone else", value: rest, color: "#E5E7EB" });
  const passed = (cur.listing ?? []).filter((c) => c.status === "pass").length;
  const checks = (cur.listing ?? []).length;

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Tile label={picked.you ? "Average rank" : `Average rank, ${picked.title}`}>
          <div className="flex items-center gap-4">
            <RankGauge avg={picked.avg} />
            <div className="flex min-w-0 flex-col gap-1">
              <span className="flex items-baseline gap-2">
                <span className="aw-num text-[30px] leading-none font-semibold text-ink">{picked.avg ?? "–"}</span>
                {picked.avg !== null && prevAvg !== null ? <Delta now={picked.avg} before={prevAvg} lowerIsBetter /> : null}
              </span>
              <span className="text-[12px] text-muted">across {bands.read} points, lower is better</span>
            </div>
          </div>
        </Tile>
        <Tile label="Share of voice">
          <div className="flex items-center gap-4">
            <Donut parts={voice} centre={`${Math.round(picked.voice * 1000) / 10}%`} />
            <ul className="flex min-w-0 flex-1 flex-col gap-1">
              {voice.map((v) => (
                <li key={v.label} className="flex items-center gap-2 text-[12px]">
                  <i className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: v.color }} />
                  <span className={`min-w-0 flex-1 wrap-break-word ${v.color === "var(--signal)" ? "font-semibold text-ink" : "text-body"}`}>{v.label}</span>
                  <span className="aw-num shrink-0 text-muted">{Math.round(v.value * 100)}%</span>
                </li>
              ))}
            </ul>
          </div>
        </Tile>
        <Tile label="Rank distribution">
          <div className="flex flex-col gap-3">
            <span className="flex h-3 w-full gap-0.5 overflow-hidden rounded-full bg-[var(--aw-surface-2)]">
              {([[bands.good, MAP.top3], [bands.average, MAP.top10], [bands.poor, MAP.top20], [bands.out, "#E5484D"]] as const).map(([n, c], k) => (n ? <span key={k} className="h-full" style={{ width: `${pct(n)}%`, background: c }} /> : null))}
            </span>
            <ul className="grid grid-cols-2 gap-x-3 gap-y-1.5">
              {([["1 to 3", bands.good, MAP.top3], ["4 to 10", bands.average, MAP.top10], ["11 to 20", bands.poor, MAP.top20], ["Not in top 20", bands.out, "#E5484D"]] as const).map(([label, n, c]) => (
                <li key={label} className="flex items-center gap-2 text-[12px]">
                  <i className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: c }} />
                  <span className="min-w-0 flex-1 text-body">{label}</span>
                  <span className="aw-num font-medium text-ink">{pct(n)}%</span>
                </li>
              ))}
            </ul>
          </div>
        </Tile>
        <Tile label="Top 3 coverage">
          <div className="flex items-center gap-4">
            <Matrix ranks={picked.ranks} size={size} inGrid={inGrid} />
            <div className="flex min-w-0 flex-col gap-1">
              <span className="aw-num text-[30px] leading-none font-semibold text-ink">
                {bands.good}
                <span className="text-[16px] font-medium text-muted"> / {bands.read}</span>
              </span>
              <span className="text-[12px] text-muted">points in the map pack, #1 at {picked.ranks.filter((r) => r === 1).length}</span>
            </div>
          </div>
        </Tile>
      </div>

      <Card>
        <div className="grid lg:grid-cols-[320px_minmax(0,1fr)]">
          <div className="flex min-w-0 flex-col border-b border-[var(--aw-rule)] lg:border-r lg:border-b-0">
            <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-3">
              <span className="text-[13px] font-semibold text-ink">“{cur.keyword}”</span>
              <Seg label="Sort businesses" value={sort} onChange={setSort} options={[{ id: "rank", label: "Rank" }, { id: "reviews", label: "Reviews" }, { id: "rating", label: "Rating" }]} />
            </div>
            <div className="relative min-h-0 flex-1">
            <ul className="flex max-h-[520px] flex-col overflow-y-auto px-2 pb-2 lg:absolute lg:inset-0 lg:max-h-none">
              {shown.map((b) => {
                const on = b.key === picked.key;
                return (
                  <li key={b.key}>
                    <button type="button" aria-pressed={on} onClick={() => setPick(b.key)} className={`flex w-full items-start gap-3 rounded-[10px] px-2.5 py-2.5 text-left ${on ? "bg-[var(--signal-soft)]" : "hover:bg-[var(--aw-surface-2)]"}`}>
                      <span className="aw-num mt-0.5 grid h-7 min-w-10 shrink-0 place-items-center rounded-[6px] px-1 text-[12px] font-semibold text-white" style={{ background: b.avg === null || b.avg > 20 ? "#E5484D" : b.avg <= 3 ? MAP.top3 : b.avg <= 10 ? MAP.top10 : MAP.top20 }}>{b.avg ?? "–"}</span>
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="flex items-start justify-between gap-2">
                          <span className={`text-[13px] font-semibold wrap-break-word ${b.you ? "text-[var(--signal-ink)]" : "text-ink"}`}>{b.title}</span>
                          {b.you ? <span className="aw-status aw-status--ranked shrink-0">You</span> : null}
                        </span>
                        {b.address ? <span className="text-[12px] text-muted wrap-break-word">{b.address}</span> : null}
                        <span className="text-[12px] text-body">
                          {b.rating !== null ? <span className="font-medium text-ink">★ {b.rating}</span> : null}
                          {b.reviews !== null ? <span className="text-muted"> ({b.reviews.toLocaleString("en-US")})</span> : null}
                          {b.top3 ? <span className="text-muted">{b.rating !== null || b.reviews !== null ? ", " : ""}top 3 at {b.top3}</span> : null}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
            </div>
          </div>
          <div className="relative min-w-0 p-3">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3 px-1">
              <Seg
                label="Map view"
                value={view}
                onChange={setMode}
                options={[
                  { id: "ranks", label: "Ranks" },
                  ...(before ? [{ id: "change" as const, label: "Change" }] : []),
                  ...(!picked.you ? [{ id: "duel" as const, label: "Head to head" }] : []),
                ]}
              />
              {view === "change" && compare.length > 1 && compareId ? (
                <Dropdown<string> label="Compare with" value={compareId} onChange={onCompare} options={compare.map((c) => ({ id: c.id, label: `Against ${when(c.at)}` }))} />
              ) : null}
              <span className="text-[12.5px] text-body wrap-break-word">{summary ?? (picked.you ? "Pick a competitor in the list to compare head to head." : `Showing ${picked.title}'s ranks.`)}</span>
            </div>
            {mapFailed ? (
              <Heat ranks={picked.ranks} spacing={cur.spacing} size={size} inGrid={inGrid} sel={at} onSel={onPt} />
            ) : (
              <LocalMap lat={center.lat} lng={center.lng} spacing={cur.spacing} size={size} shape={cur.shape ?? "square"} pin={{ lat: loc.lat, lng: loc.lng }} dots={dots} sel={at} onSel={onPt} onFail={onFail} />
            )}
            {pt !== null ? (
              <div className="pointer-events-none absolute top-[72px] left-6 z-10 w-[min(300px,calc(100%-48px))]">
                <div className="pointer-events-auto rounded-[12px] bg-[var(--aw-surface)] shadow-[0_2px_12px_rgb(0_0_0_/_0.14)]">
                  <div className="flex items-center justify-between gap-2 py-1.5 pr-1.5 pl-4">
                    <span className="text-[12px] font-semibold text-ink">{at === centre ? (cur.center ? "Map pack at the centre" : "Map pack at the business") : `Map pack ${placeText(at, cur.spacing, size)}`}</span>
                    <button type="button" className="aw-iconbtn h-7! w-7!" aria-label="Close" onClick={() => onPt(null)}>
                      ×
                    </button>
                  </div>
                  {raw ? <Pack results={raw[String(at)]} picked={picked} at={at} loc={{ ...loc, domain }} /> : <PackAt scan={cur} i={at} you={loc} />}
                </div>
              </div>
            ) : null}
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 px-1 text-[12px] text-body">
              {legend.map((t) => (
                <span key={t.label} className="flex items-center gap-1.5">
                  <i className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: t.dot }} />
                  {t.label}
                </span>
              ))}
              <span className="ml-auto text-muted">
                {size} × {size}{cur.shape === "circle" ? " round" : ""}, {cur.spacing} mi between points, {when(done[0].created_at)}
              </span>
            </div>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card title="All keywords" className="h-full">
          <Keywords rows={keywordTable(history, loc.keywords)} current={keyword} onPick={onKeyword} />
        </Card>
        <Card title={`Rank over time, “${keyword}”`} className="h-full">
          <History runs={keywordTable(history, [keyword])[0].runs} />
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card title="What this scan says" className="h-full">
          <div className="flex h-full flex-col gap-3 px-5 pt-4 pb-5">
            <p className="rounded-[10px] bg-[var(--signal-soft)] px-3.5 py-3 text-[14px] leading-snug font-semibold text-ink wrap-break-word">{headline}</p>
            <ul className="flex flex-col gap-2">
              {insights.map((x) => (
                <li key={x.text} className="flex items-start gap-2.5 text-[13px] leading-snug text-body">
                  <i className="mt-[5px] inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: INSIGHT[x.tone] }} />
                  <span className="min-w-0 wrap-break-word">{x.text}</span>
                </li>
              ))}
            </ul>
            <Sides ranks={picked.ranks} size={size} />
          </div>
        </Card>
        <Card title="Listing check" className="h-full" action={checks ? <span className={`aw-status ${fixes ? "aw-status--warn" : "aw-status--ranked"}`}>{fixes ? `${fixes} to fix` : "All good"}</span> : null}>
          {cur.listing ? (
            <div className="flex flex-col gap-3 px-5 pt-4 pb-4">
              <div className="flex items-center gap-4 rounded-[10px] bg-[var(--aw-surface-2)] px-3.5 py-3">
                <Donut parts={[{ label: "Passed", value: passed, color: MAP.top3 }, { label: "To fix", value: checks - passed, color: "#E5E7EB" }]} centre={`${passed}/${checks}`} size={64} />
                <span className="text-[13px] leading-snug text-body">
                  {fixes ? `${fixes} of ${checks} checks show your website and Google listing disagree. Google trusts a listing more when they match.` : "Your website and Google listing agree."}
                </span>
              </div>
              <ul className="flex flex-col">
                {[...cur.listing].sort((a, b) => ORDER[a.status] - ORDER[b.status]).map((c) => (
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
            </div>
          ) : (
            <p className="px-5 pt-4 pb-5 text-[13px] text-muted">The listing check runs with the next scan.</p>
          )}
        </Card>
        <Card title="Reviews against the leaders" className="h-full">
          <Reviews done={done} owners={owners} />
        </Card>
      </div>
    </>
  );
}

/** Average rank on each side of the grid, as a compass: where the business is strong and where it fades. */
function Sides({ ranks, size }: { ranks: (number | null | undefined)[]; size: number }) {
  const h = Math.floor(size / 2);
  const side = (test: (r: number, c: number) => boolean) => {
    const vals = ranks.map((v, i) => ({ v, r: Math.floor(i / size), c: i % size })).filter((x) => x.v !== undefined && test(x.r, x.c)).map((x) => Math.min(x.v ?? 21, 21));
    return vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 : null;
  };
  const cells = [
    { name: "North", v: side((r) => r < h), area: "1 / 2" },
    { name: "West", v: side((_, c) => c < h), area: "2 / 1" },
    { name: "East", v: side((_, c) => c > h), area: "2 / 3" },
    { name: "South", v: side((r) => r > h), area: "3 / 2" },
  ];
  const fill = (v: number | null) => (v === null ? "var(--aw-faint)" : v <= 3 ? MAP.top3 : v <= 10 ? MAP.top10 : v <= 20 ? MAP.top20 : "#E5484D");
  return (
    <div className="mt-auto flex items-center gap-4 rounded-[10px] bg-[var(--aw-surface-2)] px-3.5 py-3">
      <div className="grid shrink-0 grid-cols-[repeat(3,44px)] grid-rows-[repeat(3,30px)] gap-1">
        {cells.map((c) => (
          <span key={c.name} className="aw-num grid place-items-center rounded-[6px] text-[12px] font-semibold text-white" style={{ gridArea: c.area, background: fill(c.v) }} title={c.name}>
            {c.v ?? "–"}
          </span>
        ))}
        <span className="grid place-items-center text-[10px] font-semibold text-muted" style={{ gridArea: "2 / 2" }}>
          You
        </span>
      </div>
      <span className="text-[12px] leading-snug text-body">Average rank on each side of the business. A lower number means stronger.</span>
    </div>
  );
}

/** A move between two scans as a dot: arrows and spots gained or lost. */
function moveDot(m: Move): MapDot {
  switch (m.kind) {
    case "up":
      return { label: `↑${m.by}`, bg: MAP.top3, fg: "#fff", border: "#fff", aria: `Up ${m.by}` };
    case "down":
      return { label: `↓${m.by}`, bg: "#E5484D", fg: "#fff", border: "#fff", aria: `Down ${m.by}` };
    case "new":
      return { label: "In", bg: MAP.top3, fg: "#fff", border: "#fff", aria: "Entered the top 20" };
    case "lost":
      return { label: "Out", bg: "#E5484D", fg: "#fff", border: "#fff", aria: "Left the top 20" };
    case "same":
      return { label: "=", bg: "#9CA3AF", fg: "#fff", border: "#fff", aria: "No change" };
    case "out":
      return { label: "–", bg: "#E5E7EB", fg: "#6B7280", border: "#fff", aria: "Out of the top 20 both times" };
    default:
      return { label: "?", bg: "#fff", fg: "#9A9A9A", border: "#C8C8C8", dashed: true, aria: "No answer in one of the scans" };
  }
}

/** Who ranks higher at a point: the winner's rank in its colour. */
function duelDot(d: Duel, mine: number | null | undefined, theirs: number | null | undefined, name: string): MapDot {
  if (d === "you") return { label: String(mine), bg: "var(--signal)", fg: "#fff", border: "#fff", aria: `You rank higher, #${mine}` };
  if (d === "them") return { label: String(theirs), bg: "#111111", fg: "#fff", border: "#fff", aria: `${name} ranks higher, #${theirs}` };
  if (d === "tie") return { label: "=", bg: "#9CA3AF", fg: "#fff", border: "#fff", aria: "Same rank" };
  if (d === "neither") return { label: "–", bg: "#E5E7EB", fg: "#6B7280", border: "#fff", aria: "Neither in the top 20" };
  return { label: "?", bg: "#fff", fg: "#9A9A9A", border: "#C8C8C8", dashed: true, aria: "No answer" };
}

const bandColor = (v: number | null) => (v === null || v > 20 ? "#E5484D" : v <= 3 ? MAP.top3 : v <= 10 ? MAP.top10 : MAP.top20);

/** Every keyword's latest numbers in one table: click a row to open it. */
function Keywords({ rows, current, onPick }: { rows: ReturnType<typeof keywordTable>; current: string; onPick: (k: string) => void }) {
  const scanned = rows.filter((r) => r.last?.avg != null).sort((a, b) => a.last!.avg! - b.last!.avg!);
  const best = scanned[0] ?? null;
  const worst = scanned.length > 1 ? scanned[scanned.length - 1] : null;
  return (
    <div className="flex h-full flex-col gap-3 pb-4">
    <div className="overflow-x-auto px-2">
      <table className="aw-table">
        <thead>
          <tr>
            <th>Keyword</th>
            <th className="text-right">Average rank</th>
            <th className="text-right">Top 3</th>
            <th>Trend</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const on = r.keyword === current;
            const l = r.last;
            return (
              <tr key={r.keyword} onClick={() => onPick(r.keyword)} className={`cursor-pointer ${on ? "bg-[var(--signal-soft)]" : ""}`}>
                <td className={`min-w-36 wrap-break-word ${on ? "font-semibold text-[var(--signal-ink)]" : "text-ink"}`}>
                  <button type="button" onClick={() => onPick(r.keyword)} className="text-left">
                    {r.keyword}
                  </button>
                </td>
                <td className="text-right whitespace-nowrap">
                  {l ? (
                    <span className="inline-flex items-center gap-2">
                      {r.change !== null && r.change !== 0 ? <span className={`text-[12px] ${r.change < 0 ? "text-pos" : "text-neg"}`}>{r.change < 0 ? `↑${-r.change}` : `↓${r.change}`}</span> : null}
                      <span className="aw-num inline-grid h-6 min-w-10 place-items-center rounded-[6px] px-1 text-[12px] font-semibold text-white" style={{ background: bandColor(l.avg) }}>
                        {l.avg ?? "–"}
                      </span>
                    </span>
                  ) : (
                    <span className="text-[12px] text-muted">No scan yet</span>
                  )}
                </td>
                <td className="aw-num text-right">{l && l.read ? `${Math.round((l.top3 / l.read) * 100)}%` : "–"}</td>
                <td className="w-28">{r.runs.length > 1 ? <Trend values={r.runs.map((x) => x.avg ?? 21).reverse()} /> : <span className="text-[12px] text-muted">–</span>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
      {best ? (
        <div className="mt-auto grid grid-cols-2 gap-2 px-5">
          {[["Strongest keyword", best], ["Needs the most work", worst]].map(([label, r]) => {
            const row = r as (typeof rows)[number] | null;
            return (
              <button key={label as string} type="button" disabled={!row} onClick={() => row && onPick(row.keyword)} className="flex flex-col items-start gap-1 rounded-[10px] bg-[var(--aw-surface-2)] px-3.5 py-3 text-left disabled:cursor-default">
                <span className="text-[11px] font-medium text-muted">{label as string}</span>
                {row ? (
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="aw-num inline-grid h-6 min-w-10 place-items-center rounded-[6px] px-1 text-[12px] font-semibold text-white" style={{ background: bandColor(row.last!.avg) }}>
                      {row.last!.avg}
                    </span>
                    <span className="text-[13px] font-semibold text-ink wrap-break-word">{row.keyword}</span>
                  </span>
                ) : (
                  <span className="text-[13px] text-muted">Scan another keyword to compare</span>
                )}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

/** A small line of average rank, scans oldest first, drawn with #1 at the top. */
function Trend({ values }: { values: number[] }) {
  const w = 96;
  const h = 26;
  const max = Math.max(...values, 2);
  const min = Math.min(...values, 1);
  const pts = values.map((v, i) => `${((i / (values.length - 1)) * w).toFixed(1)},${(3 + ((v - min) / (max - min || 1)) * (h - 6)).toFixed(1)}`).join(" ");
  const better = values[values.length - 1] <= values[0];
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="block h-[26px] w-24" aria-hidden="true">
      <polyline points={pts} fill="none" stroke={better ? MAP.top3 : "#E5484D"} strokeWidth="2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** Average rank (line, #1 at the top) and top 3 share (bars) for one keyword, scan by scan. */
function History({ runs }: { runs: KeywordRun[] }) {
  const pts = [...runs].reverse().slice(-12);
  if (pts.length < 2) {
    const l = pts[0];
    return (
      <div className="flex h-full flex-col justify-center gap-3 px-5 pt-4 pb-5">
        {l ? (
          <div className="grid grid-cols-2 gap-2">
            <span className="flex flex-col gap-1 rounded-[10px] bg-[var(--aw-surface-2)] px-3.5 py-3">
              <span className="text-[11px] font-medium text-muted">Average rank, {when(l.at)}</span>
              <span className="aw-num text-[20px] leading-none font-semibold text-ink">{l.avg ?? "–"}</span>
            </span>
            <span className="flex flex-col gap-1 rounded-[10px] bg-[var(--aw-surface-2)] px-3.5 py-3">
              <span className="text-[11px] font-medium text-muted">Top 3 share</span>
              <span className="aw-num text-[20px] leading-none font-semibold text-ink">{l.read ? Math.round((l.top3 / l.read) * 100) : 0}%</span>
            </span>
          </div>
        ) : null}
        <p className="text-[12px] text-muted">The chart fills in as more scans run. Weekly scans add one point a week.</p>
      </div>
    );
  }
  const W = 560;
  const H = 210;
  const L = 34;
  const R = 12;
  const T = 14;
  const B = 28;
  const max = Math.max(21, ...pts.map((p) => p.avg ?? 21));
  const x = (k: number) => L + (k / (pts.length - 1)) * (W - L - R);
  const y = (v: number) => T + ((v - 1) / (max - 1)) * (H - T - B);
  const bw = Math.min(28, ((W - L - R) / pts.length) * 0.5);
  const line = pts.map((p, k) => `${x(k)},${y(p.avg ?? 21)}`).join(" ");
  return (
    <div className="flex flex-col gap-2 px-5 pt-4 pb-5">
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label="Average rank and top 3 share over time">
        {[1, 10, 20].map((v) => (
          <g key={v}>
            <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="var(--aw-rule)" strokeDasharray="3 4" />
            <text x={L - 8} y={y(v) + 4} textAnchor="end" fill="var(--aw-muted)" style={{ font: "10px Inter, system-ui, sans-serif" }}>
              #{v}
            </text>
          </g>
        ))}
        {pts.map((p, k) => {
          const share = p.read ? p.top3 / p.read : 0;
          const bh = share * (H - T - B);
          return <rect key={`b${k}`} x={x(k) - bw / 2} y={H - B - bh} width={bw} height={bh} rx="3" fill={MAP.top3} opacity="0.22" />;
        })}
        <polyline points={line} fill="none" stroke="var(--signal)" strokeWidth="2.5" strokeLinejoin="round" />
        {pts.map((p, k) => (
          <g key={`d${k}`}>
            <circle cx={x(k)} cy={y(p.avg ?? 21)} r="4" fill="#fff" stroke="var(--signal)" strokeWidth="2" />
            {k === pts.length - 1 || k === 0 ? (
              <text x={x(k) + (k === 0 ? 8 : -8)} y={y(p.avg ?? 21) + 18} textAnchor={k === 0 ? "start" : "end"} fill="var(--aw-ink)" style={{ font: "600 11px Inter, system-ui, sans-serif" }}>
                {p.avg ?? "–"}
              </text>
            ) : null}
          </g>
        ))}
        <text x={x(0)} y={H - 8} fill="var(--aw-muted)" style={{ font: "10px Inter, system-ui, sans-serif" }}>
          {when(pts[0].at)}
        </text>
        <text x={x(pts.length - 1)} y={H - 8} textAnchor="end" fill="var(--aw-muted)" style={{ font: "10px Inter, system-ui, sans-serif" }}>
          {when(pts[pts.length - 1].at)}
        </text>
      </svg>
      <div className="flex flex-wrap gap-4 text-[12px] text-body">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-[3px] w-3.5 rounded bg-[var(--signal)]" />
          Average rank
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-[2px]" style={{ background: MAP.top3, opacity: 0.35 }} />
          Top 3 share
        </span>
      </div>
    </div>
  );
}

/** A scan's saved Google Maps results, by point. */
function useRaw(sb: SupabaseClient, id: string | null): Record<string, Place[] | null> | null {
  const [raw, setRaw] = useState<{ id: string; points: Record<string, Place[] | null> } | null>(null);
  useEffect(() => {
    if (!id) return;
    let live = true;
    sb.from("local_scans")
      .select("points")
      .eq("id", id)
      .maybeSingle()
      .then(({ data }) => live && setRaw({ id, points: (data?.points ?? {}) as Record<string, Place[] | null> }));
    return () => {
      live = false;
    };
  }, [sb, id]);
  return raw && raw.id === id ? raw.points : null;
}

/** A card of the top row: a label and one visual with its number. All four are the same height. */
function Tile({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="aw-frame flex h-full min-w-0 flex-col gap-3 px-5 py-4">
      <span className="text-[12px] font-medium text-muted wrap-break-word">{label}</span>
      <div className="flex flex-1 flex-col justify-center">{children}</div>
    </section>
  );
}

/** Average rank on a ring: full and green at #1, empty and red at 21 (not in the top 20). */
function RankGauge({ avg }: { avg: number | null }) {
  const r = 26;
  const len = 2 * Math.PI * r;
  const share = avg === null ? 0 : Math.max(0, Math.min(1, (21 - avg) / 20));
  const color = avg === null ? "var(--aw-faint)" : avg <= 3 ? MAP.top3 : avg <= 10 ? MAP.top10 : avg <= 20 ? MAP.top20 : "#E5484D";
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" aria-hidden="true" className="shrink-0">
      <circle cx="32" cy="32" r={r} fill="none" stroke="var(--aw-surface-2)" strokeWidth="7" />
      <circle cx="32" cy="32" r={r} fill="none" stroke={color} strokeWidth="7" strokeLinecap="round" strokeDasharray={`${share * len} ${len}`} transform="rotate(-90 32 32)" />
    </svg>
  );
}

/** A donut of shares with a label in the middle. */
function Donut({ parts, centre, size = 76 }: { parts: { label: string; value: number; color: string }[]; centre: string; size?: number }) {
  const total = parts.reduce((a, p) => a + p.value, 0) || 1;
  const r = 30;
  const len = 2 * Math.PI * r;
  const arcs = parts.map((p, k) => ({ ...p, d: (p.value / total) * len, start: parts.slice(0, k).reduce((a, q) => a + (q.value / total) * len, 0) }));
  return (
    <svg width={size} height={size} viewBox="0 0 76 76" aria-hidden="true" className="shrink-0">
      <circle cx="38" cy="38" r={r} fill="none" stroke="var(--aw-surface-2)" strokeWidth="9" />
      {arcs.map((p) => (p.d > 0 ? <circle key={p.label} cx="38" cy="38" r={r} fill="none" stroke={p.color} strokeWidth="9" strokeDasharray={`${p.d} ${len - p.d}`} strokeDashoffset={-p.start} transform="rotate(-90 38 38)" /> : null))}
      <text x="38" y="42" textAnchor="middle" fill="var(--aw-ink)" style={{ font: "600 13px Inter, system-ui, sans-serif", fontVariantNumeric: "tabular-nums" }}>
        {centre}
      </text>
    </svg>
  );
}

/** The grid in small: the picked business's rank at each point. Points outside a round grid stay blank. */
function Matrix({ ranks, size, inGrid }: { ranks: (number | null | undefined)[]; size: number; inGrid: Set<number> }) {
  const px = size >= 13 ? 4 : size >= 9 ? 5 : 7;
  return (
    <span className="grid shrink-0" style={{ gridTemplateColumns: `repeat(${size}, ${px}px)`, gap: size >= 13 ? 2 : 3 }} aria-hidden="true">
      {Array.from({ length: size * size }, (_, i) => {
        const r = ranks[i];
        return <i key={i} className="block rounded-[2px]" style={{ width: px, height: px, background: !inGrid.has(i) ? "transparent" : r === undefined ? "var(--aw-surface-2)" : r === null ? "#F3B5B7" : r <= 3 ? MAP.top3 : r <= 10 ? MAP.top10 : MAP.top20 }} />;
      })}
    </span>
  );
}

/** The top 5 at one point from the saved results, with the picked business marked, and its rank when it's lower. */
function Pack({ results, picked, at, loc }: { results: Place[] | null | undefined; picked: Business; at: number; loc: Location & { domain: string } }) {
  if (!results) return <p className="px-4 pb-3 text-[12px] text-muted">Google Maps didn&apos;t answer for this point.</p>;
  const keyFor = (p: Place) => (isBusiness(p, loc) ? "__you" : placeKey(p));
  const seen = new Set<string>();
  const rows = [...results].sort((a, b) => a.rank - b.rank).filter((p) => (seen.has(keyFor(p)) ? false : (seen.add(keyFor(p)), true)));
  const r = picked.ranks[at];
  return (
    <div className="flex flex-col px-4 pb-3">
      <ol className="flex flex-col">
        {rows.slice(0, 5).map((p, k) => {
          const on = keyFor(p) === picked.key;
          return (
            <li key={`${keyFor(p)}${k}`} className={`flex items-center gap-2.5 border-t border-[var(--aw-rule)] py-1.5 first:border-t-0 ${on ? "font-semibold text-[var(--signal-ink)]" : "text-ink"}`}>
              <span className="aw-num w-5 text-[11px] text-muted">#{k + 1}</span>
              <span className="min-w-0 flex-1 text-[12.5px] wrap-break-word">{p.title}</span>
              {p.rating !== null ? <span className="shrink-0 text-[11.5px] font-normal text-muted tabular-nums">★ {p.rating}</span> : null}
            </li>
          );
        })}
      </ol>
      {r === null || (typeof r === "number" && r > 5) ? (
        <p className="border-t border-[var(--aw-rule)] pt-1.5 text-[12px] text-body">
          {picked.you ? "You" : picked.title} {r === null ? (picked.you ? "aren't in the top 20 here." : "isn't in the top 20 here.") : `${picked.you ? "rank" : "ranks"} #${r} here.`}
        </p>
      ) : null}
    </div>
  );
}

// Map colours: the usual traffic light, bright enough to read as a heat map.
const MAP = { top3: "#1F9D55", top10: "#F2A20C", top20: "#E8590C" };
const INSIGHT = { good: MAP.top3, warn: MAP.top10, bad: "var(--aw-neg)", info: "var(--signal)" } as const;
const TONES = [
  { label: "Top 3", dot: MAP.top3 },
  { label: "4 to 10", dot: MAP.top10 },
  { label: "11 to 20", dot: MAP.top20 },
  { label: "Not in the top 20", dot: "#E5484D" },
];

const CHANGE_KEY = [
  { label: "Better", dot: MAP.top3 },
  { label: "Worse", dot: "#E5484D" },
  { label: "No change", dot: "#9CA3AF" },
  { label: "Out of the top 20 both times", dot: "#E5E7EB" },
];

const ORDER = { fail: 0, warn: 1, pass: 2 } as const;

/** The colour for a rank: the dot and the heat under it. */
function tone(rank: number | null, error?: boolean): { dot: string; heat: string; text: string } {
  if (error) return { dot: "var(--aw-surface)", heat: "transparent", text: "var(--aw-faint)" };
  if (rank === null) return { dot: "var(--aw-surface)", heat: "var(--aw-neg)", text: "var(--aw-muted)" };
  if (rank <= 3) return { dot: MAP.top3, heat: MAP.top3, text: "#fff" };
  if (rank <= 10) return { dot: MAP.top10, heat: MAP.top10, text: "#fff" };
  return { dot: MAP.top20, heat: MAP.top20, text: "#fff" };
}

/** The 49 points as a heat map: a soft colour field under the dots, the business in the middle. */
function Heat({ ranks, spacing, size, inGrid, sel, onSel }: { ranks: (number | null | undefined)[]; spacing: number; size: number; inGrid: Set<number>; sel: number; onSel: (i: number) => void }) {
  const points = ranks.map((r, i) => ({ i, rank: r ?? null, error: r === undefined })).filter((p) => inGrid.has(p.i));
  const W = 560;
  const GRID = size;
  const cell = W / GRID;
  const mid = Math.floor((GRID * GRID) / 2);
  const dot = Math.min(16, cell * 0.36);
  const c = (i: number) => [cell * (i % GRID) + cell / 2, cell * Math.floor(i / GRID) + cell / 2] as const;
  return (
    <svg viewBox={`0 0 ${W} ${W}`} className="block h-auto w-full" role="img" aria-label="Google Maps rank at each point">
      <defs>
        <clipPath id="lr-clip">
          <rect width={W} height={W} rx="14" />
        </clipPath>
        <filter id="lr-blur" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="26" />
        </filter>
      </defs>
      <g clipPath="url(#lr-clip)">
        <rect width={W} height={W} fill="var(--aw-surface-2)" />
        <g filter="url(#lr-blur)" opacity="0.5">
          {points.map((p) => (
            <rect key={p.i} x={cell * (p.i % GRID) - 6} y={cell * Math.floor(p.i / GRID) - 6} width={cell + 12} height={cell + 12} fill={tone(p.rank, p.error).heat} opacity={p.rank === null && !p.error ? 0.22 : 1} />
          ))}
        </g>
        {Array.from({ length: GRID * 2 - 1 }, (_, k) => {
          const v = (cell / 2) * (k + 1);
          return (
            <g key={k} stroke="var(--aw-surface)" strokeOpacity={k % 2 ? 0.35 : 0.7} strokeWidth={k % 2 ? 1 : 2}>
              <line x1={0} x2={W} y1={v} y2={v} />
              <line y1={0} y2={W} x1={v} x2={v} />
            </g>
          );
        })}
      </g>
      {points.map((p) => {
        const [x, y] = c(p.i);
        const t = tone(p.rank, p.error);
        const open = p.rank === null;
        return (
          <g key={p.i} className="cursor-pointer" onClick={() => onSel(p.i)} role="button" tabIndex={0} aria-label={`${placeText(p.i, spacing, size)}: ${p.error ? "no answer" : p.rank === null ? "not in the top 20" : `rank ${p.rank}`}`} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onSel(p.i)}>
            {sel === p.i ? <circle cx={x} cy={y} r={dot + 7} fill="none" stroke="var(--aw-ink)" strokeWidth="2.5" /> : null}
            {p.i === mid ? <circle cx={x} cy={y} r={dot + 5} fill="none" stroke="var(--signal)" strokeWidth="3" /> : null}
            <circle cx={x} cy={y} r={dot} fill={t.dot} stroke={open ? "var(--aw-faint)" : "var(--aw-surface)"} strokeWidth={open ? 1.25 : 2} strokeDasharray={p.error ? "3 3" : undefined} />
            <text x={x} y={y + 4.5} textAnchor="middle" fill={t.text} style={{ font: `600 ${size >= 13 ? 9 : size >= 9 ? 11 : 13}px Geist, Inter, system-ui, sans-serif`, fontVariantNumeric: "tabular-nums" }}>
              {p.error ? "?" : p.rank === null ? "–" : p.rank}
            </text>
          </g>
        );
      })}
      <text x={W / 2} y={16} textAnchor="middle" fill="var(--aw-muted)" style={{ font: "600 11px Inter, system-ui, sans-serif" }}>
        N
      </text>
    </svg>
  );
}

function PackAt({ scan, i, you }: { scan: ScanResult; i: number; you: Location }) {
  const p = scan.points.find((x) => x.i === i);
  if (!p) return null;
  if (p.error) return <p className="px-5 pb-4 text-[13px] text-muted">Google Maps didn&apos;t answer for this point.</p>;
  const isYou = (t: { title: string; cid: string | null }) => (you.cid && t.cid ? you.cid === t.cid : t.title === you.title);
  const info = new Map(scan.rivals.map((r) => [r.cid ?? r.title, r]));
  const t = tone(p.rank);
  return (
    <div className="flex flex-col gap-3 px-5 pb-4">
      <div className="flex items-center gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-[13px] font-semibold tabular-nums" style={{ background: p.rank === null ? "var(--aw-surface-2)" : t.dot, color: p.rank === null ? "var(--aw-muted)" : "#fff" }}>
          {p.rank ?? "–"}
        </span>
        <span className="text-[13px] text-body">{p.rank === null ? "You're not in the top 20 here." : p.rank <= 3 ? `You're in the map pack here, at #${p.rank}.` : `You rank #${p.rank} here, outside the map pack.`}</span>
      </div>
      <ol className="flex flex-col">
        {p.top.map((x, k) => {
          const r = info.get(x.cid ?? x.title);
          const me = isYou(x);
          return (
            <li key={`${x.cid ?? x.title}${k}`} className={`flex items-center gap-3 border-t border-[var(--aw-rule)] py-2 first:border-t-0 ${me ? "text-[var(--signal-ink)]" : ""}`}>
              <span className="aw-num w-6 text-[12px] text-muted">#{k + 1}</span>
              <span className={`min-w-0 flex-1 text-[13px] wrap-break-word ${me ? "font-semibold" : "text-ink"}`}>{x.title}</span>
              {r && (r.rating !== null || r.reviews !== null) ? (
                <span className="shrink-0 text-[12px] text-muted tabular-nums">
                  {r.rating !== null ? `★ ${r.rating}` : ""}
                  {r.reviews !== null ? ` (${r.reviews.toLocaleString("en-US")})` : ""}
                </span>
              ) : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** Reviews and rating next to the map's leaders now, and review counts over time once there are two scans. */
function Reviews({ done, owners }: { done: Scan[]; owners: MapOwner[] }) {
  const you = owners.find((o) => o.you)!;
  const leaders = owners.filter((o) => !o.you).slice(0, 3);
  const rows = [you, ...leaders];
  const max = Math.max(1, ...rows.map((r) => r.reviews ?? 0));
  const top = [...leaders].sort((a, b) => (b.reviews ?? 0) - (a.reviews ?? 0))[0] ?? null;
  const gap = top && you.reviews !== null ? (top.reviews ?? 0) - you.reviews : 0;
  const rated = leaders.filter((l) => l.rating !== null);
  const rateGap = you.rating !== null && rated.length ? Math.round((you.rating - rated.reduce((a, l) => a + l.rating!, 0) / rated.length) * 10) / 10 : null;
  const names = leaders.slice(0, 2).map((r) => r.title);
  const h = reviewHistory(done.map((s) => ({ at: s.created_at, you: s.result!.you, rivals: s.result!.rivals })), names);
  const series = [{ name: you.title, color: "var(--signal)", vals: h.map((x) => x.you) }, ...names.map((n, k) => ({ name: n, color: k ? "var(--aw-faint)" : "var(--aw-ink)", vals: h.map((x) => x.rivals[n]) }))];
  return (
    <div className="flex h-full flex-col gap-5 px-5 pt-4 pb-5">
      <div className="flex flex-col gap-3">
        {rows.map((r) => (
          <div key={r.title} className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between gap-3 text-[13px]">
              <span className={`min-w-0 wrap-break-word ${r.you ? "font-semibold text-[var(--signal-ink)]" : "text-ink"}`}>{r.you ? `${r.title} (you)` : r.title}</span>
              <span className="shrink-0 text-muted tabular-nums">
                {r.rating !== null ? <span className="mr-2 font-medium text-ink">★ {r.rating}</span> : null}
                {r.reviews !== null ? r.reviews.toLocaleString("en-US") : "–"}
              </span>
            </div>
            <span className="block h-2 rounded-full bg-[var(--aw-surface-2)]">
              <span className="block h-full rounded-full" style={{ width: `${Math.max(r.reviews ? 2 : 0, ((r.reviews ?? 0) / max) * 100)}%`, background: r.you ? "var(--signal)" : "var(--aw-ink)" }} />
            </span>
          </div>
        ))}
      </div>
      {h.length >= 2 ? <ReviewLines h={h} series={series} /> : <p className="rounded-[10px] bg-[var(--aw-surface-2)] px-3.5 py-3 text-[12px] text-muted">The review trend shows after the next scan.</p>}
      {top && you.reviews !== null ? (
        <div className="mt-auto grid grid-cols-2 gap-2">
          <span className="flex flex-col gap-1 rounded-[10px] bg-[var(--aw-surface-2)] px-3.5 py-3">
            <span className="text-[11px] font-medium text-muted">Reviews to match {top.title}</span>
            <span className={`aw-num text-[20px] leading-none font-semibold ${gap > 0 ? "text-ink" : "text-pos"}`}>{gap > 0 ? `+${gap.toLocaleString("en-US")}` : "Ahead"}</span>
          </span>
          <span className="flex flex-col gap-1 rounded-[10px] bg-[var(--aw-surface-2)] px-3.5 py-3">
            <span className="text-[11px] font-medium text-muted">Rating against the leaders</span>
            <span className={`aw-num text-[20px] leading-none font-semibold ${rateGap === null ? "text-muted" : rateGap >= 0 ? "text-pos" : "text-neg"}`}>{rateGap === null ? "–" : `${rateGap >= 0 ? "+" : ""}${rateGap.toFixed(1)}`}</span>
          </span>
        </div>
      ) : null}
    </div>
  );
}

function ReviewLines({ h, series }: { h: { at: string }[]; series: { name: string; color: string; vals: (number | null)[] }[] }) {
  const all = series.flatMap((s) => s.vals).filter((v): v is number => v !== null);
  const min = Math.min(...all);
  const max = Math.max(...all, min + 1);
  const W = 340;
  const H = 150;
  const x = (k: number) => 34 + (k / (h.length - 1)) * (W - 44);
  const y = (v: number) => 10 + (1 - (v - min) / (max - min)) * (H - 34);
  return (
    <div className="flex flex-col gap-2">
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label="Review counts over time">
        {[min, max].map((v) => (
          <text key={v} x={28} y={y(v) + 4} textAnchor="end" fill="var(--aw-muted)" style={{ font: "10px Inter, system-ui, sans-serif" }}>
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
