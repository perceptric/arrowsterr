"use client";

import { track } from "@/lib/analytics";
import { useEffect, useState } from "react";
import { CMS_GUIDE } from "@/lib/cmsGuide";
import { CMS, type CmsConnection, type CmsKind } from "@/lib/cmsTypes";
import { authorizeUrl, siteAddress, WP_ANSWER_KEY, type WpAnswer } from "@/lib/wpAuthorize";
import type { RunAuth } from "@/lib/runner";
import { Modal } from "./reports/Dialog";

async function call<T>(auth: RunAuth, body: Record<string, unknown>): Promise<T> {
  const res = await fetch("/api/cms", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${await auth.token()}` },
    body: JSON.stringify({ ...body, workspaceId: auth.workspaceId }),
  });
  const out = await res.json().catch(() => ({ error: `The server returned ${res.status}.` }));
  if (!res.ok) throw new Error(out.error ?? `The server returned ${res.status}.`);
  return out as T;
}

/**
 * Connect a CMS step by step, from Zippie's chat or the Library: pick the platform, follow the numbered steps with a
 * button that opens the right admin screen, paste the keys, and test. WordPress connects in one click instead: the
 * person approves Arrowsterr in a WordPress window (wpAuthorize.ts), then the guide checks for the connector plugin.
 */
export function ConnectWizard({
  auth,
  platform,
  brandId,
  onClose,
  onConnected,
}: {
  auth: RunAuth;
  platform?: CmsKind | null;
  /** The brand the site publishes for. Without it, the server picks the workspace's first brand. */
  brandId?: string;
  onClose: () => void;
  onConnected: (c: CmsConnection) => void;
}) {
  const [kind, setKind] = useState<CmsKind | null>(platform ?? null);
  const [list, setList] = useState<CmsConnection[] | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<{ c: CmsConnection; check: string } | null>(null);
  const [manual, setManual] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [plugin, setPlugin] = useState<{ checking: boolean; found: { version: string; current: boolean } | null; looked: boolean }>({ checking: false, found: null, looked: false });

  useEffect(() => {
    let live = true;
    call<{ connections: CmsConnection[] }>(auth, { action: "list", brandId })
      .then((r) => live && setList(r.connections))
      .catch(() => live && setList([]));
    return () => {
      live = false;
    };
  }, [auth, brandId]);

  const spec = CMS.find((c) => c.id === kind);
  const guide = kind ? CMS_GUIDE[kind] : null;
  const link = guide?.open(form) ?? null;
  const missing = spec ? spec.fields.filter((f) => !f.optional && !(form[f.id] ?? "").trim()) : [];

  async function connect(e: React.FormEvent | null, given?: Record<string, string>) {
    e?.preventDefault();
    if (!spec) return;
    setBusy(true);
    setError("");
    try {
      const { name, ...config } = given ?? form;
      const r = await call<{ connection: CmsConnection; check: string }>(auth, { action: "connect", kind: spec.id, name: name?.trim() || spec.label, config, brandId });
      setDone({ c: r.connection, check: r.check });
      track("cms_connected", { kind: spec.id, one_click: Boolean(given) });
      onConnected(r.connection);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  // WordPress's answer comes back from its window by message, or through storage when that window lost its opener.
  useEffect(() => {
    if (!waiting) return;
    const take = (a: WpAnswer) => {
      setWaiting(false);
      if (!a.ok) return setError(a.error);
      void connect(null, { name: form.name ?? "", siteUrl: a.siteUrl, username: a.username, appPassword: a.appPassword });
    };
    const onMessage = (e: MessageEvent) => {
      if (e.origin === window.location.origin && e.data?.awWordPress) take(e.data.awWordPress as WpAnswer);
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key !== WP_ANSWER_KEY || !e.newValue) return;
      try {
        localStorage.removeItem(WP_ANSWER_KEY);
        take(JSON.parse(e.newValue) as WpAnswer);
      } catch {
        setWaiting(false);
      }
    };
    window.addEventListener("message", onMessage);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("message", onMessage);
      window.removeEventListener("storage", onStorage);
    };
    // connect reads the latest form; the listeners only need to change when waiting does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waiting]);

  function approveInWordPress(e: React.FormEvent) {
    e.preventDefault();
    const site = siteAddress(form.siteUrl ?? "");
    if (!site) return setError("Type your site address, like example.com.");
    setError("");
    const w = window.open(authorizeUrl(site, window.location.origin), "arrowsterr-wordpress", "width=760,height=780");
    if (!w) return setError("Your browser blocked the WordPress window. Allow pop-ups for this site, or use an application password.");
    setWaiting(true);
  }

  async function checkPlugin(id: string) {
    setPlugin((p) => ({ ...p, checking: true }));
    try {
      const r = await call<{ plugin: { version: string; current: boolean } | null }>(auth, { action: "wp_plugin", connectionId: id });
      setPlugin({ checking: false, found: r.plugin, looked: true });
    } catch {
      setPlugin({ checking: false, found: null, looked: true });
    }
  }

  return (
    <Modal title={done ? `${spec?.label ?? "CMS"} connected` : spec ? `Connect ${spec.label}` : "Connect your CMS"} onClose={onClose} width="max-w-xl">
      {done ? (
        <div className="flex flex-col gap-4">
          <p className="text-[14px] text-body">
            Arrowsterr can now publish to {done.c.name}. {done.check}.
          </p>
          {done.c.kind === "wordpress" ? (
            <ol className="zp-wiz-steps">
              <li>
                <span className="text-ink">Download the Arrowsterr Connector plugin.</span>
                <a href="/downloads/arrowsterr-connector.zip" download className="aw-btn aw-btn--secondary aw-btn--sm mt-2 self-start">
                  Download the plugin
                </a>
              </li>
              <li>
                <span>In WordPress, open Plugins, then Add New, then Upload Plugin. Pick the file and click Activate.</span>
                <a href={`${siteAddress(form.siteUrl ?? "") || done.c.name}/wp-admin/plugin-install.php?tab=upload`} target="_blank" rel="noopener noreferrer" className="aw-btn aw-btn--secondary aw-btn--sm mt-2 self-start">
                  Open WordPress plugins ↗
                </a>
              </li>
              <li>
                <span>It carries interactive modules, SEO titles, meta descriptions and schema to your posts. It works with Yoast SEO and Rank Math.</span>
                <span className="mt-2 flex items-center gap-2">
                  <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm" disabled={plugin.checking} onClick={() => void checkPlugin(done.c.id)}>
                    {plugin.checking ? "Checking..." : "Check plugin"}
                  </button>
                  {plugin.looked ? (
                    plugin.found ? (
                      <span className={`tw-tag ${plugin.found.current ? "tw-tag--green" : "tw-tag--orange"}`}>{plugin.found.current ? `Plugin on, version ${plugin.found.version}` : `Version ${plugin.found.version}: update it`}</span>
                    ) : (
                      <span className="tw-tag tw-tag--red">Not found yet</span>
                    )
                  ) : null}
                </span>
              </li>
            </ol>
          ) : null}
          <button type="button" className="aw-btn aw-btn--primary aw-btn--sm self-end" onClick={onClose}>
            Done
          </button>
        </div>
      ) : !spec || !guide ? (
        <div className="flex flex-col gap-3">
          {list?.length ? <p className="text-[13px] text-muted">Connected: {list.map((c) => c.name).join(", ")}</p> : null}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {CMS.map((c) => (
              <button key={c.id} type="button" className="zp-wiz-tile" onClick={() => setKind(c.id)}>
                <span className="text-[15px] font-medium text-ink">{c.label}</span>
                <span className="text-[12px] text-muted">{list?.some((x) => x.kind === c.id) ? "Connected" : "Connect"}</span>
              </button>
            ))}
          </div>
        </div>
      ) : spec.id === "wordpress" && !manual ? (
        <form onSubmit={approveInWordPress} className="flex flex-col gap-4">
          <p className="text-[14px] text-body">Approve Arrowsterr in WordPress. It takes one click, and you can remove it any time under Users → Profile in WordPress.</p>
          <ol className="zp-wiz-steps">
            <li>Type your site address.</li>
            <li>Click Connect with WordPress. In the WordPress window, sign in if asked, then click Yes, I approve of this connection.</li>
            <li>Install the Arrowsterr Connector plugin on the next screen, so interactive modules, SEO titles and schema come through.</li>
          </ol>
          <label className="flex flex-col gap-1.5">
            <span className="aw-label">Site address</span>
            <input autoFocus value={form.siteUrl ?? ""} onChange={(e) => setForm({ ...form, siteUrl: e.target.value })} placeholder="example.com" className="aw-input py-2! text-[14px]!" />
          </label>
          {error ? <p className="aw-error">{error}</p> : null}
          <div className="flex items-center justify-between gap-2">
            <button type="button" className="aw-btn aw-btn--ghost aw-btn--sm" onClick={() => (platform ? onClose() : setKind(null))}>
              {platform ? "Cancel" : "Back"}
            </button>
            <span className="flex items-center gap-2">
              <button type="button" className="aw-text-link text-[12px]" onClick={() => setManual(true)}>
                Use an application password
              </button>
              <button type="submit" className="aw-btn aw-btn--primary aw-btn--sm" disabled={busy || waiting || !(form.siteUrl ?? "").trim()}>
                {busy ? "Connecting..." : waiting ? "Waiting for WordPress..." : "Connect with WordPress"}
              </button>
            </span>
          </div>
        </form>
      ) : (
        <form onSubmit={connect} className="flex flex-col gap-4">
          <p className="text-[14px] text-body">{guide.blurb}</p>
          <ol className="zp-wiz-steps">
            {guide.steps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
          {spec.fields.map((f, i) => (
            <label key={f.id} className="flex flex-col gap-1.5">
              <span className="aw-label">
                {f.label}
                {f.optional ? " (optional)" : ""}
              </span>
              <input
                type={f.secret ? "password" : "text"}
                autoComplete="off"
                autoFocus={i === 0}
                value={form[f.id] ?? ""}
                onChange={(e) => setForm({ ...form, [f.id]: e.target.value })}
                placeholder={f.placeholder}
                className="aw-input py-2! text-[14px]!"
              />
              {i === 0 && link ? (
                <a href={link.href} target="_blank" rel="noopener noreferrer" className="aw-btn aw-btn--secondary aw-btn--sm mt-1 self-start">
                  {link.label} ↗
                </a>
              ) : null}
            </label>
          ))}
          {error ? <p className="aw-error">{error}</p> : null}
          <div className="flex justify-between gap-2">
            <button type="button" className="aw-btn aw-btn--ghost aw-btn--sm" onClick={() => (platform ? onClose() : setKind(null))}>
              {platform ? "Cancel" : "Back"}
            </button>
            <button type="submit" className="aw-btn aw-btn--primary aw-btn--sm" disabled={busy || missing.length > 0}>
              {busy ? "Testing..." : "Test and connect"}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
