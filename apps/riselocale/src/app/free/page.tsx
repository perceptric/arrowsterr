import Link from "next/link";
import FreeScan from "@/components/FreeScan";

export const metadata = { title: "Free local rank scan | RiseLocale" };
export const dynamic = "force-dynamic";

export default function Free() {
  return (
    <>
      <header className="topbar">
        <div className="wrap">
          <Link href="/" className="wordmark">
            RiseLocale
          </Link>
          <nav className="nav" />
          <Link className="rl-btn rl-btn--secondary rl-btn--sm" href="/login">
            Sign in
          </Link>
        </div>
      </header>
      <main className="wrap page">
        <h1 className="rl-display">Free 5×5 rank scan</h1>
        <p className="muted" style={{ maxWidth: 560 }}>
          25 pins, 1 mile apart, around your business. See your Google Maps, Local Pack and organic rank at each one.
        </p>
        <FreeScan />
      </main>
    </>
  );
}
