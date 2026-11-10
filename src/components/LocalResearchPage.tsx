"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { GRID, localInsights, mapOwners, placeText, reviewHistory, SPACINGS, type ListingCheck, type Location, type MapOwner, type Place, type ScanResult } from "@/lib/local";
import type { RunAuth } from "@/lib/runner";
import { BAR_INPUT } from "./research/shared";
import { SearchBar, SearchButton } from "./SearchBar";
import { Card, Delta, Seg, StatStrip, Thinking } from "./ui";
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
        <Results cur={cur} prev={prev} done={done} loc={loc} pt={pt} onPt={setPt} />
      ) : null}
    </div>
  );
}

function Results({ cur, prev, done, loc, pt, onPt }: { cur: ScanResult & { listing?: ListingCheck[] }; prev: ScanResult | null; done: Scan[]; loc: Location; pt: number | null; onPt: (i: number) => void }) {
  const owners = useMemo(() => mapOwners(cur, loc), [cur, loc]);
  const { headline, insights } = useMemo(() => localInsights(cur, prev, loc), [cur, prev, loc]);
  const firsts = owners.find((o) => o.you)?.first ?? 0;
  const fixes = (cur.listing ?? []).filter((c) => c.status !== "pass").length;
  const centre = Math.floor((GRID * GRID) / 2);
  const at = pt ?? centre;
  return (
    <>
      <StatStrip
        spark={done.length > 1 ? done.map((d) => -(d.result?.avg ?? 21)).reverse() : undefined}
        stats={[
          { label: "Average rank", value: cur.avg === null ? "–" : String(cur.avg), delta: cur.avg !== null && prev?.avg != null ? <Delta now={cur.avg} before={prev.avg} lowerIsBetter /> : null },
          { label: "Top 3 on the map", value: `${cur.read ? Math.round((cur.top3 / cur.read) * 100) : 0}%`, sub: `${cur.top3} of ${cur.read} points` },
          { label: "In the top 20", value: `${cur.found} of ${cur.read}`, sub: cur.read < GRID * GRID ? `${GRID * GRID - cur.read} points didn't load` : undefined },
          { label: "#1 spots", value: String(firsts), tone: firsts ? "pos" : undefined },
        ]}
      />
      <div className="grid gap-4 xl:grid-cols-2">
        <Card title={`“${cur.keyword}”, ${cur.spacing} mi between points`} action={<span className="text-[12px] text-muted">{when(done[0].created_at)}</span>}>
          <div className="flex flex-col gap-3 px-4 pb-4">
            <Heat scan={cur} sel={at} onSel={onPt} />
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12px] text-body">
              {TONES.map((t) => (
                <span key={t.label} className="flex items-center gap-1.5">
                  <i className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: t.dot, border: t.ring ? `1.5px solid ${t.ring}` : undefined }} />
                  {t.label}
                </span>
              ))}
            </div>
          </div>
        </Card>
        <div className="flex min-w-0 flex-col gap-4">
          <Card title="What this scan says">
            <div className="flex flex-col gap-3 px-5 pb-5">
              <p className="text-[15px] leading-snug font-semibold text-ink wrap-break-word">{headline}</p>
              <ul className="flex flex-col gap-2">
                {insights.map((x) => (
                  <li key={x.text} className="flex items-start gap-2.5 text-[13px] leading-snug text-body">
                    <i className="mt-[5px] inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: INSIGHT[x.tone] }} />
                    <span className="min-w-0 wrap-break-word">{x.text}</span>
                  </li>
                ))}
                {fixes ? (
                  <li className="flex items-start gap-2.5 text-[13px] leading-snug text-body">
                    <i className="mt-[5px] inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: INSIGHT.bad }} />
                    <span>
                      {fixes} {fixes === 1 ? "thing" : "things"} on your website disagree with your Google listing. See the listing check.
                    </span>
                  </li>
                ) : null}
              </ul>
            </div>
          </Card>
          <Card title={at === centre ? "Map pack at the business" : `Map pack ${placeText(at, cur.spacing)}`}>
            <PackAt scan={cur} i={at} you={loc} />
          </Card>
        </div>
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <Card title="Who holds the map" action={<span className="text-[12px] text-muted">Top 3 points of {cur.read}</span>}>
          <Owners owners={owners} read={cur.read} />
        </Card>
        {cur.listing ? (
          <Card title="Listing check" action={<span className={`aw-status ${fixes ? "aw-status--warn" : "aw-status--ranked"}`}>{fixes ? `${fixes} to fix` : "All good"}</span>}>
            <ul className="flex flex-col px-5 pb-4">
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
          </Card>
        ) : null}
      </div>
      <Card title="Reviews against the map's leaders">
        <Reviews done={done} owners={owners} />
      </Card>
    </>
  );
}

// Map colours: the usual traffic light, bright enough to read as a heat map.
const MAP = { top3: "#1F9D55", top10: "#F2A20C", top20: "#E8590C" };
const INSIGHT = { good: MAP.top3, warn: MAP.top10, bad: "var(--aw-neg)", info: "var(--signal)" } as const;
const TONES = [
  { label: "Top 3", dot: MAP.top3 },
  { label: "4 to 10", dot: MAP.top10 },
  { label: "11 to 20", dot: MAP.top20 },
  { label: "Not in the top 20", dot: "var(--aw-surface)", ring: "var(--aw-muted)" },
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
function Heat({ scan, sel, onSel }: { scan: ScanResult; sel: number; onSel: (i: number) => void }) {
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
          {scan.points.map((p) => (
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
      {scan.points.map((p) => {
        const [x, y] = c(p.i);
        const t = tone(p.rank, p.error);
        const open = p.rank === null;
        return (
          <g key={p.i} className="cursor-pointer" onClick={() => onSel(p.i)} role="button" tabIndex={0} aria-label={`${placeText(p.i, scan.spacing)}: ${p.error ? "no answer" : p.rank === null ? "not in the top 20" : `rank ${p.rank}`}`} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onSel(p.i)}>
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

/** The businesses that hold the top 3 most, the business among them, with #1 spots, rating and reviews. */
function Owners({ owners, read }: { owners: MapOwner[]; read: number }) {
  const max = Math.max(1, ...owners.map((o) => o.top3));
  return (
    <ol className="flex flex-col px-3 pb-3">
      {owners.map((o, k) => (
        <li key={`${o.title}${k}`} className={`grid grid-cols-[24px_minmax(0,1fr)_minmax(80px,160px)_56px] items-center gap-3 rounded-[10px] px-2 py-2.5 ${o.you ? "bg-[var(--signal-soft)]" : ""}`}>
          <span className="aw-num text-[12px] text-muted">{k + 1}</span>
          <span className="flex min-w-0 flex-col">
            <span className={`text-[13.5px] wrap-break-word ${o.you ? "font-semibold text-[var(--signal-ink)]" : "font-medium text-ink"}`}>{o.you ? `${o.title} (you)` : o.title}</span>
            <span className="text-[12px] text-muted wrap-break-word">
              {[o.rating !== null ? `★ ${o.rating}` : null, o.reviews !== null ? `${o.reviews.toLocaleString("en-US")} reviews` : null, o.first ? `#1 at ${o.first}` : null, o.category].filter(Boolean).join(", ") || "No rating"}
            </span>
          </span>
          <span className="block h-2 rounded-full bg-[var(--aw-surface-2)]">
            <span className="block h-full rounded-full" style={{ width: `${Math.max(o.top3 ? 3 : 0, (o.top3 / max) * 100)}%`, background: o.you ? "var(--signal)" : "var(--aw-ink)" }} />
          </span>
          <span className="aw-num text-right text-[13px] font-medium text-ink">{read ? Math.round((o.top3 / read) * 100) : 0}%</span>
        </li>
      ))}
    </ol>
  );
}

/** Reviews and rating next to the map's leaders now, and review counts over time once there are two scans. */
function Reviews({ done, owners }: { done: Scan[]; owners: MapOwner[] }) {
  const you = owners.find((o) => o.you)!;
  const leaders = owners.filter((o) => !o.you).slice(0, 3);
  const rows = [you, ...leaders];
  const max = Math.max(1, ...rows.map((r) => r.reviews ?? 0));
  const names = leaders.slice(0, 2).map((r) => r.title);
  const h = reviewHistory(done.map((s) => ({ at: s.created_at, you: s.result!.you, rivals: s.result!.rivals })), names);
  const series = [{ name: you.title, color: "var(--signal)", vals: h.map((x) => x.you) }, ...names.map((n, k) => ({ name: n, color: k ? "var(--aw-faint)" : "var(--aw-ink)", vals: h.map((x) => x.rivals[n]) }))];
  return (
    <div className="grid gap-6 px-5 pb-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
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
      {h.length >= 2 ? <ReviewLines h={h} series={series} /> : <p className="self-center text-[13px] text-muted">The trend shows after the next scan.</p>}
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
