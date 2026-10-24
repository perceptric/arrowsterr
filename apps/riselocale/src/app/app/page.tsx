import Link from "next/link";
import { requireCtx } from "@/lib/auth";
import { recentScans } from "@/lib/queries";
import ScanCards from "./ScanCards";

const TABS = [
  { id: "all", label: "All" },
  { id: "once", label: "One-time" },
  { id: "recurring", label: "Recurring" },
] as const;

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  const ctx = await requireCtx();
  const show = ((await searchParams).show ?? "all") as "all" | "once" | "recurring";
  const kind = TABS.some((t) => t.id === show) ? show : "all";
  const scans = await recentScans(ctx.workspace.id, kind);
  return (
    <div className="page">
      <div className="page-head">
        <h1 className="page-title">Scans</h1>
        <div className="actions">
          <div className="tabs">
            {TABS.map((t) => (
              <Link key={t.id} href={t.id === "all" ? "/app" : `/app?show=${t.id}`} aria-current={kind === t.id}>
                {t.label}
              </Link>
            ))}
          </div>
          <Link className="rl-btn rl-btn--primary" href="/app/scans/new">
            New scan
          </Link>
        </div>
      </div>
      {scans.length ? (
        <ScanCards scans={scans} />
      ) : (
        <div className="panel empty">
          <h2>Run your first scan</h2>
          <p className="small muted">Pick a business, a keyword and a grid. Ranks fill in pin by pin.</p>
          <Link className="rl-btn rl-btn--primary" href="/app/scans/new">
            New scan
          </Link>
        </div>
      )}
    </div>
  );
}
