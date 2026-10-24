import Link from "next/link";
import { requireCtx } from "@/lib/auth";
import { businesses } from "@/lib/queries";

export default async function Businesses({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  const ctx = await requireCtx();
  const archived = (await searchParams).show === "archived";
  const list = await businesses(ctx.workspace.id, archived);
  return (
    <div className="page">
      <div className="page-head">
        <h1 className="page-title">Businesses</h1>
        <div className="actions">
          <div className="tabs">
            <Link href="/app/businesses" aria-current={!archived}>
              All businesses
            </Link>
            <Link href="/app/businesses?show=archived" aria-current={archived}>
              Archived
            </Link>
          </div>
          <Link className="rl-btn rl-btn--primary" href="/app/businesses/new">
            Add a business
          </Link>
        </div>
      </div>
      {list.length ? (
        <div className="panel table-wrap">
          <table className="list">
            <thead>
              <tr>
                <th>Business</th>
                <th>Category</th>
                <th className="num">Rating</th>
                <th className="num">Scans</th>
                <th className="num">Last scan</th>
              </tr>
            </thead>
            <tbody>
              {list.map((b) => (
                <tr key={b.id}>
                  <td>
                    <Link href={`/app/businesses/${b.id}`}>{b.name}</Link>
                    <div className="small muted">{b.address || b.domain}</div>
                  </td>
                  <td className="small">{b.category || "–"}</td>
                  <td className="num">{b.rating != null ? `${b.rating} (${b.reviews ?? 0})` : "–"}</td>
                  <td className="num">{b.scans}</td>
                  <td className="num">{b.last_scan ? new Date(b.last_scan).toLocaleDateString() : "–"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="panel empty">
          <h2>{archived ? "No archived businesses" : "Add your first business"}</h2>
          {!archived && (
            <Link className="rl-btn rl-btn--primary" href="/app/businesses/new">
              Add a business
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
