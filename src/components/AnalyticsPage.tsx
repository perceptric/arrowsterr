"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { useCallback, useEffect, useState } from "react";
import type { RunAuth } from "@/lib/runner";
import type { View } from "@/lib/view";
import { BrandLogo } from "./BrandLogo";
import { EmptyScreen } from "./Drawing";
import { Dropdown } from "./Pickers";
import { Dashboard, type Call, type Status } from "./analytics/Dashboard";
import { ga4Properties, propertyName } from "./analytics/google";
import { favicon, Thinking } from "./ui";

// Visibility › Analytics: Search Console and Google Analytics 4 in one place, from the daily sync
// (seoAnalyticsServer.ts). One Google sign-in, then pick the site and the GA4 property. Opportunities turn into
// title fixes (Zippie's meta play), refreshes and Calendar items; any query opens Keyword Research in a side panel.

const GSC_LOGO = "/logos/search-console.png";
const GA4_LOGO = "/logos/google-analytics.svg";

export function AnalyticsPage({ view, auth, sb, canEdit }: { view: View; auth: RunAuth; sb: SupabaseClient; canEdit: boolean }) {
  const { brand } = view;
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState("");
  const [setup, setSetup] = useState(false);
  // Back from Google's sign-in: say how it went, then tidy the address.
  const [back] = useState(() => (typeof window === "undefined" ? null : new URLSearchParams(window.location.search)));
  useEffect(() => {
    if (!back?.get("ga4")) return;
    const q = new URLSearchParams(window.location.search);
    q.delete("ga4");
    q.delete("reason");
    window.history.replaceState(null, "", window.location.pathname + (q.size ? `?${q}` : ""));
  }, [back]);

  const call: Call = useCallback(
    async (path, body) => {
      const res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${await auth.token()}` },
        body: JSON.stringify({ ...body, workspaceId: auth.workspaceId, brandId: brand.id }),
      });
      const data = await res.json().catch(() => ({ error: `The server returned ${res.status}.` }));
      if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
      return data;
    },
    [auth, brand.id],
  );
  const load = useCallback(() => call("/api/seo-analytics", { action: "status" }).then((s) => setStatus(s as unknown as Status)).catch((e) => setError(e instanceof Error ? e.message : String(e))), [call]);
  useEffect(() => {
    load();
  }, [load]);

  const picked = Boolean(status?.connected && (status.gscProperty || status.ga4Property));
  if (!status) return error ? <p className="aw-error">{error}</p> : <Thinking text="Checking your Google connection..." />;

  return (
    <div className="flex flex-col gap-5">
      {back?.get("ga4") === "error" ? <p className="aw-error">{back.get("reason") ?? "Could not connect Google."}</p> : null}
      {!picked || setup ? <Setup status={status} canEdit={canEdit} call={call} brandName={brand.name} onDone={() => load().then(() => setSetup(false))} onClose={picked ? () => setSetup(false) : undefined} /> : <Dashboard status={status} call={call} sb={sb} auth={auth} view={view} canEdit={canEdit} onSetup={() => setSetup(true)} onReload={load} />}
    </div>
  );
}

// ─────────────── Connect ───────────────

const GOOGLE_LOGO = "https://www.google.com/s2/favicons?domain=google.com&sz=64";
/** A Search Console property's domain, for its favicon: "sc-domain:a.com" and "https://a.com/" both give a.com. */
const siteDomain = (url: string) => propertyName(url).split("/")[0];
type Pick = { id: string; label: string; icon?: string };
type Loaded = { list: Pick[] | null; pick: string; error: string };
const SKIP = { id: "", label: "Skip for now" };

/**
 * Sign in to Google, then pick the Search Console site and the GA4 property. Both screens are the app's empty
 * screen (the chart picture, a title and one line); signed in, the picks sit under it with one Start syncing button.
 */
function Setup({ status, canEdit, call, brandName, onDone, onClose }: { status: Status; canEdit: boolean; call: Call; brandName: string; onDone: () => void; onClose?: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const signedIn = status.connected && status.gsc;

  async function signIn() {
    setBusy(true);
    setError("");
    try {
      const d = await call("/api/google/connect", { back: "/analytics" });
      window.location.href = String(d.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  if (!signedIn)
    return (
      <EmptyScreen
        drawing="chart"
        title="Connect your Google data"
        action={
          <div className="flex flex-col items-center gap-5">
            <div className="flex flex-wrap justify-center gap-2">
              <span className="aw-chip">
                <BrandLogo src={GSC_LOGO} name="Search Console" size={16} />
                Search Console
              </span>
              <span className="aw-chip">
                <BrandLogo src={GA4_LOGO} name="Google Analytics" size={16} />
                Google Analytics
              </span>
            </div>
            {!canEdit ? (
              <p className="aw-small">Ask an editor to connect Google.</p>
            ) : !status.ready ? (
              <p className="aw-small">Google sign-in isn&apos;t set up on this server yet.</p>
            ) : (
              <button type="button" className="aw-btn aw-btn--primary" onClick={signIn} disabled={busy}>
                <BrandLogo src={GOOGLE_LOGO} name="Google" size={16} />
                {busy ? "Opening Google..." : status.connected ? "Sign in again to add Search Console" : "Continue with Google"}
              </button>
            )}
            {error ? <p className="aw-error">{error}</p> : null}
          </div>
        }
      >
        See Search Console and Google Analytics in one place, with fixes ranked by the traffic they bring.
      </EmptyScreen>
    );

  return (
    <EmptyScreen
      drawing="chart"
      title="Choose what to connect"
      action={
        <div className="flex w-full max-w-[560px] flex-col gap-3 text-left">
          <div className="aw-an-account">
            <BrandLogo src={GOOGLE_LOGO} name="Google" size={20} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14px] font-medium text-ink">{status.email ?? "Your Google account"}</span>
              <span className="block text-[12.5px] text-muted">Google account</span>
            </span>
            {canEdit ? (
              <button type="button" className="aw-text-link text-[13px]" onClick={signIn} disabled={busy}>
                {busy ? "Opening..." : "Switch"}
              </button>
            ) : null}
          </div>
          {canEdit ? <Picks status={status} call={call} onDone={onDone} /> : <p className="aw-small text-center">Ask an editor to pick the site and GA4 property.</p>}
          {error ? <p className="aw-error">{error}</p> : null}
          {onClose ? (
            <button type="button" className="aw-btn aw-btn--secondary self-center" onClick={onClose}>
              Back to the dashboard
            </button>
          ) : null}
        </div>
      }
    >
      Pick the site and GA4 property for {brandName}.
    </EmptyScreen>
  );
}

/** The two picks, Search Console and GA4, and the one button that saves both. Either can be skipped. */
function Picks({ status, call, onDone }: { status: Status; call: Call; onDone: () => void }) {
  const [gsc, setGsc] = useState<Loaded>({ list: null, pick: "", error: "" });
  const [ga4, setGa4] = useState<Loaded>({ list: null, pick: "", error: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    const fail = (set: typeof setGsc) => (e: unknown) => live && set({ list: [], pick: "", error: e instanceof Error ? e.message : String(e) });
    call("/api/seo-analytics", { action: "sites" })
      .then((d) => {
        if (!live) return;
        const { sites, suggested } = d as { sites: { url: string }[]; suggested: string | null };
        const list = [...sites].sort((a, b) => Number(b.url === suggested) - Number(a.url === suggested)).map((s) => ({ id: s.url, label: propertyName(s.url), icon: favicon(siteDomain(s.url)) }));
        setGsc({ list, pick: list.find((o) => o.id === status.gscProperty)?.id ?? list[0]?.id ?? "", error: "" });
      })
      .catch(fail(setGsc));
    ga4Properties(call)
      .then((l) => {
        if (!live) return;
        const list = l.map((o) => ({ ...o, icon: GA4_LOGO }));
        setGa4({ list, pick: list.find((o) => o.id === status.ga4Property)?.id ?? list[0]?.id ?? "", error: "" });
      })
      .catch(fail(setGa4));
    return () => {
      live = false;
    };
    // Load once: the lists come from Google.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function start() {
    setBusy(true);
    setError("");
    try {
      if (gsc.pick && gsc.pick !== status.gscProperty) await call("/api/seo-analytics", { action: "site", property: gsc.pick });
      if (ga4.pick && ga4.pick !== status.ga4Property) await call("/api/ga4", { action: "select", property: ga4.pick });
      if (!gsc.pick && !ga4.pick) throw new Error("Pick a Search Console site or a GA4 property.");
      if (gsc.pick === status.gscProperty && ga4.pick === status.ga4Property) await call("/api/seo-analytics", { action: "sync" });
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  const card = (name: string, logo: string, hint: string, l: Loaded, set: typeof setGsc, none: string, open: string) => (
    <div className="aw-an-pick">
      <span className="flex items-center gap-2 text-[14px] font-medium text-ink">
        <BrandLogo src={logo} name={name} size={20} />
        {name}
      </span>
      {!l.list ? (
        <span className="aw-small">Loading from Google...</span>
      ) : l.list.length ? (
        <Dropdown label={name} value={l.pick} onChange={(v) => set({ ...l, pick: v })} className="aw-dropdown--field h-10! w-full" options={[...l.list, SKIP]} />
      ) : (
        <span className="aw-small">
          {l.error ? "Couldn't load this from Google." : none}{" "}
          <a className="aw-text-link" href={open} target="_blank" rel="noopener noreferrer">
            Open
          </a>
        </span>
      )}
      <span className="text-[12.5px] text-muted">{hint}</span>
    </div>
  );

  const loaded = gsc.list !== null && ga4.list !== null;
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        {card("Search Console", GSC_LOGO, "Clicks, impressions and positions", gsc, setGsc, "No Search Console sites on this account.", "https://search.google.com/search-console")}
        {card("Google Analytics", GA4_LOGO, "Sessions, sign-ups and AI visits", ga4, setGa4, "No GA4 properties on this account.", "https://analytics.google.com/")}
      </div>
      {[gsc.error, ga4.error, error].filter(Boolean).map((m) => (
        <p key={m} className="aw-error">
          {m}
        </p>
      ))}
      <button type="button" className="aw-btn aw-btn--primary aw-btn--block" onClick={start} disabled={busy || !loaded || (!gsc.pick && !ga4.pick)}>
        {busy ? "Starting..." : "Start syncing"}
      </button>
    </>
  );
}
