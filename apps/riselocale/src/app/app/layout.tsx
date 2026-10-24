import Link from "next/link";
import { requireCtx } from "@/lib/auth";
import { unreadAlerts } from "@/lib/queries";
import { logout } from "../actions";
import Nav from "./Nav";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireCtx();
  const unread = await unreadAlerts(ctx.workspace.id);
  return (
    <>
      <header className="topbar">
        <div className="wrap">
          <Link href="/app" className="wordmark">
            RiseLocale
          </Link>
          <Nav unread={unread} />
          <div className="right">
            <span className="credits" title={`Resets ${new Date(ctx.workspace.credits_reset_at).toLocaleDateString()}`}>
              {ctx.workspace.credits.toLocaleString()} credits
            </span>
            <form action={logout}>
              <button className="rl-btn rl-btn--secondary rl-btn--sm">Sign out</button>
            </form>
          </div>
        </div>
      </header>
      <main className="wrap">{children}</main>
    </>
  );
}
