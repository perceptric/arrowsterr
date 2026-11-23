"use client";

import { useCallback, useEffect, useState } from "react";
import type { FeedHealth as Health, MissingKey } from "@/lib/merchantHealth";
import type { RunAuth } from "@/lib/runner";
import { post } from "./research/shared";
import { Card, StatStrip, Thinking } from "./ui";

// Merchant Center feed health on the AI Shopping page: items approved, limited or disapproved, the top item
// issues, and missing details that AI shopping answers use. Saved by each catalog sync (merchantHealth.ts).

type Source = { id: string; account: string | null; name: string | null; status: string; error: string | null; synced_at: string | null };
type Data = { connected: boolean; ready?: boolean; source?: Source; health?: Health | null; healthAt?: string | null; setup?: string };

const MISSING: Record<MissingKey, { label: string; why: string }> = {
  gtin: { label: "GTIN", why: "Lets AI match your item to the same product on other stores" },
  brand: { label: "Brand", why: "AI answers group products by brand" },
  price: { label: "Price", why: "Product cards show a price, and items without one drop out" },
  availability: { label: "Availability", why: "AI answers skip items that may be out of stock" },
  image: { label: "Image", why: "Cards need a picture to show the item" },
  description: { label: "Description", why: "AI reads it to know what the item is for" },
};
const SEV: Record<Health["issues"][number]["severity"], { label: string; cls: string }> = {
  disapproved: { label: "Blocks the item", cls: "aw-status--missed" },
  demoted: { label: "Shown less", cls: "aw-status--warn" },
  info: { label: "Tip", cls: "aw-status--pending" },
};
const when = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "");
const share = (n: number, of: number) => (of ? `${Math.round((n / of) * 100)}%` : "–");

export function FeedHealth({ auth, brandId, canEdit, onCatalog }: { auth: RunAuth; brandId: string; canEdit: boolean; onCatalog: () => void }) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await post<Data>(auth, "/api/shop", { action: "health", brandId }));
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [auth, brandId]);
  useEffect(() => {
    // Loading when the brand changes is the point of this effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);
  // Keep reading while a sync runs.
  const syncing = data?.source?.status === "syncing";
  useEffect(() => {
    if (!syncing) return;
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [syncing, load]);

  const sync = async () => {
    if (!data?.source) return;
    setBusy(true);
    try {
      await post(auth, "/api/shop", { action: "sync", brandId, sourceId: data.source.id });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (!data) return error ? <p className="aw-error">{error}</p> : <Thinking text="Reading your product feed..." />;

  if (!data.connected)
    return (
      <Card title="Product feed health">
        <div className="flex flex-col gap-3 p-5">
          <p className="text-[14px] text-body">Connect Google Merchant Center to see which products Google holds back and the missing details that keep items out of AI shopping answers.</p>
          {data.ready === false ? <p className="aw-small">Google sign-in is not set up on the server yet.</p> : null}
          {canEdit ? (
            <button type="button" className="aw-btn aw-btn--primary aw-btn--sm self-start" disabled={data.ready === false} onClick={onCatalog}>
              Connect Merchant Center
            </button>
          ) : (
            <p className="aw-small">Ask an editor to connect Merchant Center in the catalog.</p>
          )}
        </div>
      </Card>
    );

  const src = data.source!;
  const action = canEdit && src.account ? (
    <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm" disabled={busy || syncing} onClick={sync}>
      {syncing ? "Syncing..." : "Sync now"}
    </button>
  ) : null;

  const h = data.health;
  if (!h || data.setup || !src.account || src.status === "error")
    return (
      <Card title="Product feed health" action={action}>
        <div className="flex flex-col gap-3 p-5">
          {error ? <p className="aw-error">{error}</p> : null}
          {data.setup ? <p className="aw-callout">{data.setup}</p> : null}
          {src.status === "error" && src.error ? <p className="aw-error">{src.error}</p> : null}
          {!src.account ? (
            <>
              <p className="aw-small">Pick which Merchant Center account to read.</p>
              {canEdit ? (
                <button type="button" className="aw-btn aw-btn--primary aw-btn--sm self-start" onClick={onCatalog}>
                  Open catalog
                </button>
              ) : null}
            </>
          ) : !data.setup && src.status !== "error" ? (
            <p className="aw-small">{syncing ? "Reading your products now." : "Feed health shows after the next sync."}</p>
          ) : null}
        </div>
      </Card>
    );

  const missing = (Object.keys(MISSING) as MissingKey[]).map((k) => ({ k, ...MISSING[k], ...h.missing[k] })).sort((a, b) => b.items - a.items);
  return (
    <Card title="Product feed health" action={action}>
      <div className="flex flex-col gap-5 p-5">
        <div className="flex flex-wrap items-center gap-2 text-[13px] text-muted">
          <span className="aw-chip">Merchant Center{src.name ? ` · ${src.name}` : ""}</span>
          {data.healthAt ? <span>Checked {when(data.healthAt)}</span> : null}
        </div>
        {error ? <p className="aw-error">{error}</p> : null}
        {!h.items ? (
          <p className="aw-small">This Merchant Center account has no products yet.</p>
        ) : (
          <>
            <StatStrip
              stats={[
                { label: "Approved", value: h.status.approved.toLocaleString("en-US"), tone: "pos", sub: `${share(h.status.approved, h.items)} of ${h.items.toLocaleString("en-US")} items` },
                { label: "Limited", value: h.status.limited.toLocaleString("en-US"), tone: h.status.limited ? "warn" : undefined, sub: "Shown in fewer places" },
                { label: "Disapproved", value: h.status.disapproved.toLocaleString("en-US"), tone: h.status.disapproved ? "neg" : undefined, sub: "Not shown" },
                { label: "Pending", value: h.status.pending.toLocaleString("en-US"), sub: "Google is still checking" },
              ]}
            />

            <section className="flex flex-col gap-2">
              <span className="aw-label">Top item issues</span>
              {!h.issues.length ? (
                <p className="aw-small">Google reports no item issues.</p>
              ) : (
                <div className="aw-table-wrap">
                  <table className="aw-table">
                    <thead>
                      <tr>
                        <th>Issue</th>
                        <th>Effect</th>
                        <th className="text-right">Items</th>
                      </tr>
                    </thead>
                    <tbody>
                      {h.issues.map((i) => (
                        <tr key={i.code}>
                          <td>
                            <div className="text-ink">
                              {i.doc ? (
                                <a href={i.doc} target="_blank" rel="noopener noreferrer">
                                  {i.title}
                                </a>
                              ) : (
                                i.title
                              )}
                            </div>
                            <div className="aw-small">
                              {i.attribute ? `${i.attribute} · ` : ""}
                              {i.examples
                                .map((x) => x.title || x.id)
                                .filter(Boolean)
                                .join(", ")}
                            </div>
                          </td>
                          <td>
                            <span className={`aw-status ${SEV[i.severity].cls}`}>{SEV[i.severity].label}</span>
                          </td>
                          <td className="aw-num text-right">{i.items.toLocaleString("en-US")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="flex flex-col gap-2">
              <span className="aw-label">Details AI shopping answers use</span>
              <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {missing.map((m) => (
                  <li key={m.k} className="flex flex-col gap-1 rounded-aw border border-rule-faint bg-surface-2 p-3">
                    <span className="flex items-center justify-between gap-2">
                      <span className="text-[14px] font-medium text-ink">{m.label}</span>
                      <span className={`aw-status ${m.items ? "aw-status--warn" : "aw-status--ranked"}`}>{m.items ? `${m.items.toLocaleString("en-US")} missing` : "All set"}</span>
                    </span>
                    <span className="aw-small">{m.why}</span>
                    {m.items && m.examples.length ? <span className="truncate text-[12px] text-muted">{m.examples.map((x) => x.title || x.id).join(", ")}</span> : null}
                  </li>
                ))}
              </ul>
            </section>
          </>
        )}
      </div>
    </Card>
  );
}
