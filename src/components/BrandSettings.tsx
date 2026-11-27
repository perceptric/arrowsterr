"use client";

import { EmptyNote } from "./Drawing";
import type { SupabaseClient } from "@supabase/supabase-js";
import { useCallback, useEffect, useState } from "react";
import { ALERT_POINTS } from "@/lib/integrationTypes";
import type { RunAuth } from "@/lib/runner";
import { CmsSettings } from "./CmsSettings";
import { Dropdown } from "./Pickers";
import { Confirm } from "./reports/Dialog";
import { post } from "./research/shared";
import type { BrandTab } from "./SettingsPage";
import { BrandLogo } from "./BrandLogo";
import { BrandGuidelines } from "./BrandGuidelines";
import { BrandKitPanel } from "./BrandKit";
import { BrandVoiceSettings } from "./BrandVoice";
import { WriterPersonaSettings } from "./WriterPersona";
import { favicon, Thinking } from "./ui";
import { ShoppingSwitch } from "./ShoppingPage";

type BrandRef = { id: string; name: string; domain: string };

/**
 * Settings › Brand: what each brand has of its own. Its tone of voice, Brand Kit and guidelines (what the Agentic
 * Writer writes from, read through loadBrandContext in src/lib/brandContext.ts), publishing sites, Google Analytics,
 * and its Slack channel and alert size. A picker on top switches the brand.
 */
export function BrandSettings({
  sb,
  tab,
  auth,
  brand,
  brands,
  canEdit,
  isAdmin,
  onBrand,
}: {
  sb: SupabaseClient;
  tab: BrandTab;
  auth: RunAuth;
  brand: BrandRef | null;
  brands: BrandRef[];
  canEdit: boolean;
  isAdmin: boolean;
  onBrand: (id: string) => void;
}) {
  if (!brand) return <EmptyNote drawing="flag">This workspace has no brands yet.</EmptyNote>;
  return (
    <div className="flex flex-col gap-6">
      {brands.length > 1 ? (
        <label className="flex items-center gap-2 text-[13px] text-body">
          <span className="aw-label">Brand</span>
          <Dropdown label="Brand" value={brand.id} onChange={onBrand} className="aw-dropdown--sm" options={brands.map((b) => ({ id: b.id, label: b.name }))} />
        </label>
      ) : null}
      {tab === "voice" ? (
        <div className="flex flex-col gap-10">
          <WriterPersonaSettings key={`p${brand.id}`} auth={auth} brand={brand} canEdit={canEdit} />
          <BrandVoiceSettings key={brand.id} auth={auth} brand={brand} canEdit={canEdit} />
        </div>
      ) : tab === "kit" ? (
        <BrandKitPanel key={brand.id} sb={sb} auth={auth} canEdit={canEdit} brand={brand} />
      ) : tab === "guidelines" ? (
        <BrandGuidelines key={brand.id} sb={sb} workspaceId={auth.workspaceId} brand={brand} canEdit={canEdit} />
      ) : tab === "publishing" ? (
        <CmsSettings key={brand.id} auth={auth} isAdmin={isAdmin} brand={brand} brands={brands} />
      ) : tab === "google" ? (
        <BrandGoogle key={brand.id} auth={auth} brand={brand} />
      ) : tab === "shopsettings" ? (
        <ShoppingSwitch key={brand.id} auth={auth} brand={brand} canEdit={canEdit} />
      ) : (
        <BrandAlerts key={brand.id} auth={auth} brand={brand} isAdmin={isAdmin} />
      )}
    </div>
  );
}

/** Google Analytics for this brand. Connecting happens on Analytics, where Search Console joins the same sign-in. */
function BrandGoogle({ auth, brand }: { auth: RunAuth; brand: BrandRef }) {
  const [ga4, setGa4] = useState<Ga4 | null | undefined>(undefined);
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    (async () => {
      const res = await fetch("/api/site", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${await auth.token()}` },
        body: JSON.stringify({ action: "status", workspaceId: auth.workspaceId, brandId: brand.id }),
      });
      const data = await res.json().catch(() => ({ error: `The server returned ${res.status}.` }));
      if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
      if (live) setGa4((data as { ga4?: Ga4 | null }).ga4 ?? null);
    })().catch((e) => live && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      live = false;
    };
  }, [auth, brand.id]);

  return (
    <section className="flex max-w-2xl flex-col gap-3">
      {error ? <p className="aw-error">{error}</p> : null}
      {ga4 === undefined && !error ? (
        <Thinking text="Getting the brand settings..." />
      ) : (
        <div className="aw-frame flex items-center justify-between gap-3 px-5 py-3">
          <span className="flex flex-col">
            <span className="text-[15px] text-ink">{ga4?.property ? (ga4.name ?? ga4.property) : "Not connected"}</span>
            <span className="text-[12px] text-muted">{ga4?.email ?? "Connect Google Analytics and Search Console on Analytics."}</span>
          </span>
          {ga4?.property ? (
            <span className="aw-status aw-status--ranked">Connected</span>
          ) : (
            <button
              type="button"
              className="aw-btn aw-btn--secondary aw-btn--sm"
              onClick={() => {
                window.history.pushState(null, "", "/analytics");
                window.dispatchEvent(new PopStateEvent("popstate"));
              }}
            >
              Open Analytics
            </button>
          )}
        </div>
      )}
    </section>
  );
}

type Ga4 = { email: string; property: string | null; name: string | null };

type AlertState = { allowed: boolean; setup?: string; slack?: boolean; workspaceSlack?: boolean; points?: number | null; defaultPoints?: number };

/** This brand's Slack channel and alert size. Empty means the workspace's. */
function BrandAlerts({ auth, brand, isAdmin }: { auth: RunAuth; brand: BrandRef; isAdmin: boolean }) {
  const [s, setS] = useState<AlertState | null>(null);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [asking, setAsking] = useState(false);

  const load = useCallback(
    () =>
      post<AlertState>(auth, "/api/integrations", { action: "brandGet", brandId: brand.id })
        .then(setS)
        .catch((e) => setError(e instanceof Error ? e.message : String(e))),
    [auth, brand.id],
  );
  useEffect(() => {
    load();
  }, [load]);

  async function act(name: string, body: Record<string, unknown>, done?: string) {
    setBusy(name);
    setError("");
    setNotice("");
    try {
      await post(auth, "/api/integrations", { ...body, brandId: brand.id });
      if (done) setNotice(done);
      setUrl("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy("");
    }
  }

  if (!s) return error ? <p className="aw-error max-w-2xl">{error}</p> : <Thinking text="Getting the brand settings..." />;
  const off = !s.allowed;
  const can = isAdmin && !off && !s.setup;
  return (
    <section className="flex max-w-2xl flex-col gap-4">
      {off ? <div className="aw-callout">Slack alerts are on Pro and up.</div> : null}
      {s.setup ? <div className="aw-callout">{s.setup}</div> : null}
      {error ? <p className="aw-error">{error}</p> : null}
      {notice ? <div className="aw-callout">{notice}</div> : null}

      <div className="aw-frame flex flex-col gap-3 p-5">
        <div className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-2 text-[15px] font-medium text-ink">
            <BrandLogo src={favicon("slack.com")} name="Slack" size={18} />
            Slack channel
          </span>
          <span className="aw-status">{s.slack ? "Own channel" : s.workspaceSlack ? "Workspace channel" : "Not connected"}</span>
        </div>
        {can ? (
          s.slack ? (
            <button type="button" className="aw-text-link self-start text-[13px] text-neg!" onClick={() => setAsking(true)}>
              Disconnect
            </button>
          ) : (
            <div className="flex flex-col gap-2">
              <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://hooks.slack.com/services/…" aria-label="Slack webhook URL" className="aw-input py-2! text-[14px]!" />
              <button type="button" className="aw-btn aw-btn--primary aw-btn--sm self-start" disabled={!url.trim() || Boolean(busy)} onClick={() => act("slack", { action: "brandSlack", url }, "Connected. Check Slack for a test message.")}>
                {busy === "slack" ? "Testing..." : "Connect and send a test"}
              </button>
            </div>
          )
        ) : null}
      </div>

      <div className="aw-frame flex flex-wrap items-center justify-between gap-3 p-5">
        <span className="text-[15px] font-medium text-ink">Alert size</span>
        <Dropdown
          label="Alert size"
          value={s.points === null || s.points === undefined ? "ws" : String(s.points)}
          disabled={!can || Boolean(busy)}
          onChange={(v) => act("points", { action: "brandPoints", points: v === "ws" ? null : Number(v) }, "Saved.")}
          className="aw-dropdown--sm"
          options={[{ id: "ws", label: `Workspace default (${s.defaultPoints ?? 5} points)` }, ...ALERT_POINTS.map((p) => ({ id: String(p), label: `${p} points` }))]}
        />
      </div>

      {asking ? (
        <Confirm
          title="Disconnect channel"
          text={`${brand.name}'s alerts go back to the workspace's channel.`}
          action="Disconnect"
          onConfirm={() => {
            setAsking(false);
            act("off", { action: "brandSlackOff" });
          }}
          onClose={() => setAsking(false)}
        />
      ) : null}
    </section>
  );
}
