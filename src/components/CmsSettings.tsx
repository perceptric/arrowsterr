"use client";

import { EmptyNote } from "./Drawing";
import { useEffect, useState } from "react";
import { CMS, type CmsConnection, type CmsKind } from "@/lib/cmsTypes";
import type { RunAuth } from "@/lib/runner";
import { ConnectWizard } from "./ConnectWizard";
import { Dropdown } from "./Pickers";
import { Confirm } from "./reports/Dialog";
import { post } from "./research/shared";

type BrandRef = { id: string; name: string };

/** Connect the sites this brand publishes to, through the connect wizard (one click where the CMS allows it). Admins only; keys are tested, then kept on the server. */
export function CmsSettings({ auth, isAdmin, brand, brands }: { auth: RunAuth; isAdmin: boolean; brand: BrandRef; brands: BrandRef[] }) {
  const [list, setList] = useState<CmsConnection[] | null>(null);
  const [setup, setSetup] = useState("");
  const [notice, setNotice] = useState(false);
  const [kind, setKind] = useState<CmsKind | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const [removing, setRemoving] = useState<CmsConnection | null>(null);

  useEffect(() => {
    let live = true;
    post<{ connections: CmsConnection[]; setup?: string; notice?: boolean }>(auth, "/api/cms", { action: "list", brandId: brand.id })
      .then((r) => {
        if (!live) return;
        setList(r.connections);
        setSetup(r.setup ?? "");
        setNotice(Boolean(r.notice));
      })
      .catch((e) => live && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      live = false;
    };
  }, [auth, brand.id]);

  // A sign-in window (Webflow, Shopify, HubSpot) comes back here when it lost its opener: say how it went, then tidy the address.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const kind = (["webflow", "shopify", "hubspot"] as const).find((k) => q.has(k));
    if (!kind) return;
    const name = CMS.find((c) => c.id === kind)?.label ?? kind;
    // Reading the address once on open is the point of this effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (q.get(kind) === "connected") setDone(`${name} connected.`);
    else setError(q.get("reason") || `Could not connect ${name}.`);
    q.delete(kind);
    q.delete("reason");
    window.history.replaceState(null, "", window.location.pathname + (q.size ? `?${q}` : ""));
  }, []);
  async function remove(c: CmsConnection) {
    setBusy(true);
    try {
      await post(auth, "/api/cms", { action: "remove", id: c.id });
      setList((l) => (l ?? []).filter((x) => x.id !== c.id));
      setRemoving(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  /** Give a site to another brand. It leaves this brand's list. */
  async function move(c: CmsConnection, to: string) {
    if (to === brand.id) return;
    setError("");
    try {
      await post(auth, "/api/cms", { action: "move", id: c.id, brandId: to });
      setList((l) => (l ?? []).filter((x) => x.id !== c.id));
      setDone(`${c.name} moved to ${brands.find((b) => b.id === to)?.name ?? "the other brand"}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }
  async function dismiss() {
    setNotice(false);
    await post(auth, "/api/cms", { action: "dismiss" }).catch(() => {});
  }

  return (
    <section className="flex flex-col gap-3">
      {setup ? <div className="aw-callout max-w-2xl">{setup}</div> : null}
      {notice && isAdmin ? (
        <div className="aw-callout flex max-w-2xl items-start justify-between gap-3">
          <span>Each brand now has its own publishing sites. Your sites were added to {brands[0]?.name ?? "your first brand"}. Move any that belong to another brand.</span>
          <button type="button" className="aw-text-link shrink-0 text-[13px]" onClick={dismiss}>
            Dismiss
          </button>
        </div>
      ) : null}
      {error ? <p className="aw-error max-w-2xl">{error}</p> : null}
      {done ? <div className="aw-callout max-w-2xl">{done}</div> : null}

      {list?.length ? (
        <ul className="aw-frame flex max-w-2xl flex-col divide-y divide-rule-faint">
          {list.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-3 px-5 py-3">
              <span className="flex flex-col">
                <span className="text-[15px] text-ink">{c.name}</span>
                <span className="text-[12px] text-muted">{CMS.find((x) => x.id === c.kind)?.label}</span>
              </span>
              {isAdmin ? (
                <span className="flex items-center gap-3">
                  {brands.length > 1 ? (
                    <Dropdown label="Brand" value={brand.id} onChange={(to) => move(c, to)} className="aw-dropdown--sm" options={brands.map((b) => ({ id: b.id, label: b.name }))} />
                  ) : null}
                  <button type="button" className="aw-text-link text-[13px] text-neg!" onClick={() => setRemoving(c)}>
                    Disconnect
                  </button>
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : list && !setup ? (
        <EmptyNote drawing="plug">Connect a site to publish {brand.name}&apos;s drafts to WordPress, Webflow, Framer and more.</EmptyNote>
      ) : null}
      {list?.some((c) => c.kind === "wordpress") || kind === "wordpress" ? (
        <div className="aw-callout flex max-w-2xl flex-col gap-2 text-[14px]">
          <span className="font-medium text-ink">Arrowsterr Connector for WordPress (1.1)</span>
          <span>
            Install it so articles publish with their interactive modules and SEO titles, and Zippie can set meta descriptions and structured data. It works with Yoast SEO and Rank Math. In WordPress, open Plugins → Add New → Upload Plugin, pick the file, then Activate. To update, upload the new file and choose Replace current with uploaded.
          </span>
          <a href="/downloads/arrowsterr-connector.zip" download className="aw-btn aw-btn--secondary aw-btn--sm self-start">
            Download the plugin
          </a>
        </div>
      ) : null}

      {isAdmin && !setup ? (
        <div className="flex flex-wrap gap-2">
          {CMS.map((c) => (
            <button key={c.id} type="button" className={`aw-chip ${kind === c.id ? "aw-chip--brand" : ""}`} onClick={() => setKind(kind === c.id ? null : c.id)}>
              + {c.label}
            </button>
          ))}
        </div>
      ) : null}

      {kind ? (
        <ConnectWizard
          auth={auth}
          platform={kind}
          brandId={brand.id}
          onClose={() => setKind(null)}
          onConnected={(c) => {
            setList((l) => [...(l ?? []).filter((x) => x.id !== c.id), c]);
            setDone("");
          }}
        />
      ) : null}

      {removing ? <Confirm title="Disconnect site" text={`Disconnect ${removing.name}? Articles already published stay on the site.`} action="Disconnect" busy={busy} onConfirm={() => remove(removing)} onClose={() => setRemoving(null)} /> : null}
    </section>
  );
}
