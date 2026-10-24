import Link from "next/link";
import ScanForm from "@/components/ScanForm";
import { requireCtx } from "@/lib/auth";
import { row } from "@/lib/db";
import { businesses } from "@/lib/queries";
import type { ScanRow } from "@/lib/scans";

export default async function NewScan({ searchParams }: { searchParams: Promise<{ business?: string; from?: string }> }) {
  const ctx = await requireCtx();
  const sp = await searchParams;
  const list = await businesses(ctx.workspace.id);
  const from = sp.from && /^[0-9a-f-]{36}$/i.test(sp.from) ? await row<ScanRow>("select * from scans where id = $1 and workspace_id = $2", [sp.from, ctx.workspace.id]) : null;
  const initial = from?.business_id ?? (sp.business && list.some((b) => b.id === sp.business) ? sp.business : null);
  return (
    <div className="page">
      <Link href="/app" className="back">
        ← Scans
      </Link>
      <h1 className="page-title">New scan</h1>
      <ScanForm
        businesses={list.map((b) => ({ id: b.id, name: b.name, lat: b.lat, lng: b.lng }))}
        initialBusiness={initial}
        credits={ctx.workspace.credits}
        start={from ? { keyword: from.keyword, config: from.config } : undefined}
      />
    </div>
  );
}
