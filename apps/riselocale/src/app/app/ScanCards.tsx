import Link from "next/link";
import MiniGrid from "@/components/MiniGrid";
import { rows } from "@/lib/db";
import { describeConfig } from "@/lib/geo";
import type { ScanListRow } from "@/lib/queries";

const STATUS: Record<string, { label: string; cls: string }> = {
  queued: { label: "Queued", cls: "" },
  running: { label: "Running", cls: "rl-tag--warning" },
  done: { label: "Completed", cls: "rl-tag--success" },
  partial: { label: "Partial", cls: "rl-tag--warning" },
  failed: { label: "Failed", cls: "rl-tag--danger" },
};

function ago(d: Date) {
  const s = (Date.now() - new Date(d).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export default async function ScanCards({ scans }: { scans: ScanListRow[] }) {
  const small = scans.filter((s) => s.config.shape === "grid" && s.config.size <= 9).map((s) => s.id);
  const pinRows = small.length
    ? await rows<{ scan_id: string; idx: number; maps_rank: number | null; maps_state: string }>("select scan_id, idx, maps_rank, maps_state from pins where scan_id = any($1::uuid[]) order by idx", [small])
    : [];
  const ranks = new Map<string, (number | null | undefined)[]>();
  for (const p of pinRows) {
    const list = ranks.get(p.scan_id) ?? [];
    list.push(p.maps_state === "done" ? p.maps_rank : undefined);
    ranks.set(p.scan_id, list);
  }
  return (
    <div className="scan-cards">
      {scans.map((s) => {
        const st = STATUS[s.status];
        return (
          <Link key={s.id} href={`/app/scans/${s.id}`} className="scan-card">
            <div className="top">
              <h3>{s.business_name ?? s.target.name}</h3>
              <span className={`rl-tag ${st.cls}`}>{st.label}</span>
            </div>
            <div className="kw">{s.keyword}</div>
            {ranks.has(s.id) && s.config.shape === "grid" ? (
              <MiniGrid ranks={ranks.get(s.id)!} size={s.config.size} />
            ) : (
              <div className="small muted">
                {s.summary ? (
                  <>
                    Avg rank <span className="mono">{s.summary.maps.avg_all ?? "–"}</span>, top 3 at <span className="mono">{s.summary.maps.top3}</span> pins
                  </>
                ) : (
                  describeConfig(s.config)
                )}
              </div>
            )}
            <div className="meta">
              <span>{s.pins_total} pins</span>
              <span>{s.schedule_id ? "Recurring" : "One-time"}</span>
              <span>{ago(s.created_at)}</span>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
