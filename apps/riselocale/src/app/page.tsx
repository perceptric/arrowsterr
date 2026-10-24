import Link from "next/link";
import { getCtx } from "@/lib/auth";

export default async function Home() {
  const ctx = await getCtx();
  return (
    <>
      <header className="topbar">
        <div className="wrap">
          <Link href="/" className="wordmark">
            RiseLocale
          </Link>
          <nav className="nav" />
          <div className="right">
            {ctx ? (
              <Link className="rl-btn rl-btn--primary rl-btn--sm" href="/app">
                Open the app
              </Link>
            ) : (
              <>
                <Link className="rl-btn rl-btn--secondary rl-btn--sm" href="/login">
                  Sign in
                </Link>
                <Link className="rl-btn rl-btn--primary rl-btn--sm" href="/signup">
                  Start free
                </Link>
              </>
            )}
          </div>
        </div>
      </header>
      <main className="wrap">
        <section className="hero">
          <h1 className="rl-display">See where you rank on every street</h1>
          <p>
            Track your <b>Google Maps</b>, <b>Local Pack</b> and <b>organic</b> ranks on a grid of up to 441 pins, or across your whole service area.
          </p>
          <div className="actions">
            <Link className="rl-btn rl-btn--primary" href="/free">
              Run a free 5×5 scan
            </Link>
            <Link className="rl-btn rl-btn--secondary" href="/signup">
              Create an account
            </Link>
          </div>
        </section>
        <section className="features">
          <div className="rl-card rl-card--feature">
            <span className="rl-tag rl-tag--brand">3×3 to 21×21</span>
            <h2 className="rl-card__title">Grid and service area scans</h2>
          </div>
          <div className="rl-card rl-card--feature">
            <span className="rl-tag rl-tag--brand">3 ranks a pin</span>
            <h2 className="rl-card__title">Maps, Local Pack and organic, kept apart</h2>
          </div>
          <div className="rl-card rl-card--feature">
            <span className="rl-tag rl-tag--brand">Top 20</span>
            <h2 className="rl-card__title">Competitors at every pin</h2>
          </div>
          <div className="rl-card rl-card--feature">
            <span className="rl-tag rl-tag--brand">Daily, weekly, monthly</span>
            <h2 className="rl-card__title">Alerts and white-label reports</h2>
          </div>
        </section>
      </main>
    </>
  );
}
