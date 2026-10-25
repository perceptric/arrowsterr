"use client";

import { useEffect, useState } from "react";
import { BrandLogo } from "./BrandLogo";
import { Dropdown } from "./Pickers";
import { favicon } from "./ui";

type Ga4 = { email: string; property: string | null; name: string | null };
/** A brand's analytics link, as /api/ga4 reports it. */
export type SiteStatus = {
  connected: boolean;
  source?: "ga4";
  domain?: string;
  live?: boolean;
  ga4?: Ga4 | null;
};
type Status = SiteStatus;

/** Connect Google Analytics 4: sign in with Google, then pick the property for this brand. */
export function Ga4Connect({ status, canEdit, call, onDone }: { status: Status; canEdit: boolean; call: (path: string, body: Record<string, unknown>) => Promise<Record<string, unknown>>; onDone: () => void }) {
  const [props, setProps] = useState<{ id: string; name: string; account: string }[] | null>(null);
  const [pick, setPick] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const signedIn = Boolean(status.ga4?.email);

  useEffect(() => {
    if (!signedIn || !canEdit) return;
    let live = true;
    call("/api/ga4", { action: "properties" })
      .then((d) => {
        if (!live) return;
        const list = (d.properties as { id: string; name: string; account: string }[]) ?? [];
        setProps(list);
        setPick(list[0]?.id ?? "");
      })
      .catch((e) => live && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      live = false;
    };
  }, [signedIn, canEdit, call]);

  async function signIn() {
    setBusy(true);
    setError("");
    try {
      const d = await call("/api/google/connect", { back: window.location.pathname });
      window.location.href = String(d.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }
  async function choose() {
    setBusy(true);
    setError("");
    try {
      await call("/api/ga4", { action: "select", property: pick });
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="aw-frame flex flex-col gap-4 p-6">
      <div className="flex items-center gap-3">
        <BrandLogo src={favicon("analytics.google.com")} name="Google Analytics" size={28} />
        <div className="flex flex-col">
          <span className="text-[16px] font-medium text-ink">Google Analytics 4</span>
          <span className="text-[13px] text-body">{signedIn ? `Signed in as ${status.ga4!.email}` : "Use the analytics you already have. Visits from AI, landing pages and conversions in one click."}</span>
        </div>
      </div>
      {error ? <p className="aw-error">{error}</p> : null}
      {!canEdit ? (
        <p className="aw-small">Ask an editor to connect Google Analytics.</p>
      ) : !signedIn ? (
        <div>
          <button type="button" className="aw-btn aw-btn--accent" onClick={signIn} disabled={busy}>
            {busy ? "Opening Google..." : "Connect Google Analytics"}
          </button>
        </div>
      ) : props === null ? (
        <p className="aw-small">Loading your properties...</p>
      ) : props.length ? (
        <div className="flex flex-wrap items-center gap-2">
          <Dropdown label="GA4 property" value={pick} onChange={setPick} className="aw-dropdown--field h-11! min-w-72" options={props.map((p) => ({ id: p.id, label: `${p.name} · ${p.account}` }))} />
          <button type="button" className="aw-btn aw-btn--primary h-11! py-0!" onClick={choose} disabled={busy || !pick}>
            Use this property
          </button>
        </div>
      ) : (
        <p className="aw-small">No GA4 properties on this Google account.</p>
      )}
    </section>
  );
}
