"use client";

import { useCallback, useEffect, useState } from "react";
import { BULK_MAX, spamLevel, type BulkRow, type Month } from "@/lib/backlinks";
import { useStash } from "@/lib/stash";
import { Card, Seg } from "../ui";
import { LineChart, SERIES, short } from "./charts";
import { CsvButton, Fav, Loading, msg, num, Updated, type Call, type Open } from "./shared";

// Up to 200 sites or pages side by side, and a year of linking sites and authority for up to 5 of them.

const SPAM_CLASS = { low: "aw-status--ranked", medium: "aw-status--warn", high: "aw-status--missed" } as const;
const bare = (x: string) => x.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/+$/, "");
const hostOf = (x: string) => bare(x).replace(/[/?#].*$/, "");
type Hist = Record<string, Month[] | null>;

export function CompareTab({ brandId, own, peers, call, canEdit, onError, onOpen }: { brandId: string; own: string; peers: string[]; call: Call; canEdit: boolean; onError: (e: string) => void; onOpen: Open }) {
  const [text, setText] = useStash<string>(`blc:${brandId}:q`, "");
  const [result, setResult] = useStash<{ rows: BulkRow[]; at: string; skipped: number } | null>(`blc:${brandId}:result`, null);
  const [hist, setHist] = useStash<Hist | null>(`blc:${brandId}:hist`, null);
  const [metric, setMetric] = useState<"growth" | "domains" | "rank">("growth");
  const [busy, setBusy] = useState(false);
  const [histBusy, setHistBusy] = useState(false);
  const lines = text.split(/[\n,]+/).map((x) => x.trim()).filter(Boolean);
  const over = lines.length > BULK_MAX;

  // Start with the brand and its competitors.
  useEffect(() => {
    if (!text.trim() || text.trim() === own) setText([own, ...peers].join("\n"));
  }, [own, peers]); // eslint-disable-line react-hooks/exhaustive-deps

  /** The sites on the chart: the brand first when it's in the list, then the biggest. */
  const charted = useCallback(
    (rows: BulkRow[]) => {
      const sites = [...new Set(rows.map((r) => hostOf(r.target)))];
      return [...sites.filter((s) => s === own), ...sites.filter((s) => s !== own)].slice(0, 5);
    },
    [own],
  );

  const loadHistory = useCallback(
    async (rows: BulkRow[], live: boolean) => {
      const targets = charted(rows);
      if (!targets.length) return;
      setHistBusy(true);
      try {
        const r = await call<{ history: Hist }>("history", { targets, ...(live ? {} : { peek: true }) });
        setHist(r.history);
      } catch (e) {
        onError(msg(e));
      } finally {
        setHistBusy(false);
      }
    },
    [call, charted, onError, setHist],
  );

  async function run(fresh: boolean) {
    setBusy(true);
    onError("");
    try {
      const r = await call<{ bulk?: { rows: BulkRow[]; at: string }; skipped?: number; notSaved?: boolean }>("bulk", { targets: lines, ...(fresh ? { refresh: true } : {}) });
      if (r.notSaved || !r.bulk) onError("Not loaded yet. Ask an editor to run this comparison.");
      else {
        setResult({ ...r.bulk, skipped: r.skipped ?? 0 });
        loadHistory(r.bulk.rows, true);
      }
    } catch (e) {
      onError(msg(e));
    } finally {
      setBusy(false);
    }
  }

  const rows = result?.rows ?? [];
  const top = Math.max(1, ...rows.map((r) => r.domains));
  const mine = (t: string) => bare(t) === own;
  const lined = hist ? Object.entries(hist).filter((e): e is [string, Month[]] => Array.isArray(e[1]) && e[1].length > 1) : [];
  const labels = lined.length ? lined.reduce((a, b) => (b[1].length > a[1].length ? b : a))[1].map((m) => new Date(m.date).toLocaleDateString("en-US", { month: "short", timeZone: "UTC" })) : [];
  const ordered = [...lined.filter(([k]) => k === own), ...lined.filter(([k]) => k !== own)];
  const color = (site: string) => SERIES[Math.max(0, ordered.findIndex(([k]) => k === site))] ?? SERIES[0];
  const series = ordered.map(([site, months]) => {
    const tail = months.slice(-labels.length);
    const base = tail[0]?.domains || 1;
    return { name: site, color: color(site), width: site === own ? 3 : 2, values: tail.map((m) => (metric === "growth" ? Math.round((m.domains / base) * 100) : metric === "domains" ? m.domains : m.rank)) };
  });

  return (
    <div className="flex flex-col gap-4">
      <form
        className="aw-frame flex flex-col gap-3 p-3"
        onSubmit={(e) => {
          e.preventDefault();
          run(false);
        }}
      >
        <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder={"competitor.com\nblog.competitor.com\ncompetitor.com/pricing"} rows={6} aria-label="Sites or pages, one per line" className="aw-textarea w-full resize-y font-mono text-[14px]" />
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

      {busy ? <Loading text={`Reading links for ${lines.length} ${lines.length === 1 ? "site" : "sites"}`} /> : null}

      {!busy && result ? (
        <>
          {series.length ? (
            <Card
              title={metric === "growth" ? "Growth over the year" : metric === "domains" ? "Linking sites by month" : "Authority by month"}
              action={<Seg label="Compare metric" value={metric} onChange={setMetric} options={[{ id: "growth", label: "Growth" }, { id: "domains", label: "Linking sites" }, { id: "rank", label: "Authority" }]} />}
            >
              <div className="flex flex-col gap-3 px-5 pb-5">
                {metric === "growth" ? <span className="text-[12px] text-muted">Linking sites, the first month set to 100, so big and small sites share one scale</span> : null}
                <LineChart series={series} labels={labels} width={1200} height={300} fmt={metric === "growth" ? (v) => String(Math.round(v)) : short} every={2} label="Linking sites over time" />
                <span className="flex flex-wrap gap-4 text-[12px] text-body">
                  {series.map((s) => (
                    <span key={s.name} className="flex items-center gap-1.5">
                      <span className="inline-block h-2.5 w-2.5 rounded-[3px]" style={{ background: s.color }} />
                      {s.name}
                    </span>
                  ))}
                </span>
              </div>
            </Card>
          ) : histBusy ? (
            <Loading text="Reading a year of history" />
          ) : canEdit && rows.length ? (
            <div>
              <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm" onClick={() => loadHistory(rows, true)}>
                Show a year of history
              </button>
            </div>
          ) : null}
          <Card
            title={`${num(rows.length)} ${rows.length === 1 ? "site" : "sites"}`}
            action={
              <span className="flex flex-wrap items-center gap-3">
                <CsvButton name="backlinks-compare.csv" head={["site", "authority", "linking sites", "backlinks", "nofollow sites", "spam"]} rows={rows.map((r) => [r.target, r.rank, r.domains, r.backlinks, r.nofollowDomains, r.spam ?? ""])} />
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
                    const onChart = series.some((s) => s.name === hostOf(r.target)) && !page;
                    return (
                      <tr key={r.target} className={mine(r.target) ? "bg-[var(--aw-brand-pale)]" : undefined}>
                        <td className="min-w-48">
                          <span className="flex min-w-0 flex-wrap items-center gap-2">
                            {onChart ? <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: color(hostOf(r.target)) }} /> : null}
                            <Fav domain={hostOf(r.target)} />
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
                              <span className="block h-full rounded-full" style={{ width: `${Math.max(1, (r.domains / top) * 100)}%`, background: mine(r.target) ? "var(--signal)" : "var(--aw-muted)" }} />
                            </span>
                            <span className="aw-num w-16 text-right text-ink">{short(r.domains)}</span>
                          </span>
                        </td>
                        <td className="aw-num text-right">{short(r.backlinks)}</td>
                        <td className="aw-num text-right">{r.domains ? `${Math.round((r.nofollowDomains / r.domains) * 100)}%` : "–"}</td>
                        <td className="text-right">{level ? <span className={`aw-status ${SPAM_CLASS[level]}`}>{r.spam}</span> : <span className="text-muted">–</span>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      ) : null}
    </div>
  );
}
