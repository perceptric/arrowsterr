"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import type { ViewPin, ViewScan } from "@/lib/view";
import { band, type Competitor } from "@/lib/metrics";
import { listingKey, isTarget } from "@/lib/match";
import { pinChange } from "@/lib/compare";
import { describeConfig } from "@/lib/geo";
import type { MapPin } from "./MapView";

const MapView = dynamic(() => import("./MapView"), { ssr: false, loading: () => <div className="map" /> });

type Layer = "maps" | "pack" | "organic" | "change";
const LAYERS: { id: Layer; label: string }[] = [
  { id: "maps", label: "Maps" },
  { id: "pack", label: "Local Pack" },
  { id: "organic", label: "Organic" },
  { id: "change", label: "Change" },
];

const open = (s: ViewScan["status"]) => s === "queued" || s === "running";
const fmt = (n: number | null | undefined) => (n == null ? "–" : String(n));

export default function ScanView({ initial, pollUrl, mode }: { initial: { scan: ViewScan; pins: ViewPin[] }; pollUrl: string; mode: "app" | "free" | "report" }) {
  const router = useRouter();
  const [data, setData] = useState(initial);
  const [layer, setLayer] = useState<Layer>("maps");
  const [selected, setSelected] = useState<number | null>(null);
  const [rival, setRival] = useState<string | null>(null);
  const { scan, pins } = data;

  useEffect(() => {
    if (!open(scan.status)) return;
    const t = setInterval(async () => {
      try {
        const res = await fetch(pollUrl, { cache: "no-store" });
        if (!res.ok) return;
        const next = await res.json();
        setData(next);
        // Refresh the server parts of the page (buttons, credits) once the scan closes.
        if (!open(next.scan.status)) router.refresh();
      } catch {
        // offline for a moment: try again next round
      }
    }, 4000);
    return () => clearInterval(t);
  }, [pollUrl, scan.status, router]);

  const done = pins.filter((p) => p.mapsDone || p.failed).length;
  const s = scan.summary;
  const prev = scan.prev?.summary ?? null;
  const rivalName = rival ? s?.competitors.find((c) => c.key === rival)?.name : null;

  const mapPins: MapPin[] = useMemo(
    () =>
      pins.map((p) => {
        if (rival) {
          if (!p.mapsDone) return { ...p, label: "", cls: "wait" };
          const r = p.mapsTop.find((l) => listingKey(l) === rival)?.rank ?? null;
          return { ...p, label: r == null ? "20+" : String(r), cls: `b-${band(r)}`, title: `${rivalName}: ${r ?? "not in top 20"}` };
        }
        if (layer === "change") {
          const d = p.mapsDone ? pinChange(p.prev, p.maps) : null;
          if (d == null) return { ...p, label: "", cls: "wait", title: "No earlier scan for this pin" };
          return { ...p, label: d > 0 ? `+${d}` : String(d), cls: d > 0 ? "delta-pos" : d < 0 ? "delta-neg" : "delta-zero", title: `Was ${fmt(p.prev ?? null)}, now ${fmt(p.maps)}` };
        }
        if (layer === "maps") {
          if (p.failed) return { ...p, label: "!", cls: "b-none", title: "This pin's search failed" };
          if (!p.mapsDone) return { ...p, label: "", cls: "wait" };
          return { ...p, label: p.maps == null ? "20+" : String(p.maps), cls: `b-${band(p.maps)}`, title: `Maps rank ${p.maps ?? "not in top 20"}` };
        }
        if (!p.organicDone) return { ...p, label: "", cls: "wait" };
        const r = layer === "pack" ? p.pack : p.organic;
        if (layer === "pack") return { ...p, label: r == null ? "–" : String(r), cls: r == null ? "b-none" : "b-top", title: r == null ? "Not in the Local Pack" : `Local Pack spot ${r}` };
        return { ...p, label: r == null ? "20+" : String(r), cls: `b-${band(r)}`, title: `Organic rank ${r ?? "not in top 20"}` };
      }),
    [pins, layer, rival, rivalName],
  );

  const pin = selected != null ? pins.find((p) => p.idx === selected) : null;
  const delta = (cur: number | null | undefined, was: number | null | undefined, lowerIsBetter = true) => {
    if (cur == null || was == null || cur === was) return null;
    const better = lowerIsBetter ? cur < was : cur > was;
    const diff = Math.round(Math.abs(cur - was) * 10) / 10;
    return <span className={better ? "delta-up" : "delta-down"}>{`${better ? "▲" : "▼"} ${diff}`}</span>;
  };

  return (
    <div className="page" style={{ paddingTop: mode === "report" ? 24 : undefined }}>
      {open(scan.status) && (
        <div className="panel panel-body" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div className="small">
            Scanning {done} of {scan.pinsTotal} pins. Results fill in as each pin finishes.
          </div>
          <div className="progress">
            <i style={{ width: `${Math.round((done / Math.max(scan.pinsTotal, 1)) * 100)}%` }} />
          </div>
        </div>
      )}
      {scan.status === "failed" && <div className="panel panel-body error">This scan failed{scan.error ? `: ${scan.error}` : "."}</div>}
      {scan.status === "partial" && <div className="panel panel-body small muted">Some pins failed and are left out of the numbers. Their credits were returned.</div>}

      {s && (
        <div className="metrics">
          <div className="metric">
            <span className="v">{fmt(s.maps.avg_all)}</span>
            <span className="l">Avg Maps rank {delta(s.maps.avg_all, prev?.maps.avg_all)}</span>
          </div>
          <div className="metric">
            <span className="v">{fmt(s.maps.avg_found)}</span>
            <span className="l">Avg where found</span>
          </div>
          <div className="metric">
            <span className="v">
              {s.maps.top3}/{s.maps.done}
            </span>
            <span className="l">Top 3 pins {delta(s.maps.top3, prev?.maps.top3, false)}</span>
          </div>
          <div className="metric">
            <span className="v">{s.maps.solv}%</span>
            <span className="l">Share of local voice</span>
          </div>
          <div className="metric">
            <span className="v">{s.pack.share}%</span>
            <span className="l">In the Local Pack</span>
          </div>
          <div className="metric">
            <span className="v">{fmt(s.organic.avg_found)}</span>
            <span className="l">Avg organic rank</span>
          </div>
        </div>
      )}

      <div className="scan-layout">
        <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
          <div className="map-tools no-print">
            <div className="tabs" role="group" aria-label="Rank layer">
              {LAYERS.filter((l) => l.id !== "change" || scan.prev).map((l) => (
                <button
                  key={l.id}
                  type="button"
                  aria-pressed={!rival && layer === l.id}
                  onClick={() => {
                    setRival(null);
                    setLayer(l.id);
                  }}
                >
                  {l.label}
                </button>
              ))}
            </div>
            {rival && (
              <button type="button" className="rl-btn rl-btn--secondary rl-btn--sm" onClick={() => setRival(null)}>
                Showing {rivalName}. Back to {scan.target.name}
              </button>
            )}
          </div>
          <MapView center={scan.target} business={scan.target} pins={mapPins} spacingM={scan.config.spacing_m} selected={selected} onPinClick={(i) => setSelected(i === selected ? null : i)} label={`Rank map for ${scan.keyword}`} />
          <Legend layer={rival ? "maps" : layer} />
        </div>

        <aside className="side">
          {pin ? (
            <PinPanel pin={pin} scan={scan} onClose={() => setSelected(null)} />
          ) : (
            <div className="panel">
              <div className="panel-head">
                <h2>Scan</h2>
              </div>
              <div className="panel-body small" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div>
                  <b>{scan.target.name}</b>
                </div>
                <div className="muted">&ldquo;{scan.keyword}&rdquo;</div>
                <div className="muted">{describeConfig(scan.config)}</div>
                <div className="muted mono">{new Date(scan.createdAt).toLocaleString()}</div>
                <div className="muted">Select a pin to see who ranks there.</div>
              </div>
            </div>
          )}
          {scan.history.length >= 2 && <History scan={scan} />}
        </aside>
      </div>

      {s && s.competitors.length > 0 && <Competitors list={s.competitors} selected={rival} onPick={(k) => setRival(k === rival ? null : k)} total={s.maps.done} />}
    </div>
  );
}

function Legend({ layer }: { layer: Layer }) {
  if (layer === "change")
    return (
      <div className="rl-legend">
        <span>
          <i className="b-top" />
          Moved up
        </span>
        <span>
          <i className="b-none" />
          No change
        </span>
        <span>
          <i className="b-out" />
          Moved down
        </span>
      </div>
    );
  if (layer === "pack")
    return (
      <div className="rl-legend">
        <span>
          <i className="b-top" />
          In the Local Pack (spot 1 to 3)
        </span>
        <span>
          <i className="b-none" />
          Not in the pack
        </span>
      </div>
    );
  return (
    <div className="rl-legend">
      <span>
        <i className="b-top" />
        1–3
      </span>
      <span>
        <i className="b-mid" />
        4–10
      </span>
      <span>
        <i className="b-low" />
        11–20
      </span>
      <span>
        <i className="b-none" />
        Not in top 20
      </span>
    </div>
  );
}

function PinPanel({ pin, scan, onClose }: { pin: ViewPin; scan: ViewScan; onClose: () => void }) {
  return (
    <div className="panel">
      <div className="panel-head">
        <h2>
          Pin {pin.row + 1}, {pin.col + 1}
        </h2>
        <button type="button" className="rl-btn rl-btn--secondary rl-btn--sm" onClick={onClose}>
          Close
        </button>
      </div>
      <div className="panel-body small" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <div className="mono muted">
          {pin.lat.toFixed(5)}, {pin.lng.toFixed(5)}
        </div>
        <div>
          Maps {fmt(pin.maps)} · Local Pack {fmt(pin.pack)} · Organic {fmt(pin.organic)}
        </div>
        {pin.rechecked && pin.firstRank !== pin.maps && (
          <div className="muted">
            Checked twice: the first search said {fmt(pin.firstRank)}, the second said {fmt(pin.maps)}. The second is shown.
          </div>
        )}
        {pin.failed && <div className="error">This pin&apos;s Maps search failed.</div>}
      </div>
      <TopList title="Google Maps" items={pin.mapsTop.map((l) => ({ rank: l.rank, name: l.title, extra: l.reviews != null ? `${l.rating ?? "–"} ★ ${l.reviews}` : "", you: isTarget(l, scan.target) }))} />
      <TopList title="Local Pack" items={pin.packTop.map((l) => ({ rank: l.rank, name: l.title, extra: l.reviews != null ? `${l.rating ?? "–"} ★ ${l.reviews}` : "", you: isTarget(l, scan.target) }))} />
      <TopList title="Organic" items={pin.organicTop.slice(0, 10).map((o) => ({ rank: o.rank, name: o.domain, extra: "", you: Boolean(scan.target.domain) && o.domain.endsWith(scan.target.domain) }))} />
    </div>
  );
}

function TopList({ title, items }: { title: string; items: { rank: number; name: string; extra: string; you: boolean }[] }) {
  return (
    <div style={{ borderTop: "1px solid var(--border-line)" }}>
      <div className="panel-body" style={{ paddingBottom: 4 }}>
        <span className="rl-tag">{title}</span>
      </div>
      {items.length ? (
        <ol className="rank-list">
          {items.map((i) => (
            <li key={`${i.rank}-${i.name}`} className={i.you ? "you" : ""}>
              <span className="r">{i.rank}</span>
              <span className="n" title={i.name}>
                {i.name}
              </span>
              <span className="x">{i.extra}</span>
            </li>
          ))}
        </ol>
      ) : (
        <div className="panel-body small muted">No results yet.</div>
      )}
    </div>
  );
}

function Competitors({ list, selected, onPick, total }: { list: Competitor[]; selected: string | null; onPick: (k: string) => void; total: number }) {
  return (
    <div className="panel">
      <div className="panel-head">
        <h2>Competitors on the map</h2>
        <span className="small muted">Select one to see its ranks on the map</span>
      </div>
      <div className="table-wrap">
        <table className="list">
          <thead>
            <tr>
              <th>Business</th>
              <th className="num">Rating</th>
              <th className="num">Reviews</th>
              <th className="num">Avg rank</th>
              <th className="num">Top 3 pins</th>
              <th className="num">Share of voice</th>
            </tr>
          </thead>
          <tbody>
            {list.map((c) => (
              <tr key={c.key} className={`link ${selected === c.key ? "on" : ""}`} onClick={() => onPick(c.key)} tabIndex={0} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onPick(c.key)}>
                <td>
                  {c.name} {c.is_target && <span className="rl-tag rl-tag--brand">You</span>}
                  {c.category && <div className="small muted">{c.category}</div>}
                </td>
                <td className="num">{c.rating ?? "–"}</td>
                <td className="num">{c.reviews ?? "–"}</td>
                <td className="num">{c.avg}</td>
                <td className="num">
                  {c.top3}/{total}
                </td>
                <td className="num">{c.solv}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function History({ scan }: { scan: ViewScan }) {
  const pts = scan.history.filter((h) => h.avg != null);
  if (pts.length < 2) return null;
  const W = 300;
  const H = 64;
  const max = Math.max(...pts.map((p) => p.avg!), 3);
  const min = Math.min(...pts.map((p) => p.avg!), 1);
  const x = (i: number) => 8 + (i / (pts.length - 1)) * (W - 16);
  // Lower rank is better, so it sits higher on the chart.
  const y = (v: number) => 8 + ((v - min) / Math.max(max - min, 1)) * (H - 24);
  const d = pts.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.avg!).toFixed(1)}`).join(" ");
  const last = pts[pts.length - 1];
  return (
    <div className="panel">
      <div className="panel-head">
        <h2>Avg Maps rank over time</h2>
      </div>
      <div className="panel-body">
        <svg className="spark" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Average rank went from ${pts[0].avg} to ${last.avg} over ${pts.length} scans`}>
          <path className="line" d={d} />
          <circle cx={x(pts.length - 1)} cy={y(last.avg!)} r={3.5} />
          <text x={8} y={H - 2}>
            {new Date(pts[0].createdAt).toLocaleDateString()}
          </text>
          <text x={W - 8} y={H - 2} textAnchor="end">
            {last.avg}
          </text>
        </svg>
      </div>
    </div>
  );
}
