"use client";

import { useMemo, useState } from "react";
import { disavowFile, riskOf, sameSite, type RefDomain } from "@/lib/backlinks";
import { useStash } from "@/lib/stash";
import { Card, Seg, StatStrip } from "../ui";
import { C, Stack } from "./charts";
import { CsvButton, Fav, fileName, Loading, msg, NotLoaded, num, SiteLink, Toggle, Updated, useAnswer, when, type TabProps } from "./shared";

// Referring domains, Toxic links and Network: all three read the target's 1,000 strongest linking sites.

type Rd = { rows: RefDomain[]; at: string };
type RdData = { list: Rd; ai: Record<string, number> };

function useDomains(p: TabProps) {
  return useAnswer<RdData>(p.call, p.memo, "domains", (r) => (r.domains ? { list: r.domains as Rd, ai: (r.ai as Record<string, number>) ?? {} } : null), p.armed, p.onError);
}
const DAY = 864e5;
const isNew = (r: RefDomain) => Boolean(r.firstSeen) && Date.now() - new Date(r.firstSeen!).getTime() < 30 * DAY;

export function DomainsTab(p: TabProps) {
  const { data, busy, load } = useDomains(p);
  const [min, setMin] = useState<"0" | "30" | "60" | "80">("0");
  const [f, setF] = useState({ follow: false, fresh: false, ai: false, edu: false, clean: false });
  const [q, setQ] = useState("");
  const [shown, setShown] = useState(100);
  if (data === null) return <Loading />;
  if (data === "none") return <NotLoaded canEdit={p.canEdit} busy={busy} label="Load linking sites" onLoad={() => load(true)} />;
  const { list, ai } = data;
  const all = list.rows;
  const rows = all.filter(
    (r) =>
      r.rank >= Number(min) &&
      (!f.follow || r.follow) &&
      (!f.fresh || isNew(r)) &&
      (!f.ai || ai[r.domain]) &&
      (!f.edu || /\.(edu|gov)(\.[a-z]{2})?$/.test(r.domain)) &&
      (!f.clean || r.spam <= 60) &&
      (!q.trim() || r.domain.includes(q.trim().toLowerCase())),
  );
  const fresh = all.filter(isNew).length;
  const strong = all.filter((r) => r.rank >= 60).length;
  const follow = all.filter((r) => r.follow).length;
  const flip = (k: keyof typeof f) => {
    setF({ ...f, [k]: !f[k] });
    setShown(100);
  };
  return (
    <div className="flex flex-col gap-4">
      <StatStrip
        extra={<div className="mt-2"><Stack parts={[{ label: "New", value: fresh, color: C.pos }, { label: "Other", value: all.length - fresh, color: "var(--aw-surface-2)" }]} /></div>}
        stats={[
          { label: "New in 30 days", value: `+${num(fresh)}`, tone: "pos", sub: "first seen in the last 30 days" },
          { label: "Strong sites, 60+", value: num(strong), sub: all.length ? `${Math.round((strong / all.length) * 100)}% of these sites` : undefined },
          { label: "Follow links", value: `${all.length ? Math.round((follow / all.length) * 100) : 0}%`, sub: "of linking sites" },
          { label: "Linking sites here", value: num(all.length) },
        ]}
      />
      <Card
        title={`${num(rows.length)} of ${num(all.length)} linking sites`}
        action={
          <span className="flex flex-wrap items-center gap-3">
            <CsvButton name={fileName(p.label, "referring-domains")} head={["site", "authority", "backlinks to target", "follow", "nofollow %", "first seen", "ai cites", "spam"]} rows={rows.map((r) => [r.domain, r.rank, r.backlinks, r.follow ? "yes" : "no", r.nofollowShare, r.firstSeen ?? "", ai[r.domain] ?? 0, r.spam])} />
            <Updated at={list.at} busy={busy} canRefresh={p.canEdit} onRefresh={() => load(true)} />
          </span>
        }
      >
        <div className="flex flex-wrap items-center gap-2 border-b border-[var(--aw-rule)] px-5 pb-3">
          <Seg label="Authority" value={min} onChange={(v) => { setMin(v); setShown(100); }} options={[{ id: "0", label: "Any authority" }, { id: "30", label: "30+" }, { id: "60", label: "60+" }, { id: "80", label: "80+" }]} />
          <Toggle on={f.follow} onClick={() => flip("follow")}>Follow only</Toggle>
          <Toggle on={f.fresh} onClick={() => flip("fresh")}>New in 30 days</Toggle>
          <Toggle on={f.ai} onClick={() => flip("ai")}>AI cites it</Toggle>
          <Toggle on={f.edu} onClick={() => flip("edu")}>.edu and .gov</Toggle>
          <Toggle on={f.clean} onClick={() => flip("clean")}>Hide spam</Toggle>
          <input className="aw-input py-1.5! text-[13px]!" value={q} onChange={(e) => { setQ(e.target.value); setShown(100); }} placeholder="Search sites" aria-label="Search sites" />
        </div>
        {rows.length ? (
          <div className="overflow-x-auto">
            <table className="aw-table">
              <thead>
                <tr>
                  <th>Linking site</th>
                  <th className="text-right">Authority</th>
                  <th className="text-right">Backlinks</th>
                  <th>Type</th>
                  <th>First seen</th>
                  <th>AI cites it</th>
                  <th className="text-right">Spam</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, shown).map((r) => (
                  <tr key={r.domain}>
                    <td className="min-w-56">
                      <SiteLink domain={r.domain} onOpen={p.onOpen}>
                        {isNew(r) ? <span className="aw-status aw-status--ranked">New</span> : null}
                      </SiteLink>
                    </td>
                    <td className="text-right">
                      <span className="inline-flex items-center gap-2">
                        <span className="block h-1.5 w-11 rounded-full bg-[var(--aw-surface-2)]">
                          <span className="block h-full rounded-full bg-[var(--signal)]" style={{ width: `${r.rank}%` }} />
                        </span>
                        <span className="aw-num w-6 text-right">{r.rank}</span>
                      </span>
                    </td>
                    <td className="aw-num text-right">{num(r.backlinks)}</td>
                    <td>
                      <span className={`aw-status ${r.follow ? "aw-status--ranked" : "aw-status--pending"}`}>{r.follow ? "Follow" : "Nofollow"}</span>
                    </td>
                    <td className="whitespace-nowrap">{r.firstSeen ? when(r.firstSeen) : "–"}</td>
                    <td>{ai[r.domain] ? <span className="aw-badge">{ai[r.domain]}× in 30 days</span> : <span className="text-muted">–</span>}</td>
                    <td className="text-right">{r.spam > 60 ? <span className="aw-status aw-status--missed">{r.spam}</span> : <span className="aw-num text-[12px] text-muted">{r.spam}</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="px-5 py-5 text-[13px] text-muted">No sites match these filters.</p>
        )}
        {rows.length > shown ? (
          <div className="px-5 py-4">
            <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm" onClick={() => setShown((x) => x + 100)}>
              Next 100
            </button>
          </div>
        ) : null}
      </Card>
    </div>
  );
}

export function ToxicTab(p: TabProps & { brandId: string }) {
  const { data, busy, load } = useDomains(p);
  const [view, setView] = useState<"high" | "check" | "all">("high");
  const [picked, setPicked] = useStash<string[]>(`bldis:${p.brandId}:${p.label}`, []);
  const scored = useMemo(() => (data && data !== "none" ? data.list.rows.map((r) => ({ ...r, risk: riskOf(r) })).sort((a, b) => b.risk.score - a.risk.score) : []), [data]);
  if (data === null) return <Loading />;
  if (data === "none") return <NotLoaded canEdit={p.canEdit} busy={busy} label="Load linking sites" onLoad={() => load(true)} />;
  const high = scored.filter((r) => r.risk.level === "high");
  const check = scored.filter((r) => r.risk.level === "check");
  const safe = scored.length - high.length - check.length;
  const rows = view === "high" ? high : view === "check" ? check : scored.filter((r) => r.risk.level !== "low");
  const file = disavowFile(picked, p.label.replace(/[/?#].*$/, ""), new Date().toISOString().slice(0, 10));
  const toggle = (d: string) => setPicked(picked.includes(d) ? picked.filter((x) => x !== d) : [...picked, d]);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(file);
    } catch (e) {
      p.onError(msg(e));
    }
  };
  const download = () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([file], { type: "text/plain" }));
    a.download = `disavow-${p.label.replace(/[/?#:]+/g, "_")}.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  return (
    <div className="flex flex-col gap-4">
      <StatStrip
        extra={<div className="mt-2"><Stack parts={[{ label: "Safe", value: safe, color: C.pos }, { label: "Check", value: check.length, color: C.warn }, { label: "High risk", value: high.length, color: C.neg }]} /></div>}
        stats={[
          { label: "High-risk sites", value: num(high.length), tone: high.length ? "neg" : "pos", sub: `${num(safe)} safe, ${num(check.length)} to check` },
          { label: "Backlinks from high-risk sites", value: num(high.reduce((a, r) => a + r.backlinks, 0)) },
          { label: "Sites to check", value: num(check.length), tone: check.length ? "warn" : undefined },
          { label: "In your disavow file", value: num(picked.length), sub: "Review before you upload it to Google" },
        ]}
      />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <Card title="Sites to review" action={<Seg label="Risk" value={view} onChange={setView} options={[{ id: "high", label: `High ${high.length}` }, { id: "check", label: `Check ${check.length}` }, { id: "all", label: "Both" }]} />}>
          {rows.length ? (
            <div className="overflow-x-auto">
              <table className="aw-table">
                <thead>
                  <tr>
                    <th className="w-10" />
                    <th>Linking site</th>
                    <th className="text-right">Risk</th>
                    <th>Why it is flagged</th>
                    <th className="text-right">Backlinks</th>
                    <th className="text-right">Authority</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 200).map((r) => (
                    <tr key={r.domain}>
                      <td>
                        <input type="checkbox" checked={picked.includes(r.domain)} onChange={() => toggle(r.domain)} aria-label={`Disavow ${r.domain}`} className="h-4 w-4 accent-[var(--signal)]" />
                      </td>
                      <td className="min-w-48">
                        <SiteLink domain={r.domain} onOpen={p.onOpen} />
                      </td>
                      <td className="text-right">
                        <span className={`aw-status ${r.risk.level === "high" ? "aw-status--missed" : "aw-status--warn"}`}>{r.risk.score}</span>
                      </td>
                      <td>
                        <span className="flex flex-wrap gap-1">
                          {r.risk.reasons.map((x) => (
                            <span key={x} className="aw-tag">
                              {x}
                            </span>
                          ))}
                        </span>
                      </td>
                      <td className="aw-num text-right">{num(r.backlinks)}</td>
                      <td className="aw-num text-right">{r.rank}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="px-5 pb-5 text-[13px] text-muted">No sites at this risk level.</p>
          )}
        </Card>
        <Card
          title="Disavow file"
          action={
            high.length ? (
              <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm" onClick={() => setPicked([...new Set([...picked, ...high.map((r) => r.domain)])])}>
                Add all high risk
              </button>
            ) : undefined
          }
        >
          <div className="flex flex-col gap-3 px-5 pb-5">
            <pre className="max-h-72 overflow-auto rounded-[10px] bg-[var(--aw-surface-2)] p-3 font-mono text-[12px] leading-relaxed whitespace-pre-wrap text-body">{file}</pre>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm" onClick={copy} disabled={!picked.length}>
                Copy file
              </button>
              <button type="button" className="aw-btn aw-btn--primary aw-btn--sm" onClick={download} disabled={!picked.length}>
                Download .txt
              </button>
              {picked.length ? (
                <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm" onClick={() => setPicked([])}>
                  Clear
                </button>
              ) : null}
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

type Near = Record<string, RefDomain[] | null>;

export function NetworkTab(p: TabProps) {
  const { data, busy, load } = useDomains(p);
  const [near, setNear] = useState<Near | null>(() => (p.memo.get("near") as Near) ?? null);
  const [finding, setFinding] = useState(false);
  if (data === null) return <Loading />;
  if (data === "none") return <NotLoaded canEdit={p.canEdit} busy={busy} label="Load linking sites" onLoad={() => load(true)} />;
  const own = data.list.rows;
  const top = own.filter((r) => r.spam <= 60).slice(0, 18);
  const parents = top.slice(0, 8);

  async function find(fresh: boolean) {
    setFinding(true);
    p.onError("");
    try {
      const r = await p.call<{ near: Near }>("near", { sites: parents.map((x) => x.domain), ...(fresh ? { refresh: true } : {}) });
      p.memo.set("near", r.near);
      setNear(r.near);
    } catch (e) {
      p.onError(msg(e));
    } finally {
      setFinding(false);
    }
  }

  // Second ring: strong sites linking to the target's linking sites but not to the target, the most connected first.
  const second = new Map<string, { domain: string; rank: number; via: string[] }>();
  if (near)
    for (const [parent, rows] of Object.entries(near))
      for (const r of rows ?? []) {
        if (own.some((o) => sameSite(o.domain, r.domain)) || sameSite(r.domain, p.label.replace(/[/?#].*$/, ""))) continue;
        const cur = second.get(r.domain) ?? { domain: r.domain, rank: r.rank, via: [] };
        cur.via.push(parent);
        second.set(r.domain, cur);
      }
  const prospects = [...second.values()].sort((a, b) => b.via.length - a.via.length || b.rank - a.rank);
  const ring2 = prospects.slice(0, 14);

  const W = 760;
  const H = 500;
  const cx = W / 2;
  const cy = H / 2;
  const pos = new Map<string, { x: number; y: number }>();
  top.forEach((r, i) => {
    const a = (i / Math.max(1, top.length)) * Math.PI * 2 - Math.PI / 2;
    const rad = i % 2 ? 175 : 150;
    pos.set(r.domain, { x: cx + Math.cos(a) * rad * 1.3, y: cy + Math.sin(a) * rad * 0.9 });
  });
  const short = (d: string) => d.replace(/\.(com|org|net|co|io|edu|gov)$/, "");

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
      <Card title="Link network" action={<span className="text-[12px] text-muted">The {top.length} strongest linking sites</span>}>
        <div className="px-5 pb-5">
          <div className="overflow-hidden rounded-[12px] border border-[var(--aw-rule)] bg-[radial-gradient(var(--aw-rule)_1px,transparent_1px)] [background-size:18px_18px]">
            <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Network of linking sites">
              {top.map((r) => {
                const q = pos.get(r.domain)!;
                return <line key={`l${r.domain}`} x1={cx} y1={cy} x2={q.x} y2={q.y} stroke={C.signal} strokeOpacity={0.12 + r.rank / 400} strokeWidth={1 + Math.min(5, Math.log2(1 + r.backlinks))} />;
              })}
              {ring2.map((s, i) => {
                const parent = pos.get(s.via[0]);
                if (!parent) return null;
                const a = Math.atan2(parent.y - cy, parent.x - cx) + (i % 2 ? 0.14 : -0.14);
                const x = Math.min(W - 40, Math.max(40, cx + Math.cos(a) * 350));
                const y = Math.min(H - 20, Math.max(20, cy + Math.sin(a) * 235));
                pos.set(`2:${s.domain}`, { x, y });
                return <line key={`m${s.domain}`} x1={parent.x} y1={parent.y} x2={x} y2={y} stroke="var(--aw-muted)" strokeDasharray="3 3" strokeOpacity="0.6" />;
              })}
              {top.map((r) => {
                const q = pos.get(r.domain)!;
                const size = 7 + r.rank / 10;
                return (
                  <g key={r.domain} className="cursor-pointer" onClick={() => p.onOpen(r.domain, "domain")}>
                    <title>{`${r.domain}: authority ${r.rank}, ${num(r.backlinks)} backlinks`}</title>
                    <circle cx={q.x} cy={q.y} r={size} fill={r.rank >= 80 ? C.signal : C.sky} stroke="white" strokeWidth="2" />
                    <text x={q.x} y={q.y + size + 13} textAnchor="middle" fill="var(--aw-body)" style={{ font: "11px Inter, system-ui, sans-serif" }}>
                      {short(r.domain)}
                    </text>
                  </g>
                );
              })}
              {ring2.map((s) => {
                const q = pos.get(`2:${s.domain}`);
                if (!q) return null;
                return (
                  <g key={`n${s.domain}`} className="cursor-pointer" onClick={() => p.onOpen(s.domain, "domain")}>
                    <title>{`${s.domain} links to ${s.via.join(", ")}, not to you`}</title>
                    <circle cx={q.x} cy={q.y} r="7" fill="white" stroke={C.orange} strokeWidth="2" strokeDasharray="2 2" />
                    <text x={q.x} y={q.y - 11} textAnchor="middle" fill="var(--aw-muted)" style={{ font: "10.5px Inter, system-ui, sans-serif" }}>
                      {short(s.domain)}
                    </text>
                  </g>
                );
              })}
              <circle cx={cx} cy={cy} r="30" fill={C.signal} />
              <text x={cx} y={cy + 5} textAnchor="middle" fill="white" style={{ font: "600 13px Inter, system-ui, sans-serif" }}>
                {p.isOwn ? "You" : short(p.label.replace(/[/?#].*$/, "")).slice(0, 10)}
              </text>
            </svg>
          </div>
          <div className="mt-3 flex flex-wrap gap-4 text-[12px] text-body">
            <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: C.signal }} />Authority 80+</span>
            <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: C.sky }} />Linking site</span>
            <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-full border-2 border-dashed" style={{ borderColor: C.orange }} />Links to your linking sites, not to you</span>
          </div>
        </div>
      </Card>
      <Card title="Second-tier prospects">
        <div className="flex flex-col gap-3 px-5 pb-5">
          {!near ? (
            <>
              <span className="text-[13px] text-body">Strong sites that link to your {parents.length} strongest linking sites and not to you.</span>
              {p.canEdit ? (
                <button type="button" className="aw-btn aw-btn--primary aw-btn--sm self-start" onClick={() => find(false)} disabled={finding || !parents.length}>
                  {finding ? "Finding" : "Find second-tier sites"}
                </button>
              ) : null}
            </>
          ) : prospects.length ? (
            <ul className="flex flex-col">
              {prospects.slice(0, 30).map((s) => (
                <li key={s.domain} className="flex flex-wrap items-center gap-3 border-t border-[var(--aw-rule)] py-2 first:border-t-0">
                  <span className="min-w-0 flex-1">
                    <SiteLink domain={s.domain} sub={`Links to ${s.via.slice(0, 3).join(", ")}`} onOpen={p.onOpen} />
                  </span>
                  <span className="aw-num text-[13px] text-body">{s.rank}</span>
                </li>
              ))}
            </ul>
          ) : (
            <span className="text-[13px] text-muted">No second-tier sites found.</span>
          )}
          {near ? (
            <div className="flex items-center gap-2 text-[12px] text-muted">
              <Fav domain={parents[0]?.domain ?? ""} size={12} />
              <span>From the links of {parents.length} sites</span>
              {p.canEdit ? (
                <button type="button" className="aw-text-link" onClick={() => find(true)} disabled={finding}>
                  {finding ? "Refreshing" : "Refresh"}
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </Card>
    </div>
  );
}
