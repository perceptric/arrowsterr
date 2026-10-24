import Link from "next/link";
import { notFound } from "next/navigation";
import ScanView from "@/components/ScanView";
import { loadView, scanByToken } from "@/lib/view";

export const dynamic = "force-dynamic";

export default async function FreeResult({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const scan = await scanByToken(token);
  if (!scan || scan.workspace_id) notFound();
  const data = await loadView(scan);
  return (
    <>
      <header className="topbar">
        <div className="wrap">
          <Link href="/" className="wordmark">
            RiseLocale
          </Link>
          <nav className="nav" />
          <Link className="rl-btn rl-btn--primary rl-btn--sm" href="/signup">
            Track it every week
          </Link>
        </div>
      </header>
      <main className="wrap">
        <div className="page-head" style={{ paddingTop: 40 }}>
          <h1 className="page-title">
            {scan.target.name}
            <span>&ldquo;{scan.keyword}&rdquo;, free 5×5 scan</span>
          </h1>
        </div>
        <ScanView initial={data} pollUrl={`/api/scans/${scan.id}?t=${token}`} mode="free" />
      </main>
    </>
  );
}
