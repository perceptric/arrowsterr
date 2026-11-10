"use client";

import { useCallback, useEffect, useState } from "react";
import { LINK_KINDS, spamLevel, type GapRow, type LinkKind, type LinkRow, type Overview, type Week } from "@/lib/backlinks";
import type { RunAuth } from "@/lib/runner";
import { DomainField, SearchBar, SearchButton } from "./SearchBar";
import { Card, Delta, Seg, StatStrip, Thinking } from "./ui";
import { BacklinksIntro } from "./ToolIntros";
import { useApi } from "./ZippiePage";

// Backlinks (docs/backlinks.md): who links to the brand, new and lost by week, anchors and most linked pages, every
// linking site by type, and the link gap against up to 3 rivals with sites AI cites flagged. Opening the page shows
// saved answers only; editors load fresh ones, which cost tasks.

type Brand = { id: string; name: string; domain: string };
type Tab = "overview" | "links" | "gap";
type Snap = { day: string; rank: number; backlinks: number; domains: number; spam: number } | null;
type Ov = Overview & { at: string };

const n = (x: number) => x.toLocaleString("en-US");
const when = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));
const SPAM_CLASS = { low: "aw-status--ranked", medium: "aw-status--warn", high: "aw-status--missed" } as const;

export function BacklinksPage({ brand, auth, canEdit }: { brand: Brand; auth: RunAuth; canEdit: boolean }) {
  const api = useApi(auth);
  const [tab, setTab] = useState<Tab>("overview");
  const [error, setError] = useState("");
  const call = useCallback(<T,>(action: string, extra: Record<string, unknown> = {}) => api<T>("/api/backlinks", { action, brandId: brand.id, ...extra }), [api, brand.id]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="aw-h2 mb-0!">Backlinks</h1>
        <Seg label="Backlinks view" value={tab} onChange={setTab} options={[{ id: "overview", label: "Overview" }, { id: "links", label: "Links" }, { id: "gap", label: "Link gap" }]} />
      </div>
      {error ? <p className="aw-error">{error}</p> : null}
      {tab === "overview" ? <OverviewTab brand={brand} call={call} canEdit={canEdit} onError={setError} /> : tab === "links" ? <LinksTab call={call} canEdit={canEdit} onError={setError} /> : <GapTab brand={brand} call={call} canEdit={canEdit} onError={setError} />}
    </div>
  );
}

type Call = <T>(action: string, extra?: Record<string, unknown>) => Promise<T>;

function Updated({ at, busy, canRefresh, onRefresh }: { at: string; busy: boolean; canRefresh: boolean; onRefresh: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-3 text-[12px] text-muted">
      <span>Updated {when(at)}</span>
      {canRefresh ? (
        <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm" onClick={onRefresh} disabled={busy}>
          {busy ? "Refreshing" : "Refresh"}
        </button>
      ) : null}
    </div>
  );
}

function OverviewTab({ brand, call, canEdit, onError }: { brand: Brand; call: Call; canEdit: boolean; onError: (e: string) => void }) {
  const [data, setData] = useState<{ overview: Ov; before: Snap; canRefresh: boolean } | null | "none">(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(
    async (fresh: boolean) => {
      if (fresh) setBusy(true);
      onError("");
      try {
        const r = await call<{ overview?: Ov; before?: Snap; canRefresh?: boolean; notSaved?: boolean }>("overview", fresh ? { refresh: true } : { peek: true });
        setData(r.notSaved || !r.overview ? "none" : { overview: r.overview, before: r.before ?? null, canRefresh: Boolean(r.canRefresh) });
      } catch (e) {
        onError(msg(e));
        setData((d) => d ?? "none");
      } finally {
        setBusy(false);
      }
    },
    [call, onError],
  );
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load(false);
  }, [load]);

  if (data === null) return <Thinking text="Loading" />;
  if (data === "none")
    return (
    <div className="flex flex-col gap-6">
      <SearchBar onSubmit={() => load(true)}>
        <DomainField domain={brand.domain} />
        {canEdit ? <SearchButton label="Load backlinks" busyLabel="Loading" busy={busy} /> : null}
      </SearchBar>
      <BacklinksIntro />
    </div>
    );
  const head = <Updated at={data.overview.at} busy={busy} canRefresh={data.canRefresh} onRefresh={() => load(true)} />;

  const { overview: o, before } = data;
  const s = o.summary;
  if (!s)
    return (
      <div className="flex flex-col gap-4">
        {head}
        <Card>
          <p className="px-5 py-6 text-[14px] text-body">No links to {o.target} found.</p>
        </Card>
      </div>
    );
  const last4 = o.weeks.slice(-4);
  const newDomains = last4.reduce((a, w) => a + w.newDomains, 0);
  const lostDomains = last4.reduce((a, w) => a + w.lostDomains, 0);
  const level = spamLevel(s.spam);
  return (
    <div className="flex flex-col gap-4">
      {head}
      <StatStrip
        spark={sitesTrend(s.domains, o.weeks)}
        stats={[
          { label: "Linking sites", value: n(s.domains), delta: <Delta now={s.domains} before={before?.domains ?? null} digits={0} /> },
          { label: "Backlinks", value: n(s.backlinks), delta: <Delta now={s.backlinks} before={before?.backlinks ?? null} digits={0} /> },
          { label: "New sites, 4 weeks", value: n(newDomains), tone: "pos" },
          { label: "Lost sites, 4 weeks", value: n(lostDomains), tone: lostDomains > newDomains ? "neg" : undefined },
          { label: "Authority", value: String(s.rank), delta: <span className={`aw-status ${SPAM_CLASS[level]}`}>{level === "low" ? "Low spam" : level === "medium" ? "Some spam" : "High spam"}</span> },
        ]}
      />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Card title="New and lost linking sites" action={<span className="flex gap-3 text-[12px] text-body"><Key color="var(--aw-pos)" label="New" /><Key color="var(--aw-neg)" label="Lost" /></span>}>
          <div className="px-5 pb-5">{o.weeks.length ? <Bars weeks={o.weeks} /> : <p className="text-[13px] text-muted">No weekly history yet.</p>}</div>
        </Card>
        <Card title="Anchors">
          <div className="flex flex-col gap-2 px-5 pb-5">
            {o.anchors.length ? (
              o.anchors.slice(0, 8).map((a) => (
                <div key={a.anchor} className="grid grid-cols-[minmax(0,1fr)_minmax(60px,120px)_40px] items-center gap-3 text-[13px]">
                  <span className="text-body wrap-break-word">{a.anchor}</span>
                  <span className="block h-2 rounded-full bg-[var(--aw-surface-2)]">
                    <span className="block h-full rounded-full bg-[var(--signal)]" style={{ width: `${Math.max(2, a.share)}%` }} />
                  </span>
                  <span className="aw-num text-right font-medium text-ink">{a.share}%</span>
                </div>
              ))
            ) : (
              <p className="text-[13px] text-muted">No anchors found.</p>
            )}
          </div>
        </Card>
      </div>
      <Card title="Most linked pages">
        <ul className="flex flex-col px-5 pb-4">
          {o.pages.map((p) => (
            <li key={p.url} className="flex flex-wrap items-center gap-3 border-t border-[var(--aw-rule)] py-2.5 first:border-t-0">
              <a href={p.url} target="_blank" rel="noreferrer" className="min-w-0 flex-1 text-[13px] text-ink wrap-anywhere hover:underline">
                {p.url}
              </a>
              <span className="aw-num text-[13px] text-body">{n(p.domains)} sites</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

/** Linking sites week by week, worked back from today's count and each week's new and lost sites. */
function sitesTrend(now: number, weeks: Week[]): number[] {
  const out = [now];
  for (let i = weeks.length - 1; i >= 0; i--) out.unshift(out[0] - weeks[i].newDomains + weeks[i].lostDomains);
  return out;
}

const Key = ({ color, label }: { color: string; label: string }) => (
  <span className="flex items-center gap-1.5">
    <span className="inline-block h-2.5 w-2.5 rounded-[3px]" style={{ background: color }} />
    {label}
  </span>
);

/** New sites up in green, lost sites down in red, one pair of bars per week, on one scale. */
function Bars({ weeks }: { weeks: Week[] }) {
  const w = 640;
  const h = 200;
  const L = 34;
  const B = 22;
  const max = Math.max(1, ...weeks.map((x) => Math.max(x.newDomains, x.lostDomains)));
  const top = Math.ceil(max / 5) * 5 || 5;
  const mid = 8 + (h - 8 - B) / 2;
  const half = (h - 8 - B) / 2;
  const col = (w - L - 6) / weeks.length;
  const bw = Math.max(4, col * 0.55);
  const y = (v: number) => (v / top) * half;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" role="img" aria-label="New and lost linking sites by week">
      {[top, top / 2, 0, -top / 2, -top].map((v) => (
        <g key={v}>
          <line x1={L} x2={w - 6} y1={mid - y(v)} y2={mid - y(v)} stroke="var(--aw-rule)" />
          <text x={L - 6} y={mid - y(v) + 4} textAnchor="end" fill="var(--aw-muted)" style={{ font: "11px Inter, system-ui, sans-serif" }}>
            {Math.abs(Math.round(v))}
          </text>
        </g>
      ))}
      {weeks.map((wk, i) => {
        const x = L + col * i + (col - bw) / 2;
        return (
          <g key={wk.date}>
            <title>{`Week to ${when(wk.date)}: ${wk.newDomains} new, ${wk.lostDomains} lost`}</title>
            <rect x={x} y={mid - y(wk.newDomains)} width={bw} height={y(wk.newDomains)} rx="3" fill="var(--aw-pos)" />
            <rect x={x} y={mid} width={bw} height={y(wk.lostDomains)} rx="3" fill="var(--aw-neg)" opacity="0.75" />
            {i % 2 === 0 || i === weeks.length - 1 ? (
              <text x={x + bw / 2} y={h - 5} textAnchor="middle" fill="var(--aw-muted)" style={{ font: "11px Inter, system-ui, sans-serif" }}>
                {when(wk.date)}
              </text>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}

function LinksTab({ call, canEdit, onError }: { call: Call; canEdit: boolean; onError: (e: string) => void }) {
  const [kind, setKind] = useState<LinkKind>("all");
  const [pages, setPages] = useState<Record<string, { rows: LinkRow[]; total: number; at: string } | "none">>({});
  const [shown, setShown] = useState(1);
  const [busy, setBusy] = useState(false);
  const fetchPage = useCallback(
    async (k: LinkKind, page: number, fresh: boolean) => {
      if (fresh) setBusy(true);
      onError("");
      try {
        const r = await call<{ links?: { rows: LinkRow[]; total: number; at: string }; notSaved?: boolean }>("links", { kind: k, page, ...(fresh ? { refresh: true } : { peek: true }) });
        setPages((m) => ({ ...m, [`${k}:${page}`]: r.links ?? "none" }));
      } catch (e) {
        onError(msg(e));
      } finally {
        setBusy(false);
      }
    },
    [call, onError],
  );
  useEffect(() => {
    if (pages[`${kind}:0`] !== undefined) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchPage(kind, 0, false);
  }, [kind, pages, fetchPage]);

  const first = pages[`${kind}:0`];
  const rows: LinkRow[] = [];
  for (let p = 0; p < shown; p++) {
    const pg = pages[`${kind}:${p}`];
    if (pg && pg !== "none") rows.push(...pg.rows);
  }
  const total = first && first !== "none" ? first.total : 0;
  const nextMissing = pages[`${kind}:${shown}`] === undefined || pages[`${kind}:${shown}`] === "none";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        {LINK_KINDS.map((k) => (
          <button key={k.id} type="button" onClick={() => { setKind(k.id); setShown(1); }} aria-pressed={kind === k.id} className="aw-chip aw-chip--btn">
            {k.label}
          </button>
        ))}
      </div>
      {first === undefined ? (
        <Thinking text="Loading" />
      ) : first === "none" ? (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
            <span className="text-[14px] text-body">Not loaded yet.</span>
            {canEdit ? (
              <button type="button" className="aw-btn aw-btn--primary aw-btn--sm" onClick={() => fetchPage(kind, 0, true)} disabled={busy}>
                {busy ? "Loading" : "Load links"}
              </button>
            ) : null}
          </div>
        </Card>
      ) : (
        <Card
          title={`${n(total)} linking ${total === 1 ? "site" : "sites"}`}
          action={<Updated at={first.at} busy={busy} canRefresh={canEdit} onRefresh={() => { setShown(1); setPages((m) => Object.fromEntries(Object.entries(m).filter(([k]) => !k.startsWith(`${kind}:`)))); fetchPage(kind, 0, true); }} />}
        >
          {rows.length ? (
            <div className="overflow-x-auto">
              <table className="aw-table">
                <thead>
                  <tr>
                    <th>From</th>
                    <th className="text-right">Authority</th>
                    <th>Anchor</th>
                    <th>To</th>
                    <th>Type</th>
                    <th>First seen</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((l) => (
                    <tr key={`${l.from}>${l.to}`}>
                      <td className="min-w-48">
                        <a href={l.from} target="_blank" rel="noreferrer" className="flex flex-col hover:underline">
                          <span className="font-medium text-ink wrap-anywhere">{l.domain}</span>
                          <span className="text-[12px] text-muted wrap-anywhere">{l.from}</span>
                        </a>
                      </td>
                      <td className="aw-num text-right">{l.rank}</td>
                      <td className="min-w-32 wrap-break-word">{l.anchor || <span className="text-muted">{l.type === "image" ? "Image" : "No text"}</span>}</td>
                      <td className="min-w-40 wrap-anywhere">{l.to}</td>
                      <td>
                        <span className="flex flex-wrap gap-1">
                          <span className={`aw-status ${l.follow ? "aw-status--ranked" : "aw-status--pending"}`}>{l.follow ? "Follow" : "Nofollow"}</span>
                          {l.spam > 60 ? <span className="aw-status aw-status--missed">Spam {l.spam}</span> : null}
                          {l.isLost ? <span className="aw-status aw-status--missed">Lost</span> : l.isNew ? <span className="aw-status aw-status--ranked">New</span> : null}
                        </span>
                      </td>
                      <td className="whitespace-nowrap">{l.firstSeen ? when(l.firstSeen) : "–"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="px-5 pb-5 text-[13px] text-muted">No links of this kind.</p>
          )}
          {rows.length < total && shown < 10 ? (
            <div className="px-5 py-4">
              <button
                type="button"
                className="aw-btn aw-btn--secondary aw-btn--sm"
                disabled={busy || (!canEdit && nextMissing)}
                onClick={async () => {
                  if (nextMissing) await fetchPage(kind, shown, true);
                  setShown((x) => x + 1);
                }}
              >
                {busy ? "Loading" : "Next 100"}
              </button>
            </div>
          ) : null}
        </Card>
      )}
    </div>
  );
}

function GapTab({ brand, call, canEdit, onError }: { brand: Brand; call: Call; canEdit: boolean; onError: (e: string) => void }) {
  const [rivals, setRivals] = useState<string[]>([]);
  const [suggested, setSuggested] = useState<string[]>([]);
  const [input, setInput] = useState("");
  const [gap, setGap] = useState<{ rows: GapRow[]; at: string } | null | "none">(null);
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState("");
  const [onlyAi, setOnlyAi] = useState(false);

  const load = useCallback(
    async (fresh: boolean, list?: string[]) => {
      if (fresh) setBusy("load");
      onError("");
      try {
        const r = await call<{ gap?: { rows: GapRow[]; at: string } | null; rivals?: string[]; suggested?: string[]; added?: string[]; notSaved?: boolean }>("gap", { ...(list ? { rivals: list } : {}), ...(fresh ? { refresh: true } : { peek: true }) });
        if (r.rivals) setRivals(r.rivals);
        if (r.suggested) setSuggested(r.suggested);
        if (r.added) setAdded(new Set(r.added));
        setGap(r.notSaved || !r.gap ? "none" : r.gap);
      } catch (e) {
        onError(msg(e));
        setGap((g) => g ?? "none");
      } finally {
        setBusy("");
      }
    },
    [call, onError],
  );
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load(false);
  }, [load]);

  async function add(domains: string[]) {
    setBusy(domains.length > 1 ? "all" : domains[0]);
    onError("");
    try {
      const r = await call<{ added: string[] }>("add", { domains });
      setAdded((s) => new Set([...s, ...r.added]));
    } catch (e) {
      onError(msg(e));
    } finally {
      setBusy("");
    }
  }
  const addRival = () => {
    const d = input.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
    if (d && !rivals.includes(d) && rivals.length < 3) setRivals([...rivals, d]);
    setInput("");
  };

  const rows = gap && gap !== "none" ? gap.rows.filter((r) => !onlyAi || r.aiCited > 0) : [];
  const notAdded = rows.filter((r) => !added.has(r.domain)).map((r) => r.domain);

  return (
    <div className="flex flex-col gap-4">
      <Card title="Rivals">
        <div className="flex flex-col gap-3 px-5 pb-5">
          <div className="flex flex-wrap items-center gap-2">
            {rivals.map((r) => (
              <span key={r} className="inline-flex items-center gap-1.5 rounded-[8px] bg-[var(--aw-surface-2)] py-1 pr-1.5 pl-2.5 text-[13px] text-ink">
                {r}
                {canEdit ? (
                  <button type="button" aria-label={`Remove ${r}`} className="aw-iconbtn h-5! w-5!" onClick={() => setRivals(rivals.filter((x) => x !== r))}>
                    ×
                  </button>
                ) : null}
              </span>
            ))}
            {canEdit && rivals.length < 3 ? (
              <form
                className="flex items-center gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  addRival();
                }}
              >
                <input id="gap-rival" className="aw-input py-1.5! text-[13px]!" value={input} onChange={(e) => setInput(e.target.value)} placeholder="rival.com" aria-label="Add a rival" />
                <button type="submit" className="aw-btn aw-btn--secondary aw-btn--sm" disabled={!input.trim()}>
                  Add
                </button>
              </form>
            ) : null}
          </div>
          {canEdit && !rivals.length && suggested.length ? (
            <div className="flex flex-wrap items-center gap-2 text-[13px]">
              {suggested.slice(0, 5).map((s) => (
                <button key={s} type="button" className="aw-btn aw-btn--secondary aw-btn--sm" onClick={() => rivals.length < 3 && setRivals([...rivals, s])}>
                  + {s}
                </button>
              ))}
            </div>
          ) : null}
          {canEdit ? (
            <div>
              <button type="button" className="aw-btn aw-btn--primary aw-btn--sm" disabled={!rivals.length || busy === "load"} onClick={() => load(true, rivals)}>
                {busy === "load" ? "Finding" : "Find the gap"}
              </button>
            </div>
          ) : null}
        </div>
      </Card>

      {gap === null ? (
        <Thinking text="Loading" />
      ) : gap === "none" ? null : (
        <Card
          title={`${n(rows.length)} sites link to ${rivals.length === 1 ? "your rival" : "your rivals"} and not to ${brand.name}`}
          action={
            <span className="flex flex-wrap items-center gap-3">
              <label className="flex cursor-pointer items-center gap-2 text-[13px] text-body">
                <input type="checkbox" checked={onlyAi} onChange={(e) => setOnlyAi(e.target.checked)} className="h-4 w-4 accent-[var(--signal)]" />
                Only sites AI cites
              </label>
              {canEdit && notAdded.length ? (
                <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm" onClick={() => add(notAdded)} disabled={busy === "all"}>
                  {busy === "all" ? "Adding" : `Add ${notAdded.length} to Link building`}
                </button>
              ) : null}
            </span>
          }
        >
          {rows.length ? (
            <div className="overflow-x-auto">
              <table className="aw-table">
                <thead>
                  <tr>
                    <th>Site</th>
                    <th className="text-right">Authority</th>
                    {rivals.map((r) => (
                      <th key={r} className="text-center wrap-anywhere">
                        {r}
                      </th>
                    ))}
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((g) => (
                    <tr key={g.domain}>
                      <td className="min-w-48">
                        <span className="flex flex-col gap-1">
                          <a href={`https://${g.domain}`} target="_blank" rel="noreferrer" className="font-medium text-ink wrap-anywhere hover:underline">
                            {g.domain}
                          </a>
                          {g.aiCited ? <span className="aw-status aw-status--ranked self-start">AI cites it {g.aiCited}×</span> : null}
                        </span>
                      </td>
                      <td className="aw-num text-right">{g.rank}</td>
                      {rivals.map((r) => (
                        <td key={r} className="text-center">
                          {g.rivals.includes(r) ? <span className="font-bold text-pos" aria-label="Links">✓</span> : <span className="text-muted" aria-label="No link">–</span>}
                        </td>
                      ))}
                      <td className="text-right">
                        {canEdit ? (
                          <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm" onClick={() => add([g.domain])} disabled={added.has(g.domain) || busy === g.domain}>
                            {added.has(g.domain) ? "Added" : "Add"}
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="px-5 pb-5 text-[13px] text-muted">{onlyAi ? "No sites AI cites." : "No gap found."}</p>
          )}
          <p className="px-5 pb-4 text-[12px] text-muted">Updated {when(gap.at)}</p>
        </Card>
      )}
    </div>
  );
}
