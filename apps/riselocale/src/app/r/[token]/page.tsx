import { notFound } from "next/navigation";
import ScanView from "@/components/ScanView";
import { row } from "@/lib/db";
import { loadView, scanByToken } from "@/lib/view";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false } };

type Brand = { name: string; report_name: string; report_logo_url: string; report_color: string; report_footer: string };

export default async function Report({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const scan = await scanByToken(token);
  if (!scan?.workspace_id) notFound();
  const brand = await row<Brand>("select name, report_name, report_logo_url, report_color, report_footer from workspaces where id = $1", [scan.workspace_id]);
  const data = await loadView(scan);
  const accent = brand?.report_color && /^#[0-9a-f]{6}$/i.test(brand.report_color) ? brand.report_color : null;
  return (
    <main className="wrap" style={accent ? ({ "--brand-base": accent } as React.CSSProperties) : undefined}>
      <header className="report-head">
        {brand?.report_logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={brand.report_logo_url} alt={brand.report_name || brand.name} />
        ) : (
          <span className="report-brand">{brand?.report_name || brand?.name}</span>
        )}
        <span className="small muted mono">{new Date(scan.created_at).toLocaleDateString()}</span>
      </header>
      <div className="page-head" style={{ paddingTop: 24 }}>
        <h1 className="page-title">
          {scan.target.name}
          <span>Local ranking report for &ldquo;{scan.keyword}&rdquo;</span>
        </h1>
      </div>
      <ScanView initial={data} pollUrl={`/api/scans/${scan.id}?t=${token}`} mode="report" />
      {brand?.report_footer && <footer className="report-foot">{brand.report_footer}</footer>}
    </main>
  );
}
