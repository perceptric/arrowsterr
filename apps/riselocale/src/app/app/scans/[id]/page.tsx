import Link from "next/link";
import { notFound } from "next/navigation";
import ActionButton from "@/components/ActionButton";
import ConfirmButton from "@/components/ConfirmButton";
import CopyLink from "@/components/CopyLink";
import ScanView from "@/components/ScanView";
import { canEdit, requireCtx } from "@/lib/auth";
import { loadView, scanById } from "@/lib/view";
import { deleteScan, newShareLink, rerunScan } from "../../../actions";

export default async function ScanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireCtx();
  const scan = await scanById(id);
  if (!scan || scan.workspace_id !== ctx.workspace.id) notFound();
  const data = await loadView(scan);
  const edit = canEdit(ctx);
  const finished = !["queued", "running"].includes(scan.status);
  return (
    <>
      <div className="page-head" style={{ paddingTop: 40 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {scan.business_id && (
            <Link href={`/app/businesses/${scan.business_id}`} className="back">
              ← {scan.target.name}
            </Link>
          )}
          <h1 className="page-title">
            &ldquo;{scan.keyword}&rdquo;
            <span>
              {scan.target.name}
              {scan.schedule_id ? ", recurring" : ""}
              {scan.demo ? ", demo data" : ""}
            </span>
          </h1>
        </div>
        <div className="actions no-print">
          {scan.share_token && <CopyLink url={`/r/${scan.share_token}`} label="Copy report link" />}
          {scan.share_token && (
            <a className="rl-btn rl-btn--secondary rl-btn--sm" href={`/r/${scan.share_token}`} target="_blank" rel="noopener">
              Open report
            </a>
          )}
          {edit && <ActionButton label="New link" run={newShareLink.bind(null, scan.id)} />}
          {edit && finished && scan.business_id && <ActionButton label="Run again" run={rerunScan.bind(null, scan.id)} />}
          {edit && scan.business_id && (
            <Link className="rl-btn rl-btn--secondary rl-btn--sm" href={`/app/scans/new?from=${scan.id}`}>
              Edit and run
            </Link>
          )}
          {edit && <ConfirmButton label="Delete" ask="Delete this scan?" run={deleteScan.bind(null, scan.id)} danger />}
        </div>
      </div>
      <ScanView initial={data} pollUrl={`/api/scans/${scan.id}`} mode="app" />
    </>
  );
}
