import Link from "next/link";
import { notFound } from "next/navigation";
import ActionButton from "@/components/ActionButton";
import ConfirmButton from "@/components/ConfirmButton";
import { canEdit, requireCtx } from "@/lib/auth";
import { describeConfig } from "@/lib/geo";
import { business, recentScans, schedules } from "@/lib/queries";
import { deleteBusiness, deleteSchedule, setArchived, setSchedule } from "../../../actions";
import ScanCards from "../../ScanCards";

export default async function BusinessPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireCtx();
  const b = await business(ctx.workspace.id, id);
  if (!b) notFound();
  const [scans, scheds] = await Promise.all([recentScans(ctx.workspace.id, "all", { businessId: b.id, limit: 30 }), schedules(ctx.workspace.id, b.id)]);
  const edit = canEdit(ctx);
  return (
    <div className="page">
      <Link href="/app/businesses" className="back">
        ← Businesses
      </Link>
      <div className="page-head">
        <h1 className="page-title">
          {b.name}
          <span>{[b.category, b.address, b.domain].filter(Boolean).join(", ")}</span>
        </h1>
        <div className="actions">
          {edit && (
            <>
              <ActionButton label={b.archived ? "Restore" : "Archive"} run={setArchived.bind(null, b.id, !b.archived)} />
              <ConfirmButton label="Delete" ask="Delete this business and all its scans?" run={deleteBusiness.bind(null, b.id)} danger />
              {!b.archived && (
                <Link className="rl-btn rl-btn--primary" href={`/app/scans/new?business=${b.id}`}>
                  New scan
                </Link>
              )}
            </>
          )}
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <h2>Recurring scans</h2>
        </div>
        {scheds.length ? (
          <div className="table-wrap">
            <table className="list">
              <thead>
                <tr>
                  <th>Keyword</th>
                  <th>Area</th>
                  <th>Runs</th>
                  <th>Next run</th>
                  <th>Report to</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {scheds.map((s) => (
                  <tr key={s.id}>
                    <td>{s.keyword}</td>
                    <td className="small">{describeConfig(s.config)}</td>
                    <td className="small">{s.frequency[0].toUpperCase() + s.frequency.slice(1)}</td>
                    <td className="small mono">{s.active ? new Date(s.next_run_at).toLocaleString() : <span className="rl-tag">Paused</span>}</td>
                    <td className="small">{s.report_to.join(", ") || "–"}</td>
                    <td>
                      {edit && (
                        <div className="actions" style={{ justifyContent: "flex-end" }}>
                          <ActionButton label={s.active ? "Pause" : "Resume"} run={setSchedule.bind(null, s.id, !s.active)} />
                          <ConfirmButton label="Delete" ask="Stop this schedule?" run={deleteSchedule.bind(null, s.id)} danger />
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="panel-body small muted">None yet. Pick Daily, Weekly or Monthly when you start a scan.</div>
        )}
      </div>

      <h2 className="page-title" style={{ fontSize: 20, lineHeight: "28px" }}>
        Scans
      </h2>
      {scans.length ? <ScanCards scans={scans} /> : <div className="panel empty small muted">No scans for this business yet.</div>}
    </div>
  );
}
