"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BL_SCOPES, BULK_MAX, guessScope, LINK_KINDS, spamLevel, type BlScope, type BulkRow, type GapRow, type LinkKind, type LinkRow, type Overview, type Week } from "@/lib/backlinks";
import type { RunAuth } from "@/lib/runner";
import { domainHref, setUrl, urlParams } from "@/lib/researchUrl";
import { scopeOf } from "@/lib/scope";
import { useStash } from "@/lib/stash";
import { Dropdown } from "./Pickers";
import { SearchBar, SearchButton } from "./SearchBar";
import { BAR_FIELD, BAR_INPUT, downloadCsv } from "./research/shared";
import { Card, Delta, favicon, Seg, StatStrip, Thinking } from "./ui";
import { BacklinksIntro } from "./ToolIntros";
import { useApi } from "./ZippiePage";

// Backlinks (docs/backlinks.md): who links to any site, subdomain or page, new and lost by week, anchors and most
// linked pages, every linking site by type, the link gap against up to 3 competitors with sites AI cites flagged, and
// up to 200 sites compared side by side. The search lives in the address bar (/backlinks?q=acme.com&view=links), so it
// can be shared and Back steps through searches. Opening the page shows saved answers only; a search or a tab someone
// picks loads fresh ones for editors, which cost tasks.

type Brand = { id: string; name: string; domain: string };
type Tab = "overview" | "links" | "gap" | "compare";
type Snap = { day: string; rank: number; backlinks: number; domains: number; spam: number } | null;
type Ov = Overview & { at: string };
type Q = { q: string; scope: BlScope; n: number };
type Open = (q: string, scope: BlScope) => void;

const TABS: Tab[] = ["overview", "links", "gap", "compare"];
const n = (x: number) => x.toLocaleString("en-US");
const when = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));
const SPAM_CLASS = { low: "aw-status--ranked", medium: "aw-status--warn", high: "aw-status--missed" } as const;
const bare = (x: string) => x.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/+$/, "");
const hostOf = (x: string) => bare(x).replace(/[/?#].*$/, "");

export function BacklinksPage({ brand, auth, canEdit }: { brand: Brand; auth: RunAuth; canEdit: boolean }) {
  const api = useApi(auth);
  const own = hostOf(brand.domain);
  const [tab, setTab] = useState<Tab>("overview");
  const [active, setActive] = useState<Q>({ q: own, scope: "domain", n: 0 });
  const [input, setInput] = useState(own);
  const [scope, setScope] = useState<BlScope>("domain");
  // Opening the page only reads saved answers. Once someone searches or picks a tab, editors load fresh ones.
  const [armed, setArmed] = useState(false);
  const [peers, setPeers] = useState<string[]>([]);
  const [error, setError] = useState("");
  const call = useCallback(
    <T,>(action: string, extra: Record<string, unknown> = {}) => api<T>("/api/backlinks", { action, brandId: brand.id, target: active.q, scope: active.scope, ...extra }),
    [api, brand.id, active.q, active.scope],
  );

  // Show what the address bar asks for, on open and on Back.
  useEffect(() => {
    const sync = () => {
      const p = urlParams();
      const q = p.get("q")?.trim() || own;
      const sc = (BL_SCOPES.some((x) => x.id === p.get("scope")) ? p.get("scope") : (p.get("q") ? guessScope(q, scopeOf) : null) ?? "domain") as BlScope;
      const v = TABS.includes(p.get("view") as Tab) ? (p.get("view") as Tab) : "overview";
      setInput(q);
      setScope(sc);
      setTab(v);
      setActive((a) => (bare(a.q) === bare(q) && a.scope === sc ? a : { q, scope: sc, n: a.n + 1 }));
    };
    sync();
    window.addEventListener("popstate", sync);
    api<{ competitors: string[] }>("/api/backlinks", { action: "peers", brandId: brand.id })
      .then((r) => setPeers(r.competitors ?? []))
      .catch(() => {});
    return () => window.removeEventListener("popstate", sync);
  }, [api, brand.id, own]);

  const address = (q: string, sc: BlScope, v: Tab) => ({ q: bare(q) === own && sc === "domain" ? null : q, scope: sc === "domain" ? null : sc, view: v === "overview" ? null : v });
  const open: Open = (q, sc) => {
    const next = tab === "compare" ? "overview" : tab;
    setError("");
    setArmed(true);
    setInput(q);
    setScope(sc);
    setTab(next);
    setActive((a) => ({ q: q.trim(), scope: sc, n: a.n + 1 }));
    setUrl(address(q.trim(), sc, next), true);
  };
  const pickTab = (v: Tab) => {
    setError("");
    setArmed(true);
    setTab(v);
    setUrl(address(active.q, active.scope, v), true);
  };

  const key = `${active.scope}:${active.q}:${active.n}`;
  const isOwn = active.scope === "domain" && bare(active.q) === own;
  const label = bare(active.q);
  const hint = BL_SCOPES.find((x) => x.id === scope)!.hint;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="aw-h2 mb-0!">Backlinks</h1>
        <Seg label="Backlinks view" value={tab} onChange={pickTab} options={[{ id: "overview", label: "Overview" }, { id: "links", label: "Links" }, { id: "gap", label: "Link gap" }, { id: "compare", label: "Compare" }]} />
      </div>
      {tab !== "compare" ? (
        <div className="flex flex-col gap-3">
          <SearchBar onSubmit={() => input.trim() && open(input, scope)}>
            <Dropdown<BlScope> label="Look at" value={scope} onChange={setScope} className={BAR_FIELD} options={BL_SCOPES.map((x) => ({ id: x.id, label: x.label }))} />
            <input
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                const g = guessScope(e.target.value, scopeOf);
                if (g) setScope(g);
              }}
              placeholder={hint}
              aria-label="Domain or URL"
              className={BAR_INPUT}
            />
            <SearchButton label="Analyze" busyLabel="Analyzing" busy={false} disabled={!input.trim()} />
          </SearchBar>
          <div className="flex flex-wrap items-center gap-2">
            {[own, ...peers].slice(0, 7).map((d) => (
              <button key={d} type="button" className="aw-chip aw-chip--btn inline-flex items-center gap-1.5" aria-pressed={active.scope === "domain" && bare(active.q) === d} onClick={() => open(d, "domain")}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={favicon(d)} alt="" width={14} height={14} className="h-3.5 w-3.5" />
                {d}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {error ? <p className="aw-error">{error}</p> : null}
      {tab !== "compare" ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={favicon(hostOf(active.q))} alt="" width={28} height={28} className="h-7 w-7 rounded-[6px]" />
            <h2 className="aw-h3 mb-0! min-w-0 wrap-anywhere">
              {label} {isOwn ? <span className="aw-badge align-middle">You</span> : null}
              {active.scope !== "domain" ? <span className="aw-tag ml-2 align-middle">{BL_SCOPES.find((x) => x.id === active.scope)?.label}</span> : null}
            </h2>
          </div>
          <a className="aw-btn aw-btn--secondary aw-btn--sm" href={domainHref(label, active.scope)}>
            Open in Domain Research
          </a>
        </div>
      ) : null}
      {tab === "overview" ? (
        <OverviewTab key={key} call={call} canEdit={canEdit} armed={armed} onError={setError} onOpen={open} />
      ) : tab === "links" ? (
        <LinksTab key={key} call={call} canEdit={canEdit} armed={armed} label={label} onError={setError} onOpen={open} />
      ) : tab === "gap" ? (
        <GapTab key={key} label={label} call={call} canEdit={canEdit} onError={setError} onOpen={open} />
      ) : (
        <CompareTab brand={brand} own={own} peers={peers} call={call} canEdit={canEdit} onError={setError} onOpen={open} />
      )}
    </div>
  );
}

type Call = <T>(action: string, extra?: Record<string, unknown>) => Promise<T>;

/** A linking or gap site: its name opens its own backlinks, the arrow opens the site. */
function SiteLink({ domain, sub, href, onOpen }: { domain: string; sub?: string; href: string; onOpen: Open }) {
  return (
    <span className="flex min-w-0 flex-col">
      <span className="flex min-w-0 items-center gap-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={favicon(domain)} alt="" width={16} height={16} className="h-4 w-4 shrink-0" />
        <button type="button" className="text-left font-medium text-ink wrap-anywhere hover:underline" onClick={() => onOpen(domain, "domain")}>
          {domain}
        </button>
        <a href={href} target="_blank" rel="noreferrer" aria-label={`Open ${domain}`} className="text-muted hover:text-ink">
          ↗
        </a>
      </span>
      {sub ? <span className="text-[12px] text-muted wrap-anywhere">{sub}</span> : null}
    </span>
  );
}

const CsvButton = ({ onClick }: { onClick: () => void }) => (
  <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm" onClick={onClick}>
    Export CSV
  </button>
);

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

function OverviewTab({ call, canEdit, armed, onError, onOpen }: { call: Call; canEdit: boolean; armed: boolean; onError: (e: string) => void; onOpen: Open }) {
  const [data, setData] = useState<{ overview: Ov; before: Snap; canRefresh: boolean } | null | "none">(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(
    async (fresh: boolean) => {
      if (fresh) setBusy(true);
      onError("");
      try {
        const r = await call<{ overview?: Ov; before?: Snap; canRefresh?: boolean; notSaved?: boolean }>("overview", fresh ? { refresh: true } : armed ? {} : { peek: true });
        setData(r.notSaved || !r.overview ? "none" : { overview: r.overview, before: r.before ?? null, canRefresh: Boolean(r.canRefresh) });
      } catch (e) {
        onError(msg(e));
        setData((d) => d ?? "none");
      } finally {
        setBusy(false);
      }
    },
    [call, onError, armed],
  );
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load(false);
  }, [load]);

  if (data === null) return <Thinking text={armed ? "Reading links" : "Loading"} />;
  if (data === "none")
    return (
      <div className="flex flex-col gap-6">
        {canEdit ? (
          <div>
            <button type="button" className="aw-btn aw-btn--primary" onClick={() => load(true)} disabled={busy}>
              {busy ? "Loading" : "Load backlinks"}
            </button>
          </div>
        ) : null}
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
          // One page has no weekly history, so it shows its nofollow and broken links instead.
          ...(o.weeks.length
            ? [
                { label: "New sites, 4 weeks", value: n(newDomains), tone: "pos" as const },
                { label: "Lost sites, 4 weeks", value: n(lostDomains), tone: lostDomains > newDomains ? ("neg" as const) : undefined },
              ]
            : [
                { label: "Nofollow sites", value: n(s.nofollowDomains) },
                { label: "Broken backlinks", value: n(s.broken), tone: s.broken ? ("neg" as const) : undefined },
              ]),
          { label: "Authority", value: String(s.rank), delta: <span className={`aw-status ${SPAM_CLASS[level]}`}>{level === "low" ? "Low spam" : level === "medium" ? "Some spam" : "High spam"}</span> },
        ]}
      />
      <div className={`grid gap-4 ${o.weeks.length ? "lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]" : ""}`}>
        {o.weeks.length ? (
          <Card title="New and lost linking sites" action={<span className="flex gap-3 text-[12px] text-body"><Key color="var(--aw-pos)" label="New" /><Key color="var(--aw-neg)" label="Lost" /></span>}>
            <div className="px-5 pb-5">
              <Bars weeks={o.weeks} />
            </div>
          </Card>
        ) : null}
        <Card title="Anchors" action={o.anchors.length ? <CsvButton onClick={() => downloadCsv(`${bare(o.target).replace(/[/?#]+/g, "_")}-anchors.csv`, ["anchor", "linking sites", "backlinks", "share %"], o.anchors.map((a) => [a.anchor, a.domains, a.backlinks, a.share]))} /> : undefined}>
          <div className="flex flex-col gap-2 px-5 pb-5">
            {o.anchors.length ? (
              o.anchors.slice(0, o.weeks.length ? 8 : 15).map((a) => (
                <div key={a.anchor} className="grid grid-cols-[minmax(0,1fr)_minmax(60px,240px)_72px_40px] items-center gap-3 text-[13px]">
                  <span className="text-body wrap-break-word">{a.anchor}</span>
                  <span className="block h-2 rounded-full bg-[var(--aw-surface-2)]">
                    <span className="block h-full rounded-full bg-[var(--signal)]" style={{ width: `${Math.max(2, a.share)}%` }} />
                  </span>
                  <span className="aw-num text-right text-muted">{n(a.domains)} sites</span>
                  <span className="aw-num text-right font-medium text-ink">{a.share}%</span>
                </div>
              ))
            ) : (
              <p className="text-[13px] text-muted">No anchors found.</p>
            )}
          </div>
        </Card>
      </div>
      {o.pages.length ? (
        <Card title="Most linked pages" action={<CsvButton onClick={() => downloadCsv(`${bare(o.target)}-pages.csv`, ["page", "linking sites", "backlinks"], o.pages.map((p) => [p.url, p.domains, p.backlinks]))} />}>
          <ul className="flex flex-col px-5 pb-4">
            {o.pages.map((p) => (
              <li key={p.url} className="flex flex-wrap items-center gap-3 border-t border-[var(--aw-rule)] py-2.5 first:border-t-0">
                <button type="button" onClick={() => onOpen(p.url, "url")} className="min-w-0 flex-1 text-left text-[13px] text-ink wrap-anywhere hover:underline">
                  {p.url}
                </button>
                <span className="aw-num text-[13px] text-body">{n(p.domains)} sites</span>
                <span className="aw-num w-28 text-right text-[13px] text-muted">{n(p.backlinks)} links</span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
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

function LinksTab({ call, canEdit, armed, label, onError, onOpen }: { call: Call; canEdit: boolean; armed: boolean; label: string; onError: (e: string) => void; onOpen: Open }) {
  const [kind, setKind] = useState<LinkKind>("all");
  const [pages, setPages] = useState<Record<string, { rows: LinkRow[]; total: number; at: string } | "none">>({});
  const [shown, setShown] = useState(1);
  const [busy, setBusy] = useState(false);
  // After a search or a tab pick, a list that isn't saved loads on its own for editors.
  const live = useRef(armed);
  const fetchPage = useCallback(
    async (k: LinkKind, page: number, fresh: boolean) => {
      if (fresh) setBusy(true);
      onError("");
      try {
        const r = await call<{ links?: { rows: LinkRow[]; total: number; at: string }; notSaved?: boolean }>("links", { kind: k, page, ...(fresh ? { refresh: true } : live.current ? {} : { peek: true }) });
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
          <button key={k.id} type="button" onClick={() => { live.current = true; setKind(k.id); setShown(1); }} aria-pressed={kind === k.id} className="aw-chip aw-chip--btn">
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
          action={
            <span className="flex flex-wrap items-center gap-3">
              {rows.length ? <CsvButton onClick={() => downloadCsv(`${label.replace(/[/?#]+/g, "_")}-${kind}-links.csv`, ["linking site", "from page", "authority", "anchor", "to page", "follow", "spam", "new", "lost", "first seen"], rows.map((l) => [l.domain, l.from, l.rank, l.anchor, l.to, l.follow ? "follow" : "nofollow", l.spam, l.isNew ? "yes" : "", l.isLost ? "yes" : "", l.firstSeen ?? ""]))} /> : null}
              <Updated at={first.at} busy={busy} canRefresh={canEdit} onRefresh={() => { setShown(1); setPages((m) => Object.fromEntries(Object.entries(m).filter(([k]) => !k.startsWith(`${kind}:`)))); fetchPage(kind, 0, true); }} />
            </span>
          }
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
                        <SiteLink domain={l.domain} sub={l.from} href={l.from} onOpen={onOpen} />
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

function GapTab({ label, call, canEdit, onError, onOpen }: { label: string; call: Call; canEdit: boolean; onError: (e: string) => void; onOpen: Open }) {
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
      <Card title="Competitors">
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
                <input id="gap-rival" className="aw-input py-1.5! text-[13px]!" value={input} onChange={(e) => setInput(e.target.value)} placeholder="competitor.com" aria-label="Add a competitor" />
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
          title={`${n(rows.length)} sites link to ${rivals.length === 1 ? "your competitor" : "your competitors"} and not to ${label.replace(/[/?#].*$/, "")}`}
          action={
            <span className="flex flex-wrap items-center gap-3">
              <label className="flex cursor-pointer items-center gap-2 text-[13px] text-body">
                <input type="checkbox" checked={onlyAi} onChange={(e) => setOnlyAi(e.target.checked)} className="h-4 w-4 accent-[var(--signal)]" />
                Only sites AI cites
              </label>
              {rows.length ? <CsvButton onClick={() => downloadCsv(`${label.replace(/[/?#].*$/, "")}-link-gap.csv`, ["site", "authority", ...rivals, "ai cites"], rows.map((g) => [g.domain, g.rank, ...rivals.map((r) => (g.rivals.includes(r) ? "yes" : "")), g.aiCited]))} /> : null}
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
                          <SiteLink domain={g.domain} href={`https://${g.domain}`} onOpen={onOpen} />
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

/** Up to 200 sites or pages side by side: authority, linking sites, backlinks, nofollow share and spam. */
function CompareTab({ brand, own, peers, call, canEdit, onError, onOpen }: { brand: Brand; own: string; peers: string[]; call: Call; canEdit: boolean; onError: (e: string) => void; onOpen: Open }) {
  const [text, setText] = useStash<string>(`blc:${brand.id}:q`, "");
  const [result, setResult] = useStash<{ rows: BulkRow[]; at: string; skipped: number } | null>(`blc:${brand.id}:result`, null);
  const [busy, setBusy] = useState(false);
  const lines = text.split(/[\n,]+/).map((x) => x.trim()).filter(Boolean);
  const over = lines.length > BULK_MAX;

  // Start with the brand and its competitors.
  useEffect(() => {
    if (!text.trim() || text.trim() === own) setText([own, ...peers].join("\n"));
  }, [own, peers]); // eslint-disable-line react-hooks/exhaustive-deps

  async function run(fresh: boolean) {
    setBusy(true);
    onError("");
    try {
      const r = await call<{ bulk?: { rows: BulkRow[]; at: string }; skipped?: number; notSaved?: boolean }>("bulk", { targets: lines, ...(fresh ? { refresh: true } : {}) });
      if (r.notSaved || !r.bulk) onError("Not loaded yet. Ask an editor to run this comparison.");
      else setResult({ ...r.bulk, skipped: r.skipped ?? 0 });
    } catch (e) {
      onError(msg(e));
    } finally {
      setBusy(false);
    }
  }

  const rows = result?.rows ?? [];
  const top = Math.max(1, ...rows.map((r) => r.domains));
  const mine = (t: string) => bare(t) === own;

  return (
    <div className="flex flex-col gap-4">
      <form
        className="aw-frame flex flex-col gap-3 p-3"
        onSubmit={(e) => {
          e.preventDefault();
          run(false);
        }}
      >
        <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder={"competitor.com\nblog.competitor.com\ncompetitor.com/pricing"} rows={7} aria-label="Sites or pages, one per line" className="aw-textarea w-full resize-y font-mono text-[14px]" />
        <div className="flex flex-wrap items-center gap-3">
          <span className={`aw-num text-[12px] ${over ? "font-medium text-neg" : "text-muted"}`}>
            {lines.length} of {BULK_MAX}
          </span>
          <span className="flex-1" />
          {canEdit ? (
            <button type="submit" className="aw-btn aw-btn--primary" disabled={busy || !lines.length || over}>
              {busy ? "Comparing" : "Compare"}
            </button>
          ) : null}
        </div>
      </form>

      {busy ? <Thinking text={`Reading links for ${lines.length} ${lines.length === 1 ? "site" : "sites"}`} /> : null}

      {!busy && result ? (
        <Card
          title={`${n(rows.length)} ${rows.length === 1 ? "site" : "sites"}`}
          action={
            <span className="flex flex-wrap items-center gap-3">
              <CsvButton onClick={() => downloadCsv("backlinks-compare.csv", ["site", "authority", "linking sites", "backlinks", "nofollow sites", "spam"], rows.map((r) => [r.target, r.rank, r.domains, r.backlinks, r.nofollowDomains, r.spam ?? ""]))} />
              <Updated at={result.at} busy={busy} canRefresh={canEdit} onRefresh={() => run(true)} />
            </span>
          }
        >
          {result.skipped ? <p className="px-5 pb-2 text-[13px] text-muted">{result.skipped} skipped: not a site or page.</p> : null}
          <div className="overflow-x-auto">
            <table className="aw-table">
              <thead>
                <tr>
                  <th>Site</th>
                  <th className="text-right">Authority</th>
                  <th>Linking sites</th>
                  <th className="text-right">Backlinks</th>
                  <th className="text-right">Nofollow</th>
                  <th className="text-right">Spam</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const page = /^https?:\/\//.test(r.target);
                  const name = bare(r.target);
                  const level = r.spam === null ? null : spamLevel(r.spam);
                  return (
                    <tr key={r.target} className={mine(r.target) ? "bg-[var(--signal-tint,rgba(9,67,176,0.045))]" : undefined}>
                      <td className="min-w-48">
                        <span className="flex min-w-0 items-center gap-2">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={favicon(hostOf(r.target))} alt="" width={16} height={16} className="h-4 w-4 shrink-0" />
                          <button type="button" className="text-left font-medium text-ink wrap-anywhere hover:underline" onClick={() => onOpen(name, page ? "url" : "domain")}>
                            {name}
                          </button>
                          {mine(r.target) ? <span className="aw-badge">You</span> : null}
                        </span>
                      </td>
                      <td className="aw-num text-right">{r.rank}</td>
                      <td className="min-w-56">
                        <span className="flex items-center gap-3">
                          <span className="block h-2 flex-1 rounded-full bg-[var(--aw-surface-2)]">
                            <span className={`block h-full rounded-full ${mine(r.target) ? "bg-[var(--signal)]" : "bg-[var(--aw-muted)]"}`} style={{ width: `${Math.max(1, (r.domains / top) * 100)}%` }} />
                          </span>
                          <span className="aw-num w-16 text-right text-ink">{n(r.domains)}</span>
                        </span>
                      </td>
                      <td className="aw-num text-right">{n(r.backlinks)}</td>
                      <td className="aw-num text-right">{r.domains ? `${Math.round((r.nofollowDomains / r.domains) * 100)}%` : "–"}</td>
                      <td className="text-right">{level ? <span className={`aw-status ${SPAM_CLASS[level]}`}>{r.spam}</span> : <span className="text-muted">–</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
