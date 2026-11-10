"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { businesses, GRID, isBusiness, localInsights, mapOwners, placeKey, placeText, rankBands, reviewHistory, SPACINGS, type Business, type ListingCheck, type Location, type MapOwner, type Place, type ScanResult } from "@/lib/local";
import { LocalMap } from "./LocalMap";
import type { RunAuth } from "@/lib/runner";
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
export function LocalResearchPage({ brand, sb, auth, canEdit }: { brand: Brand; sb: SupabaseClient; auth: RunAuth; canEdit: boolean }) {
  const api = useApi(auth);
  const [loc, setLoc] = useState<Location | null | undefined>(undefined);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState("");
  const call = useCallback(<T,>(action: string, extra: Record<string, unknown> = {}) => api<T>("/api/local", { action, brandId: brand.id, ...extra }), [api, brand.id]);

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

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="aw-h2 mb-0!">Local Research</h1>
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
      {loc === null ? <Find brand={brand} call={call} canEdit={canEdit} onSet={setLoc} onError={setError} /> : null}
      {error ? <p className="aw-error">{error}</p> : null}
      {note ? <p className="aw-callout">{note}</p> : null}
      {loc === undefined ? (
        <Thinking text="Loading" />
      ) : loc ? (
        <Scans key={loc.cid ?? loc.title} brand={brand} loc={loc} sb={sb} canEdit={canEdit} busy={busy} call={call} run={run} save={save} onNote={setNote} />
      ) : null}
    </div>
  );
}

type Call = <T>(action: string, extra?: Record<string, unknown>) => Promise<T>;

/** The business search: a name and city, then the matching Google Maps listings to pick from. */
function Find({ brand, call, canEdit, onSet, onError }: { brand: Brand; call: Call; canEdit: boolean; onSet: (l: Location) => void; onError: (e: string) => void }) {
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
      onSet((await call<{ location: Location }>("set", { place: p })).location);
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
      <LocalIntro />
    </>
  );
}

function Scans({ brand, loc, sb, canEdit, busy, call, run, save, onNote }: { brand: Brand; loc: Location; sb: SupabaseClient; canEdit: boolean; busy: string; call: Call; run: <T>(k: string, fn: () => Promise<T>) => Promise<T | null>; save: (x: Record<string, unknown>) => Promise<void>; onNote: (s: string) => void }) {
  const [kw, setKw] = useState(loc.keywords[0] ?? "");
  const [scans, setScans] = useState<Scan[] | null>(null);
  const controls = canEdit;
  const [pt, setPt] = useState<number | null>(null);
  const [newKw, setNewKw] = useState("");
  const load = useCallback(async () => {
    if (!kw) return setScans([]);
    const { data } = await sb.from("local_scans").select("id, keyword, status, step, error, created_at, result").eq("brand_id", brand.id).eq("keyword", kw).order("created_at", { ascending: false }).limit(12);
    setScans((data ?? []) as Scan[]);
  }, [sb, brand.id, kw]);
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
  // The latest scan's saved Google Maps results, so every business's rank at every point can go on the map.
  const curId = done[0]?.id ?? null;
  const [raw, setRaw] = useState<{ id: string; points: Record<string, Place[] | null> } | null>(null);
  useEffect(() => {
    if (!curId) return;
    let live = true;
    sb.from("local_scans")
      .select("points")
      .eq("id", curId)
      .maybeSingle()
      .then(({ data }) => live && setRaw({ id: curId, points: (data?.points ?? {}) as Record<string, Place[] | null> }));
    return () => {
      live = false;
    };
  }, [sb, curId]);
  const prev = done[1]?.result ?? null;
  const failed = scans?.[0]?.status === "failed" ? scans[0] : null;

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
                <button type="submit" className="aw-btn aw-btn--secondary aw-btn--sm" disabled={!newKw.trim()}>
                  Add
                </button>
              </form>
            ) : null}
          </div>
          {controls ? (
            <div className="flex flex-wrap items-center gap-3">
              <Seg label="Grid spacing" value={String(loc.spacing)} onChange={(v) => save({ spacing: Number(v) })} options={SPACINGS.map((s) => ({ id: String(s), label: `${s} mi` }))} />
              <label className="flex cursor-pointer items-center gap-2 text-[13px] text-body">
                <button type="button" role="switch" aria-checked={loc.weekly} aria-label="Weekly scan" className={`aw-toggle ${loc.weekly ? "is-on" : ""}`} onClick={() => save({ weekly: !loc.weekly })} />
                Weekly scan
              </label>
              <button type="button" className="aw-btn aw-btn--primary aw-btn--sm" disabled={!kw || Boolean(running) || busy === "scan"} onClick={async () => (await run("scan", () => call("scan", { keyword: kw }))) && load()}>
                {running ? "Scanning" : busy === "scan" ? "Starting" : "Scan now"}
              </button>
              {loc.city ? (
                <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm" disabled={busy === "prompts"} onClick={async () => { const r = await run("prompts", () => call<{ added: string[] }>("prompts")); if (r) onNote(`Tracking ${r.added.length} local prompts in AI Visibility, under the topic Local.`); }}>
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
        <Results cur={cur} prev={prev} done={done} loc={loc} domain={brand.domain} raw={raw?.id === curId ? raw.points : null} pt={pt} onPt={setPt} />
      ) : null}
    </div>
  );
}

type Sort = "rank" | "reviews" | "rating";

function Results({ cur, prev, done, loc, domain, raw, pt, onPt }: { cur: ScanResult & { listing?: ListingCheck[] }; prev: ScanResult | null; done: Scan[]; loc: Location; domain: string; raw: Record<string, Place[] | null> | null; pt: number | null; onPt: (i: number | null) => void }) {
  const owners = useMemo(() => mapOwners(cur, loc), [cur, loc]);
  const { headline, insights } = useMemo(() => localInsights(cur, prev, loc), [cur, prev, loc]);
  const fixes = (cur.listing ?? []).filter((c) => c.status !== "pass").length;
  const centre = Math.floor((GRID * GRID) / 2);
  const at = pt ?? centre;
  // Every business with its rank at each point. Until the saved results load, the business itself from the summary.
  const list = useMemo<Business[]>(() => {
    if (raw) return businesses(Object.entries(raw).map(([i, results]) => ({ i: Number(i), results })), { ...loc, domain });
    const ranks = Array.from({ length: GRID * GRID }, (_, i) => {
      const p = cur.points.find((x) => x.i === i);
      return !p || p.error ? undefined : p.rank;
    });
    return [{ key: "__you", title: loc.title, you: true, address: loc.address, category: loc.category, rating: cur.you?.rating ?? null, reviews: cur.you?.reviews ?? null, ranks, avg: cur.avg, top3: cur.top3, found: cur.found, voice: cur.read ? cur.top3 / (cur.read * 3) : 0 }];
  }, [raw, cur, loc, domain]);
  const [pick, setPick] = useState("__you");
  const [sort, setSort] = useState<Sort>("rank");
  const [mapFailed, setMapFailed] = useState(false);
  const onFail = useCallback(() => setMapFailed(true), []);
  const picked = list.find((b) => b.key === pick) ?? list.find((b) => b.you)!;
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
            <Matrix ranks={picked.ranks} />
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
          <div className="flex min-w-0 flex-col border-b border-[var(--aw-rule)] lg:h-[620px] lg:border-r lg:border-b-0">
            <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-3">
              <span className="text-[13px] font-semibold text-ink">“{cur.keyword}”</span>
              <Seg label="Sort businesses" value={sort} onChange={setSort} options={[{ id: "rank", label: "Rank" }, { id: "reviews", label: "Reviews" }, { id: "rating", label: "Rating" }]} />
            </div>
            <ul className="flex max-h-[520px] min-h-0 flex-1 flex-col overflow-y-auto px-2 pb-2 lg:max-h-none">
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
          <div className="relative min-w-0 p-3">
            {mapFailed ? (
              <Heat ranks={picked.ranks} spacing={cur.spacing} sel={at} onSel={onPt} />
            ) : (
              <LocalMap lat={loc.lat} lng={loc.lng} spacing={cur.spacing} ranks={picked.ranks} sel={at} onSel={onPt} onFail={onFail} />
            )}
            {pt !== null ? (
              <div className="pointer-events-none absolute top-6 left-6 z-10 w-[min(300px,calc(100%-48px))]">
                <div className="pointer-events-auto rounded-[12px] bg-[var(--aw-surface)] shadow-[0_2px_12px_rgb(0_0_0_/_0.14)]">
                  <div className="flex items-center justify-between gap-2 py-1.5 pr-1.5 pl-4">
                    <span className="text-[12px] font-semibold text-ink">{at === centre ? "Map pack at the business" : `Map pack ${placeText(at, cur.spacing)}`}</span>
                    <button type="button" className="aw-iconbtn h-7! w-7!" aria-label="Close" onClick={() => onPt(null)}>
                      ×
                    </button>
                  </div>
                  {raw ? <Pack results={raw[String(at)]} picked={picked} at={at} loc={{ ...loc, domain }} /> : <PackAt scan={cur} i={at} you={loc} />}
                </div>
              </div>
            ) : null}
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 px-1 text-[12px] text-body">
              {TONES.map((t) => (
                <span key={t.label} className="flex items-center gap-1.5">
                  <i className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: t.dot }} />
                  {t.label}
                </span>
              ))}
              <span className="ml-auto text-muted">
                {cur.spacing} mi between points, {when(done[0].created_at)}
              </span>
            </div>
          </div>
        </div>
      </Card>

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
            <Sides ranks={picked.ranks} />
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
function Sides({ ranks }: { ranks: (number | null | undefined)[] }) {
  const h = Math.floor(GRID / 2);
  const side = (test: (r: number, c: number) => boolean) => {
    const vals = ranks.map((v, i) => ({ v, r: Math.floor(i / GRID), c: i % GRID })).filter((x) => x.v !== undefined && test(x.r, x.c)).map((x) => Math.min(x.v ?? 21, 21));
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

/** The grid in small: a 7 by 7 matrix of the picked business's ranks. */
function Matrix({ ranks }: { ranks: (number | null | undefined)[] }) {
  return (
    <span className="grid shrink-0 gap-[3px]" style={{ gridTemplateColumns: `repeat(${GRID}, 7px)` }} aria-hidden="true">
      {Array.from({ length: GRID * GRID }, (_, i) => {
        const r = ranks[i];
        return <i key={i} className="block h-[7px] w-[7px] rounded-[2px]" style={{ background: r === undefined ? "var(--aw-surface-2)" : r === null ? "#F3B5B7" : r <= 3 ? MAP.top3 : r <= 10 ? MAP.top10 : MAP.top20 }} />;
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
function Heat({ ranks, spacing, sel, onSel }: { ranks: (number | null | undefined)[]; spacing: number; sel: number; onSel: (i: number) => void }) {
  const points = ranks.map((r, i) => ({ i, rank: r ?? null, error: r === undefined }));
  const W = 560;
  const cell = W / GRID;
  const mid = Math.floor((GRID * GRID) / 2);
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
          <g key={p.i} className="cursor-pointer" onClick={() => onSel(p.i)} role="button" tabIndex={0} aria-label={`${placeText(p.i, spacing)}: ${p.error ? "no answer" : p.rank === null ? "not in the top 20" : `rank ${p.rank}`}`} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onSel(p.i)}>
            {sel === p.i ? <circle cx={x} cy={y} r="23" fill="none" stroke="var(--aw-ink)" strokeWidth="2.5" /> : null}
            {p.i === mid ? <circle cx={x} cy={y} r="21" fill="none" stroke="var(--signal)" strokeWidth="3" /> : null}
            <circle cx={x} cy={y} r="16" fill={t.dot} stroke={open ? "var(--aw-faint)" : "var(--aw-surface)"} strokeWidth={open ? 1.25 : 2} strokeDasharray={p.error ? "3 3" : undefined} />
            <text x={x} y={y + 4.5} textAnchor="middle" fill={t.text} style={{ font: "600 13px Inter, system-ui, sans-serif", fontVariantNumeric: "tabular-nums" }}>
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
  const W = 560;
  const H = 200;
  const x = (k: number) => 40 + (k / (h.length - 1)) * (W - 50);
  const y = (v: number) => 10 + (1 - (v - min) / (max - min)) * (H - 34);
  return (
    <div className="flex flex-col gap-2">
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label="Review counts over time">
        {[min, max].map((v) => (
          <text key={v} x={34} y={y(v) + 4} textAnchor="end" fill="var(--aw-muted)" style={{ font: "10px Inter, system-ui, sans-serif" }}>
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
