"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { businesses, GRID, gridOf, headToHead, isBusiness, keywordSuggestions, keywordTable, localInsights, mapOwners, placeKey, placeText, rankBands, rankMoves, reviewHistory, scanTasks, scheduleOf, SCHEDULES, SIZES, SPACINGS, type Business, type Duel, type KeywordRun, type ListingCheck, type Location, type MapOwner, type Move, type Place, type ScanResult } from "@/lib/local";
import { LocalMap, rankDot, type MapDot } from "./LocalMap";
import { ProfileTab } from "./local/ProfileTab";
import { ReviewsTab } from "./local/ReviewsTab";
import { AiTab } from "./local/AiTab";
import { AlertsTab } from "./local/AlertsTab";
import { saveCsv } from "./local/saveCsv";
import { askConfirm, askText } from "./Dialogs";
import { profileGaps, type Profile } from "@/lib/localProfile";
import { putStash } from "@/lib/stash";
import type { RunAuth } from "@/lib/runner";
import { Dropdown, Pop, useAnchoredPop } from "./Pickers";
import { BAR_INPUT } from "./research/shared";
import { SearchBar, SearchButton } from "./SearchBar";
import { Card, Delta, Seg, SidePanel, Thinking } from "./ui";
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

type Tab = "rankings" | "ai" | "profile" | "reviews" | "alerts";
const TABS: { id: Tab; label: string }[] = [
  { id: "rankings", label: "Rankings" },
  { id: "ai", label: "AI answers" },
  { id: "profile", label: "Profile" },
  { id: "reviews", label: "Reviews" },
  { id: "alerts", label: "Alerts" },
];
/** The tab an alert email links to (?tab=reviews), or Rankings. */
const tabFromUrl = (): Tab => {
  const t = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("tab") : null;
  return TABS.find((x) => x.id === t)?.id ?? "rankings";
};

export function LocalResearchPage({ brand, sb, auth, canEdit }: { brand: Brand; sb: SupabaseClient; auth: RunAuth; canEdit: boolean }) {
  const api = useApi(auth);
  const [locs, setLocs] = useState<SavedLoc[] | undefined>(undefined);
  const [sel, setSel] = useState("");
  const [adding, setAdding] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const [tab, setTab] = useState<Tab>(() => tabFromUrl());
  const [limits, setLimits] = useState<Limits | null>(null);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState("");
  // Scan now sits in the header; the Rankings tab says what it does (the open keyword) and whether it's running.
  const scanRef = useRef<(() => void) | null>(null);
  const [scanState, setScanState] = useState<{ label: string; disabled: boolean } | null>(null);
  const locMenu = useAnchoredPop();
  const moreMenu = useAnchoredPop();
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
        // An alert email links straight to its location (?location=...).
        const asked = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("location") : null;
        setSel(asked && list.some((l) => l.id === asked) ? asked : list.length > 1 ? "all" : (list[0]?.id ?? ""));
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
  const facts = useFacts(sb, loc?.id ?? null);
  // Download PDF and Share in the top bar use the open location.
  useEffect(() => {
    putStash(`local:${brand.id}:loc`, loc?.id ?? null);
  }, [brand.id, loc?.id]);
  const save = async (extra: Record<string, unknown>) => {
    if (!loc) return;
    const r = await run("settings", () => call<{ location: SavedLoc }>("settings", { locationId: loc.id, ...extra }));
    if (r) put(r.location);
  };
  const canAdd = canEdit && (locs?.length ?? 0) < (limits?.locations ?? 1);
  const finding = locs !== undefined && (locs.length === 0 || adding || replacing);
  const pick = (id: string) => {
    locMenu.close();
    setSel(id);
  };

  async function removeLoc() {
    moreMenu.close();
    if (!loc || !(await askConfirm({ title: `Remove ${loc.name || loc.title}?`, text: "Its scans, profile reads, reviews and alerts are deleted.", action: "Remove" }))) return;
    const r = await run("remove", () => call<{ removed: string }>("remove", { locationId: loc.id }));
    if (!r) return;
    const rest = (locs ?? []).filter((x) => x.id !== loc.id);
    setLocs(rest);
    setSel(rest.length > 1 ? "all" : (rest[0]?.id ?? ""));
  }
  async function rename() {
    moreMenu.close();
    if (!loc) return;
    const name = await askText({ title: "Rename location", value: loc.name || loc.city || "", action: "Rename" });
    if (name) await save({ name });
  }
  async function trackAi() {
    moreMenu.close();
    if (!loc) return;
    const r = await run("prompts", () => call<{ added: string[] }>("prompts", { locationId: loc.id }));
    if (r) setNote(`Tracking ${r.added.length} local prompts in AI Visibility, under the topic Local.`);
  }

  const locButton =
    locs && locs.length && !finding ? (
      <button type="button" className="aw-ctl" aria-expanded={Boolean(locMenu.anchor)} onClick={(e) => locMenu.toggle(e.currentTarget)}>
        <span className="font-medium text-ink">{sel === "all" || !loc ? "All locations" : loc.name || loc.city || "Location"}</span>
        {locs.length > 1 && loc ? <span className="text-muted">{locs.indexOf(loc) + 1} of {locs.length}</span> : null}
        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" className="text-faint">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
    ) : null;

  return (
    <div className="flex flex-col gap-5">
      {loc && !finding && sel !== "all" ? (
        <div className="flex flex-wrap items-start gap-4">
          <div className="flex min-w-0 flex-1 basis-[420px] items-center gap-3.5">
            <span aria-hidden="true" className="grid h-12 w-12 shrink-0 place-items-center rounded-[14px] bg-[var(--signal-soft)] text-[17px] font-bold text-[var(--signal)]">
              {initials(loc.title)}
            </span>
            <div className="flex min-w-0 flex-col gap-1">
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="aw-h2 mb-0! wrap-break-word">{loc.title}</h1>
                {locButton}
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13.5px] text-muted">
                {loc.address ? <span className="wrap-break-word">{loc.address}</span> : null}
                {facts.rating !== null ? (
                  <span className="text-body">
                    ★ {facts.rating}
                    {facts.reviews !== null ? <span className="text-muted"> ({facts.reviews.toLocaleString("en-US")} reviews)</span> : null}
                  </span>
                ) : null}
                {facts.category ?? loc.category ? <span>{facts.category ?? loc.category}</span> : null}
              </div>
            </div>
          </div>
          {canEdit ? (
            <div className="flex items-center gap-2">
              {tab === "rankings" && scanState ? (
                <button type="button" className="aw-btn aw-btn--primary" disabled={scanState.disabled} onClick={() => scanRef.current?.()}>
                  {scanState.label}
                </button>
              ) : null}
              <button type="button" className="aw-iconbtn" aria-label="More actions for this location" title="More" aria-expanded={Boolean(moreMenu.anchor)} onClick={(e) => moreMenu.toggle(e.currentTarget)}>
                <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
                  <circle cx="5" cy="12" r="1.8" />
                  <circle cx="12" cy="12" r="1.8" />
                  <circle cx="19" cy="12" r="1.8" />
                </svg>
              </button>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="aw-h2 mb-0!">Local Research</h1>
          {locs && locs.length > 1 ? locButton : null}
        </div>
      )}

      {locMenu.anchor && locs ? (
        <Pop anchor={locMenu.anchor} onClose={locMenu.close} width={300} label="Locations">
          <div className="flex flex-col px-1">
            {locs.length > 1 ? (
              <button type="button" onClick={() => pick("all")} className={`flex w-full items-center rounded-aw px-2 py-2 text-left text-[13px] hover:bg-surface-2 ${sel === "all" ? "font-medium text-ink" : "text-body"}`}>
                All locations
              </button>
            ) : null}
            {locs.map((l) => (
              <button key={l.id} type="button" aria-current={sel === l.id} onClick={() => pick(l.id)} className={`flex w-full items-start justify-between gap-3 rounded-aw px-2 py-2 text-left text-[13px] hover:bg-surface-2 ${sel === l.id ? "bg-[var(--signal-soft)] font-medium text-ink" : "text-body"}`}>
                <span className="min-w-0 wrap-break-word">{l.name || l.city || l.title}</span>
                <span className="min-w-0 text-right text-[12px] font-normal text-muted wrap-break-word">{street(l.address) ?? ""}</span>
              </button>
            ))}
            {canEdit ? (
              <div className="mt-1 border-t border-rule-faint pt-1">
                {canAdd ? (
                  <button type="button" onClick={() => { locMenu.close(); setAdding(true); }} className="flex w-full items-center rounded-aw px-2 py-2 text-left text-[13px] font-medium text-[var(--signal)] hover:bg-surface-2">
                    + Add location
                  </button>
                ) : limits ? (
                  <span className="block px-2 py-2 text-[12px] text-muted">{limits.locations} of {limits.locations} locations on your plan</span>
                ) : null}
              </div>
            ) : null}
          </div>
        </Pop>
      ) : null}
      {moreMenu.anchor && loc ? (
        <Pop anchor={moreMenu.anchor} onClose={moreMenu.close} width={260} label="Location actions">
          <div className="flex flex-col px-1">
            <button type="button" onClick={() => { moreMenu.close(); setReplacing(true); }} className="flex w-full rounded-aw px-2 py-2 text-left text-[13px] text-ink hover:bg-surface-2">
              Change business
            </button>
            <button type="button" onClick={rename} className="flex w-full rounded-aw px-2 py-2 text-left text-[13px] text-ink hover:bg-surface-2">
              Rename location
            </button>
            {loc.city ? (
              <button type="button" onClick={trackAi} disabled={busy === "prompts"} className="flex w-full rounded-aw px-2 py-2 text-left text-[13px] text-ink hover:bg-surface-2">
                Track these keywords in AI answers
              </button>
            ) : null}
            <div className="mt-1 border-t border-rule-faint pt-1">
              <button type="button" onClick={removeLoc} disabled={busy === "remove"} className="flex w-full rounded-aw px-2 py-2 text-left text-[13px] text-neg hover:bg-surface-2">
                Remove location
              </button>
            </div>
          </div>
        </Pop>
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
        <>
          <div role="tablist" aria-label="Location view" className="aw-tabs flex flex-wrap">
            {TABS.map((t) => {
              const n = t.id === "profile" ? facts.gaps : t.id === "reviews" ? facts.toAnswer : t.id === "alerts" ? facts.alerts : 0;
              const label = t.id === "profile" ? `${n} ${n === 1 ? "gap" : "gaps"}` : t.id === "reviews" ? `${n} to answer` : String(n);
              const tone = t.id === "alerts" ? "bg-[var(--aw-neg-bg)] text-neg" : t.id === "profile" ? "bg-[var(--aw-warn-bg)] text-warn" : "bg-[var(--aw-surface-2)] text-body";
              return (
                <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}>
                  {t.label}
                  {n ? <span className={`ml-1.5 rounded-[6px] px-1.5 py-px text-[11.5px] font-semibold ${tone}`}>{label}</span> : null}
                </button>
              );
            })}
          </div>
          {tab === "alerts" ? (
            <AlertsTab key={loc.id} sb={sb} loc={loc} canEdit={canEdit} onSave={(alerts) => save({ alerts })} onError={setError} />
          ) : tab === "profile" ? (
            <ProfileTab key={loc.id} sb={sb} locationId={loc.id} canEdit={canEdit} call={call} onError={setError} />
          ) : tab === "ai" ? (
            <AiTab key={loc.id} sb={sb} loc={loc} canEdit={canEdit} call={call} onError={setError} />
          ) : tab === "reviews" ? (
            <ReviewsTab key={loc.id} sb={sb} locationId={loc.id} placeId={loc.placeId} keywords={loc.keywords} city={loc.city ?? null} canEdit={canEdit} call={call} onError={setError} />
          ) : (
            <Scans key={loc.id} brand={brand} loc={loc} sb={sb} canEdit={canEdit} busy={busy} call={call} run={run} save={save} onNote={setNote} maxKeywords={limits?.keywords ?? 5} scanRef={scanRef} onScanState={setScanState} />
          )}
        </>
      ) : null}
    </div>
  );
}

/** A grid's points before any scan: small plain dots, so the preview shows where the grid falls. */
const blankDots = (size: number): MapDot[] => Array.from({ length: size * size }, () => ({ label: "", bg: "var(--signal)", fg: "#fff", border: "#fff", aria: "Grid point" }));

/** The two letters on the business's tile. */
const initials = (title: string) =>
  title
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("") || "?";
/** The street part of an address, to tell two places with the same name apart. */
const street = (address: string | null | undefined) => (address ? address.split(",")[0]!.trim() : null);

/** The header's rating and category, and the counts on the tabs: profile gaps, reviews to answer, open alerts. */
function useFacts(sb: SupabaseClient, locationId: string | null) {
  const empty = { rating: null as number | null, reviews: null as number | null, category: null as string | null, gaps: 0, toAnswer: 0, alerts: 0 };
  const [facts, setFacts] = useState<{ id: string | null; v: typeof empty }>({ id: null, v: empty });
  useEffect(() => {
    if (!locationId) return;
    let live = true;
    (async () => {
      const month = new Date(Date.now() - 30 * 864e5).toISOString();
      const year = new Date(Date.now() - 365 * 864e5).toISOString();
      const [a, r, p] = await Promise.all([
        sb.from("local_alerts").select("id", { count: "exact", head: true }).eq("location_id", locationId).eq("status", "open").gte("created_at", month),
        sb.from("local_reviews").select("id", { count: "exact", head: true }).eq("location_id", locationId).eq("you", true).is("reply", null).is("removed_at", null).gte("posted_at", year),
        sb.from("local_profiles").select("you, confirm, read_at, data").eq("location_id", locationId).order("read_at", { ascending: false }).limit(12),
      ]);
      const rows = ((p.data ?? []) as { you: boolean; confirm: boolean; read_at: string; data: Profile }[]);
      const yours = rows.filter((x) => x.you);
      const full = yours.find((x) => !x.confirm) ?? yours[0];
      const rivals = full ? rows.filter((x) => !x.you && x.read_at === full.read_at).map((x) => x.data) : [];
      const me = yours[0]?.data ?? null;
      if (!live) return;
      setFacts({
        id: locationId,
        v: {
          rating: me?.rating ?? null,
          reviews: me?.reviews ?? null,
          category: me?.category ?? null,
          gaps: me && rivals.length ? profileGaps(me, rivals, Date.parse(yours[0].read_at)).length : 0,
          toAnswer: r.error ? 0 : (r.count ?? 0),
          alerts: a.error ? 0 : (a.count ?? 0),
        },
      });
    })().catch(() => undefined);
    return () => {
      live = false;
    };
  }, [sb, locationId]);
  return facts.id === locationId ? facts.v : empty;
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

function Scans({ brand, loc, sb, canEdit, busy, call, run, save, onNote, maxKeywords, scanRef, onScanState }: { brand: Brand; loc: SavedLoc; sb: SupabaseClient; canEdit: boolean; busy: string; call: Call; run: <T>(k: string, fn: () => Promise<T>) => Promise<T | null>; save: (x: Record<string, unknown>) => Promise<void>; onNote: (s: string) => void; maxKeywords: number; scanRef: React.MutableRefObject<(() => void) | null>; onScanState: (s: { label: string; disabled: boolean } | null) => void }) {
  const [kw, setKw] = useState(loc.keywords[0] ?? "");
  const [scans, setScans] = useState<Scan[] | null>(null);
  const [pt, setPt] = useState<number | null>(null);
  const [newKw, setNewKw] = useState("");
  const [picking, setPicking] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [name, setName] = useState(loc.name ?? "");
  const addMenu = useAnchoredPop();
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

  // The header's Scan now scans the open keyword.
  const scanNow = useCallback(async () => {
    if (kw && (await run("scan", () => call("scan", { locationId: loc.id, keyword: kw })))) load();
  }, [kw, run, call, loc.id, load]);
  useEffect(() => {
    scanRef.current = scanNow;
    return () => {
      scanRef.current = null;
    };
  }, [scanRef, scanNow]);
  const scanLabel = running ? "Scanning" : busy === "scan" ? "Starting" : "Scan now";
  const scanBlocked = !kw || Boolean(running) || busy === "scan";
  useEffect(() => {
    onScanState(kw ? { label: scanLabel, disabled: scanBlocked } : null);
  }, [kw, scanLabel, scanBlocked, onScanState]);
  useEffect(() => () => onScanState(null), [onScanState]);

  const done = (scans ?? []).filter((s) => s.status === "done" && s.result);
  const cur = done[0]?.result ?? null;
  // Earlier scans drawn on the same grid can be compared with the latest one, point by point.
  const same = (r: ScanResult | null) => Boolean(cur && r && r.size === cur.size && (r.shape ?? "square") === (cur.shape ?? "square") && r.spacing === cur.spacing && (r.center?.lat ?? null) === (cur.center?.lat ?? null) && (r.center?.lng ?? null) === (cur.center?.lng ?? null));
  const comparable = done.slice(1).filter((d) => same(d.result));
  const [compareId, setCompareId] = useState<string | null>(null);
  const prevScan = comparable.find((d) => d.id === compareId) ?? comparable[0] ?? null;
  const curId = done[0]?.id ?? null;
  const raw = useRaw(sb, curId);
  const prevRaw = useRaw(sb, prevScan?.id ?? null);
  const prev = prevScan?.result ?? null;
  // Every keyword's numbers from each finished scan: the keyword chips and the history chart.
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
  const suggestions = keywordSuggestions(loc, cur?.rivals ?? []);
  const room = Math.max(0, maxKeywords - loc.keywords.length);
  const chips = keywordTable(history, loc.keywords);
  const pickKw = (k: string) => {
    setKw(k);
    setPt(null);
  };
  const addKeyword = async (k: string) => {
    addMenu.close();
    await save({ keywords: [...loc.keywords, k] });
    pickKw(k);
  };
  const replaceKeyword = async (from: string, to: string) => {
    await save({ keywords: loc.keywords.map((x) => (x === from ? to : x)) });
    pickKw(to);
  };
  const pickCenter = async (p: { lat: number; lng: number }) => {
    setPicking(false);
    await save({ center: p });
    onNote("The grid's centre moved. The next scan uses it.");
  };
  // Results from a grid that isn't the one in the settings now say so, so the point counts never seem to disagree.
  const gridMoved =
    cur && (cur.size !== g.size || (cur.shape ?? "square") !== g.shape || cur.spacing !== g.spacing || Math.abs((cur.center?.lat ?? loc.lat) - g.center.lat) > 1e-6 || Math.abs((cur.center?.lng ?? loc.lng) - g.center.lng) > 1e-6);
  const schedule = SCHEDULES.find((x) => x.id === scheduleOf(loc));
  const span = Math.round(loc.spacing * (g.size - 1) * 100) / 100;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label="Keywords" className="flex flex-wrap items-center gap-2">
          {chips.map((r) => {
            const on = r.keyword === kw;
            const avg = r.last?.avg ?? null;
            const none = Boolean(r.last && r.last.read && !r.last.found);
            return (
              <button key={r.keyword} type="button" aria-pressed={on} onClick={() => pickKw(r.keyword)} className={`inline-flex h-9 items-center gap-2 rounded-full border pr-1.5 pl-3.5 text-[13px] font-medium ${on ? "border-[var(--aw-ink)] bg-[var(--aw-ink)] text-white" : "border-[var(--aw-rule)] bg-[var(--aw-surface)] text-ink hover:bg-[var(--aw-surface-2)]"}`}>
                <span className="wrap-break-word">{r.keyword}</span>
                {r.change !== null && r.change !== 0 ? <span className={`text-[12px] font-semibold ${r.change < 0 ? (on ? "text-[#86EFAC]" : "text-pos") : on ? "text-[#FCA5A5]" : "text-neg"}`}>{r.change < 0 ? `↑${-r.change}` : `↓${r.change}`}</span> : null}
                <span className={`aw-num rounded-full px-2 py-0.5 text-[12px] font-semibold ${none ? "bg-[var(--aw-warn-bg)] text-warn" : on ? "bg-white/15 text-white" : "bg-[var(--aw-surface-2)] text-body"}`}>{none ? "not ranked" : avg === null ? "no scan" : `#${avg}`}</span>
              </button>
            );
          })}
          {canEdit ? (
            <button type="button" aria-expanded={Boolean(addMenu.anchor)} onClick={(e) => addMenu.toggle(e.currentTarget)} className="inline-flex h-9 items-center rounded-full border border-dashed border-[var(--aw-rule-strong,#D5D8E0)] px-3.5 text-[13px] font-medium text-[var(--signal)]">
              + Keyword
            </button>
          ) : null}
        </div>
        <span className="flex-1" />
        {canEdit ? (
          <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm" onClick={() => setSheet(true)}>
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
              <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
              <circle cx="16" cy="7" r="2" />
              <circle cx="10" cy="17" r="2" />
            </svg>
            Grid {g.size} × {g.size}, {loc.spacing} mi, {schedule?.id === "off" ? "not scheduled" : (schedule?.label ?? "weekly").toLowerCase()}
          </button>
        ) : (
          <span className="text-[12.5px] text-muted">
            Grid {g.size} × {g.size}, {loc.spacing} mi apart
          </span>
        )}
      </div>

      {addMenu.anchor ? (
        <Pop anchor={addMenu.anchor} onClose={addMenu.close} width={380} label="Keywords">
          <div className="flex flex-col gap-3 px-2 py-1">
            {room ? (
              <form
                className="flex items-center gap-2"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const k = newKw.trim().toLowerCase();
                  if (!k || loc.keywords.includes(k)) return;
                  setNewKw("");
                  await addKeyword(k);
                }}
              >
                <input className="aw-input min-w-0 flex-1" value={newKw} onChange={(e) => setNewKw(e.target.value)} placeholder={suggestions[0] ?? "keyword"} aria-label="Add a keyword" />
                <button type="submit" className="aw-btn aw-btn--primary aw-btn--sm" disabled={!newKw.trim()}>
                  Add
                </button>
              </form>
            ) : null}
            {room && suggestions.length ? (
              <div className="flex flex-col gap-1.5">
                <span className="text-[12px] text-muted">Suggested</span>
                <div className="flex flex-wrap gap-1.5">
                  {suggestions.slice(0, 6).map((k) => (
                    <button key={k} type="button" className="aw-chip aw-chip--btn" onClick={() => addKeyword(k)} disabled={busy === "settings"}>
                      + {k}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            <div className="flex flex-col gap-1 border-t border-rule-faint pt-2">
              <span className="text-[12px] text-muted">
                {loc.keywords.length} of {maxKeywords} keywords on your plan
              </span>
              {loc.keywords.map((k) => (
                <div key={k} className="flex items-center gap-2 text-[13px]">
                  <span className="min-w-0 flex-1 text-ink wrap-break-word">{k}</span>
                  <button
                    type="button"
                    className="aw-text-link text-[12.5px] text-muted!"
                    onClick={async () => {
                      if (!(await askConfirm({ title: `Stop tracking “${k}”?`, text: "Its past scans stay in the history.", action: "Stop tracking" }))) return;
                      await save({ keywords: loc.keywords.filter((x) => x !== k) });
                      if (k === kw) pickKw(loc.keywords.find((x) => x !== k) ?? "");
                    }}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </div>
        </Pop>
      ) : null}

      {cur && gridMoved && canEdit ? (
        <div className="flex flex-wrap items-center gap-3 rounded-[10px] bg-[var(--signal-soft)] px-3.5 py-2.5 text-[13px] text-[var(--signal-ink,var(--signal))]">
          <span className="min-w-0 flex-1 wrap-break-word">
            These results are from a {cur.size ?? GRID} × {cur.size ?? GRID} grid, {cur.spacing} mi apart. The next scan uses your new {g.size} × {g.size} grid ({g.points.length} points).
          </span>
          <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm" disabled={scanBlocked} onClick={scanNow}>
            Scan now on the new grid
          </button>
        </div>
      ) : null}

      {running ? <Thinking text={running.step || "Scanning"} /> : failed ? <p className="aw-error">The last scan failed: {failed.error}</p> : null}
      {kw && scans && !done.length && !running && !failed ? <p className="aw-small">No scan for “{kw}” yet.</p> : null}
      {!kw ? <p className="aw-small">Add a keyword to scan.</p> : null}

      {cur ? (
        <Results
          cur={cur}
          prev={prev}
          prevAt={prevScan?.created_at ?? null}
          compare={comparable.map((d) => ({ id: d.id, at: d.created_at }))}
          compareId={prevScan?.id ?? null}
          onCompare={setCompareId}
          done={done}
          loc={loc}
          domain={brand.domain}
          raw={raw}
          prevRaw={prevRaw}
          history={history}
          keyword={kw}
          pt={pt}
          onPt={setPt}
          replaceWith={canEdit ? (suggestions.find((s) => !loc.keywords.includes(s)) ?? null) : null}
          onReplace={(to) => replaceKeyword(kw, to)}
        />
      ) : scans && !done.length && kw ? (
        <Card title={`The grid, ${g.points.length} points`}>
          <div className="p-3">
            <LocalMap lat={g.center.lat} lng={g.center.lng} spacing={g.spacing} size={g.size} shape={g.shape} pin={{ lat: loc.lat, lng: loc.lng }} dots={blankDots(g.size)} sel={-1} onSel={() => undefined} onFail={() => undefined} />
          </div>
        </Card>
      ) : null}

      {sheet ? (
        <SidePanel narrow title="Grid settings" onClose={() => { setSheet(false); setPicking(false); }}>
          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <LocalMap lat={g.center.lat} lng={g.center.lng} spacing={g.spacing} size={g.size} shape={g.shape} pin={{ lat: loc.lat, lng: loc.lng }} dots={blankDots(g.size)} sel={-1} onSel={() => undefined} onFail={() => undefined} onPick={picking ? pickCenter : undefined} />
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" className={`aw-btn aw-btn--sm ${picking ? "aw-btn--primary" : "aw-btn--secondary"}`} aria-pressed={picking} onClick={() => setPicking(!picking)}>
                  {picking ? "Click the map" : "Move centre"}
                </button>
                {loc.center ? (
                  <button type="button" className="aw-btn aw-btn--ghost aw-btn--sm" onClick={() => save({ center: null })}>
                    Centre on the business
                  </button>
                ) : null}
              </div>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-[18px] font-semibold text-ink">{g.points.length} points</span>
              <span className="text-[13px] text-muted">
                {span} × {span} mi, {scanTasks(g.points.length, false)} tasks a scheduled scan, {scanTasks(g.points.length, true)} for Scan now
              </span>
            </div>
            <div className="flex flex-col gap-2">
              <span className="text-[13px] font-semibold text-ink">Size</span>
              <Seg label="Grid size" value={String(g.size)} onChange={(v) => save({ size: Number(v) })} options={SIZES.map((n) => ({ id: String(n), label: `${n} × ${n}` }))} />
            </div>
            <div className="flex flex-col gap-2">
              <span className="text-[13px] font-semibold text-ink">Shape</span>
              <Seg label="Grid shape" value={g.shape} onChange={(v) => save({ shape: v })} options={[{ id: "square", label: "Square" }, { id: "circle", label: "Round, for service areas" }]} />
            </div>
            <div className="flex flex-col gap-2">
              <span className="text-[13px] font-semibold text-ink">Distance between points</span>
              <Seg label="Distance between points" value={String(loc.spacing)} onChange={(v) => save({ spacing: Number(v) })} options={SPACINGS.map((n) => ({ id: String(n), label: `${n} mi` }))} />
            </div>
            <div className="flex flex-col gap-2">
              <span className="text-[13px] font-semibold text-ink">Scan every</span>
              <Seg label="Schedule" value={scheduleOf(loc)} onChange={(v) => save({ schedule: v })} options={SCHEDULES.map((x) => ({ id: x.id, label: x.id === "off" ? "Not scheduled" : x.label }))} />
            </div>
            <form
              className="flex flex-col gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (name.trim() && name.trim() !== loc.name) save({ name: name.trim() });
              }}
            >
              <label htmlFor="local-name" className="text-[13px] font-semibold text-ink">
                Location name
              </label>
              <input id="local-name" className="aw-input" value={name} onChange={(e) => setName(e.target.value)} onBlur={() => name.trim() && name.trim() !== loc.name && save({ name: name.trim() })} />
            </form>
          </div>
        </SidePanel>
      ) : null}
    </div>
  );
}

type Sort = "rank" | "reviews" | "rating";

type Mode = "ranks" | "change" | "duel";

function Results({ cur, prev, prevAt, compare, compareId, onCompare, done, loc, domain, raw, prevRaw, history, keyword, pt, onPt, replaceWith, onReplace }: { cur: ScanResult & { listing?: ListingCheck[] }; prev: ScanResult | null; prevAt: string | null; compare: { id: string; at: string }[]; compareId: string | null; onCompare: (id: string) => void; done: Scan[]; loc: Location; domain: string; raw: Record<string, Place[] | null> | null; prevRaw: Record<string, Place[] | null> | null; history: KeywordRun[]; keyword: string; pt: number | null; onPt: (i: number | null) => void; replaceWith: string | null; onReplace: (to: string) => void }) {
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
  const prevAvg = picked.you ? (prev?.avg ?? null) : null;
  const misfit = cur.read > 0 && cur.found === 0;
  const shown = [...list].sort((a, b) => (sort === "reviews" ? (b.reviews ?? -1) - (a.reviews ?? -1) : sort === "rating" ? (b.rating ?? -1) - (a.rating ?? -1) : (a.avg ?? 99) - (b.avg ?? 99))).slice(0, 20);
  // Share of the map pack: the four businesses holding the most top 3 spots, you always among them, then everyone else.
  const share = [...list.filter((b) => !b.you).sort((a, b) => b.voice - a.voice).slice(0, 4), you].sort((a, b) => b.voice - a.voice);
  const rest = Math.max(0, 1 - share.reduce((a, b) => a + b.voice, 0));
  const passed = (cur.listing ?? []).filter((c) => c.status === "pass").length;
  const checks = (cur.listing ?? []).length;
  const compareWith = (key: string) => {
    setPick(key);
    setMode(key === "__you" ? "ranks" : "duel");
  };

  return (
    <>
      {misfit ? (
        <div className="flex flex-wrap items-start gap-3.5 rounded-[12px] border border-[#F3DDB5] bg-[var(--aw-warn-bg)] px-4 py-3.5">
          <div className="flex min-w-0 flex-1 basis-[420px] flex-col gap-1">
            <span className="font-semibold text-ink">You aren&apos;t in the top 20 anywhere for “{keyword}”.</span>
            <span className="text-[13.5px] text-body">A search for another business&apos;s name, or for something you don&apos;t offer, can&apos;t move. Track what your customers search instead.</span>
          </div>
          {replaceWith ? (
            <button type="button" className="aw-btn aw-btn--primary aw-btn--sm" onClick={() => onReplace(replaceWith)}>
              Replace with “{replaceWith}”
            </button>
          ) : null}
        </div>
      ) : (
        <section className="aw-frame flex flex-wrap items-center gap-4 px-5 py-4">
          <div className="flex min-w-0 flex-1 basis-[420px] flex-col gap-1.5">
            <span className="text-[15px] leading-snug font-semibold text-ink wrap-break-word">{headline}</span>
            <ul className="flex flex-wrap gap-x-5 gap-y-1">
              {insights.slice(0, 2).map((x) => (
                <li key={x.text} className="flex items-start gap-2 text-[13px] leading-snug text-body">
                  <i className="mt-[5px] inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: INSIGHT[x.tone] }} />
                  <span className="min-w-0 wrap-break-word">{x.text}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="w-full sm:w-auto sm:max-w-[420px]">
            <Sides ranks={you.ranks} size={size} />
          </div>
        </section>
      )}

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(300px,1fr)]">
        <Card>
          <div className="relative flex flex-col gap-3 p-4">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <h2 className="text-[15px] font-semibold text-ink wrap-break-word">“{cur.keyword}” on Google Maps</h2>
              <span className="text-[12.5px] text-muted">
                {when(done[0].created_at)}, {inGrid.size} points {cur.spacing} mi apart
              </span>
              <span className="flex-1" />
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
            </div>
            {!picked.you || summary ? (
              <div className="flex flex-wrap items-center gap-3 text-[13px]">
                {!picked.you ? (
                  <span className="inline-flex items-center gap-2 rounded-full bg-[var(--aw-surface-2)] py-1 pr-1 pl-3 text-ink">
                    Showing {picked.title}
                    <button type="button" className="aw-btn aw-btn--ghost aw-btn--sm" onClick={() => compareWith("__you")}>
                      Back to you
                    </button>
                  </span>
                ) : null}
                {summary ? <span className="text-body wrap-break-word">{summary}</span> : null}
                {view === "change" && compare.length > 1 && compareId ? <Dropdown<string> label="Compare with" value={compareId} onChange={onCompare} options={compare.map((c) => ({ id: c.id, label: `Against ${when(c.at)}` }))} /> : null}
              </div>
            ) : null}
            {mapFailed ? (
              <Heat ranks={picked.ranks} spacing={cur.spacing} size={size} inGrid={inGrid} sel={at} onSel={onPt} />
            ) : (
              <LocalMap lat={center.lat} lng={center.lng} spacing={cur.spacing} size={size} shape={cur.shape ?? "square"} pin={{ lat: loc.lat, lng: loc.lng }} dots={dots} sel={at} onSel={onPt} onFail={onFail} />
            )}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12px] text-body">
              {legend.map((t) => (
                <span key={t.label} className="flex items-center gap-1.5">
                  <i className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: t.dot }} />
                  {t.label}
                </span>
              ))}
              <span className="ml-auto text-muted">The pin is your business. Click a point to see who ranks there.</span>
            </div>
          </div>
        </Card>

        <div className="flex min-w-0 flex-col gap-4">
          <section className="aw-frame flex flex-col gap-3.5 px-5 py-4">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="text-[13px] font-medium text-muted wrap-break-word">{picked.you ? "Average rank" : `Average rank, ${picked.title}`}</h2>
              <span className="text-[12px] text-muted">lower is better</span>
            </div>
            <span className="flex flex-wrap items-baseline gap-2.5">
              <span className="aw-num text-[40px] leading-none font-bold text-ink">{misfit && picked.you ? "20+" : (picked.avg ?? "–")}</span>
              {picked.avg !== null && prevAvg !== null && !misfit ? <Delta now={picked.avg} before={prevAvg} lowerIsBetter /> : null}
            </span>
            <span className="flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full bg-[var(--aw-surface-2)]" aria-hidden="true">
              {([[bands.good, MAP.top3], [bands.average, MAP.top10], [bands.poor, MAP.top20], [bands.out, "#E5484D"]] as const).map(([n, c], k) => (n ? <span key={k} className="h-full" style={{ width: `${bands.read ? (n / bands.read) * 100 : 0}%`, background: c }} /> : null))}
            </span>
            <ul className="grid grid-cols-2 gap-x-4 gap-y-1.5">
              {([["1 to 3", bands.good, MAP.top3], ["4 to 10", bands.average, MAP.top10], ["11 to 20", bands.poor, MAP.top20], ["Not in top 20", bands.out, "#E5484D"]] as const).map(([label, n, c]) => (
                <li key={label} className="flex items-center gap-2 text-[12.5px]">
                  <i className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: c }} />
                  <span className="min-w-0 flex-1 text-body">{label}</span>
                  <span className="aw-num font-semibold text-ink">{n} pts</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="aw-frame flex flex-col gap-3 px-5 py-4">
            <h2 className="text-[13px] font-medium text-muted">Share of the map pack</h2>
            {share.map((b) => (
              <div key={b.key} className="flex flex-col gap-1">
                <div className="flex items-baseline gap-2 text-[13px]">
                  <span className={`min-w-0 wrap-break-word ${b.you ? "font-semibold text-[var(--signal)]" : "font-medium text-ink"}`}>{b.you ? "You" : b.title}</span>
                  {!b.you && street(b.address) ? <span className="min-w-0 text-[12px] text-muted wrap-break-word">{street(b.address)}</span> : null}
                  <span className="aw-num ml-auto shrink-0 text-[12.5px] font-medium text-ink">{Math.round(b.voice * 100)}%</span>
                </div>
                <span className="block h-1.5 overflow-hidden rounded-full bg-[var(--aw-surface-2)]">
                  <span className="block h-full rounded-full" style={{ width: `${b.voice * 100}%`, background: b.you ? "var(--signal)" : "var(--aw-faint)" }} />
                </span>
              </div>
            ))}
            {rest > 0.005 ? (
              <div className="flex items-baseline gap-2 text-[13px] text-muted">
                <span>Everyone else</span>
                <span className="aw-num ml-auto text-[12.5px]">{Math.round(rest * 100)}%</span>
              </div>
            ) : null}
          </section>

          <section className="aw-frame flex flex-col gap-2 pt-4">
            <h2 className="px-5 text-[13px] font-medium text-muted">Map pack {at === centre ? (cur.center ? "at the centre" : "at your business") : placeText(at, cur.spacing, size)}</h2>
            {raw ? <Pack results={raw[String(at)]} picked={picked} at={at} loc={{ ...loc, domain }} /> : <PackAt scan={cur} i={at} you={loc} />}
          </section>
        </div>
      </div>

      <Card
        title="Businesses on this grid"
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Seg label="Sort businesses" value={sort} onChange={setSort} options={[{ id: "rank", label: "Rank" }, { id: "reviews", label: "Reviews" }, { id: "rating", label: "Rating" }]} />
            <button
              type="button"
              className="aw-btn aw-btn--secondary aw-btn--sm"
              onClick={() => {
                const pts = [...inGrid].sort((a, b) => a - b);
                saveCsv(
                  `${loc.name || loc.title} ${keyword} ${done[0].created_at.slice(0, 10)}.csv`,
                  ["Business", "Address", "You", "Average rank", "Top 3 points", "Points found", "Rating", "Reviews", ...pts.map((i) => `Point ${i + 1}`)],
                  list.map((b) => [b.title, b.address, b.you ? "Yes" : "", b.avg, b.top3, b.found, b.rating, b.reviews, ...pts.map((i) => (b.ranks[i] === undefined ? "" : (b.ranks[i] ?? "20+")))]),
                );
              }}
            >
              Export CSV
            </button>
          </div>
        }
      >
        <div className="overflow-x-auto">
          <table className="aw-table">
            <thead>
              <tr>
                <th>Business</th>
                <th className="text-right">Average rank</th>
                <th className="text-right">In the top 3</th>
                <th className="text-right">Rating</th>
                <th className="text-right">Reviews</th>
                <th>
                  <span className="sr-only">Map</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {shown.map((b) => (
                <tr key={b.key} className={b.you ? "bg-[var(--signal-tint,rgb(9_67_176_/_0.045))]" : ""}>
                  <td className="min-w-56">
                    <span className={`block wrap-break-word ${b.you ? "font-semibold text-[var(--signal)]" : "font-medium text-ink"}`}>{b.you ? `${b.title} (you)` : b.title}</span>
                    {b.address ? <span className="block text-[12px] text-muted wrap-break-word">{b.address}</span> : null}
                  </td>
                  <td className="aw-num text-right">{b.avg ?? "–"}</td>
                  <td className="aw-num text-right">
                    {b.top3} of {bands.read}
                  </td>
                  <td className="aw-num text-right">{b.rating !== null ? `★ ${b.rating}` : "–"}</td>
                  <td className="aw-num text-right">{b.reviews?.toLocaleString("en-US") ?? "–"}</td>
                  <td className="text-right">
                    {b.key === picked.key ? (
                      <span className="text-[12.5px] text-muted">On the map</span>
                    ) : (
                      <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm" onClick={() => compareWith(b.key)}>
                        {b.you ? "Show you" : "Compare on map"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card title={`Rank over time, “${keyword}”`} className="h-full">
          <History runs={keywordTable(history, [keyword])[0].runs} />
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
        {rows.map((r, k) => (
          <div key={`${r.title}${k}`} className="flex flex-col gap-1.5">
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
        {series.map((s, k) => {
          const pts = s.vals.map((v, k) => (v === null ? null : `${x(k)},${y(v)}`)).filter(Boolean).join(" ");
          return pts ? <polyline key={`${s.name}${k}`} points={pts} fill="none" stroke={s.color} strokeWidth="2" /> : null;
        })}
        <text x={x(0)} y={H - 4} fill="var(--aw-muted)" style={{ font: "10px Inter, system-ui, sans-serif" }}>
          {when(h[0].at)}
        </text>
        <text x={x(h.length - 1)} y={H - 4} textAnchor="end" fill="var(--aw-muted)" style={{ font: "10px Inter, system-ui, sans-serif" }}>
          {when(h[h.length - 1].at)}
        </text>
      </svg>
      <div className="flex flex-wrap gap-3 text-[12px] text-body">
        {series.map((s, k) => (
          <span key={`${s.name}${k}`} className="flex items-center gap-1.5">
            <span className="inline-block h-[3px] w-3.5 rounded" style={{ background: s.color }} />
            {s.name}
          </span>
        ))}
      </div>
    </div>
  );
}
