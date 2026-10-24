import Link from "next/link";
import ActionButton from "@/components/ActionButton";
import { requireCtx } from "@/lib/auth";
import { alerts } from "@/lib/queries";
import { markAlertsRead } from "../../actions";

export default async function Alerts() {
  const ctx = await requireCtx();
  const list = await alerts(ctx.workspace.id);
  const unread = list.some((a) => !a.read_at);
  return (
    <div className="page">
      <div className="page-head">
        <h1 className="page-title">
          Alerts<span>Recurring scans raise an alert when the average rank falls by more than 2, a top 3 pin is lost or Local Pack pins drop.</span>
        </h1>
        {unread && <ActionButton label="Mark all read" run={markAlertsRead} />}
      </div>
      {list.length ? (
        <div className="panel table-wrap">
          <table className="list">
            <tbody>
              {list.map((a) => (
                <tr key={a.id}>
                  <td style={{ width: 1 }}>{!a.read_at ? <span className="rl-tag rl-tag--brand">New</span> : <span className="rl-tag">Read</span>}</td>
                  <td>
                    <div>{a.message}</div>
                    <div className="small muted">{a.business_name ?? ""}</div>
                  </td>
                  <td className="num small">{new Date(a.created_at).toLocaleString()}</td>
                  <td style={{ width: 1 }}>
                    {a.scan_id && (
                      <Link className="rl-btn rl-btn--secondary rl-btn--sm" href={`/app/scans/${a.scan_id}`}>
                        Open
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="panel empty">
          <h2>No alerts</h2>
          <p className="small muted">Set a scan to run daily, weekly or monthly to get alerts.</p>
        </div>
      )}
    </div>
  );
}
