"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RunAuth } from "@/lib/runner";
import type { ShopMode, ShopReason } from "@/lib/shopDetect";
import { askConfirm } from "./Dialogs";
import { BrandLogo } from "./BrandLogo";
import { EmptyScreen } from "./Drawing";
import { Dropdown } from "./Pickers";
import { post } from "./research/shared";
import { favicon, Seg, SidePanel, Thinking } from "./ui";

// AI Shopping (docs/ai-shopping-plan.md). Phase 2: the switch, the Catalog side panel and the product list.

type BrandRef = { id: string; name: string; domain: string };
type Source = { id: string; kind: "shopify" | "merchant" | "csv"; name: string | null; account: string | null; email: string | null; status: "new" | "syncing" | "ok" | "error"; error: string | null; products: number; variants: number; synced_at: string | null };
type Product = { id: string; title: string; url: string | null; image: string | null; price_min: number | null; price_max: number | null; currency: string | null; in_stock: boolean | null; variants: number };
export type ShopState = {
  mode: ShopMode;
  on: boolean;
  auto: { on: boolean; reason: ShopReason | null; checkedAt: string | null };
  sources: Source[];
  shopifyStores: { id: string; name: string }[];
  merchantReady: boolean;
  products: Product[];
};

const REASON: Record<ShopReason, string> = { store: "Store connected", site: "Products on the site", answers: "Products in AI answers", cards: "Cards name the brand" };

export function useShop(auth: RunAuth, brandId: string) {
  const [state, setState] = useState<ShopState | null>(null);
  const [error, setError] = useState("");
  const reload = useCallback(async () => {
    try {
      setState(await post<ShopState>(auth, "/api/shop", { action: "state", brandId }));
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [auth, brandId]);
  useEffect(() => {
    let live = true;
    post<ShopState>(auth, "/api/shop", { action: "state", brandId })
      .then((s) => live && setState(s))
      .catch((e) => live && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      live = false;
    };
  }, [auth, brandId]);
  const act = useCallback((action: string, body: Record<string, unknown> = {}) => post<Record<string, unknown>>(auth, "/api/shop", { action, brandId, ...body }), [auth, brandId]);
  return { state, error, reload, act };
}

const money = (n: number | null, currency: string | null) => {
  if (n === null || n === undefined) return "–";
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: currency || "USD", maximumFractionDigits: n % 1 ? 2 : 0 }).format(Number(n));
  } catch {
    return `$${n}`;
  }
};
const priceText = (p: Pick<Product, "price_min" | "price_max" | "currency">) =>
  p.price_min !== null && p.price_max !== null && Number(p.price_max) > Number(p.price_min) ? `${money(p.price_min, p.currency)} – ${money(p.price_max, p.currency)}` : money(p.price_min, p.currency);

// ─────────────── Settings › Brand › AI Shopping ───────────────

export function ShoppingSwitch({ auth, brand, canEdit }: { auth: RunAuth; brand: BrandRef; canEdit: boolean }) {
  const { state, error, reload, act } = useShop(auth, brand.id);
  const [busy, setBusy] = useState(false);
  const [fail, setFail] = useState("");
  if (!state) return error ? <p className="aw-error max-w-2xl">{error}</p> : <Thinking text="Loading..." />;
  const pick = async (mode: ShopMode) => {
    setBusy(true);
    setFail("");
    try {
      await act("mode", { mode });
      await reload();
    } catch (e) {
      setFail(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="flex max-w-2xl flex-col gap-4">
      {fail ? <p className="aw-error">{fail}</p> : null}
      <div className="aw-frame flex flex-col gap-3 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-[15px] font-medium text-ink">AI Shopping</span>
          <span className={`aw-status ${state.on ? "aw-status--ranked" : ""}`}>{state.on ? "On" : "Off"}</span>
        </div>
        <p className="aw-small">Product cards in ChatGPT and Google AI Mode.</p>
        <div className={busy || !canEdit ? "pointer-events-none opacity-60" : ""}>
          <Seg label="AI Shopping" value={state.mode} onChange={pick} options={[{ id: "auto", label: "Auto" }, { id: "on", label: "On" }, { id: "off", label: "Off" }]} />
        </div>
        {state.mode === "auto" ? <span className="aw-small">{state.auto.on && state.auto.reason ? REASON[state.auto.reason] : state.auto.checkedAt ? "No products found" : "Checking"}</span> : null}
      </div>
    </section>
  );
}

// ─────────────── The Catalog side panel ───────────────

function SourceStatus({ s }: { s: Source }) {
  if (s.status === "error") return <span className="aw-status aw-status--missed">Needs attention</span>;
  if (s.status === "syncing" || (s.status === "new" && s.kind !== "merchant")) return <span className="aw-status aw-status--pending">Reading products</span>;
  if (s.status === "new") return <span className="aw-status aw-status--pending">Pick an account</span>;
  return <span className="aw-status aw-status--ranked">{s.products.toLocaleString()} products</span>;
}

export function CatalogPanel({ auth, brand, canEdit, onClose, onPublishing, notice }: { auth: RunAuth; brand: BrandRef; canEdit: boolean; onClose: () => void; onPublishing: () => void; notice?: string }) {
  const { state, error, reload, act } = useShop(auth, brand.id);
  const [busy, setBusy] = useState("");
  const [fail, setFail] = useState("");
  const [store, setStore] = useState("");
  const [accounts, setAccounts] = useState<{ id: string; name: string }[] | null>(null);
  const [account, setAccount] = useState("");
  const file = useRef<HTMLInputElement>(null);
  const src = (k: Source["kind"]) => state?.sources.find((s) => s.kind === k) ?? null;
  const merchant = src("merchant");

  // Keep reading while a source is syncing.
  const syncing = state?.sources.some((s) => s.status === "syncing" || (s.status === "new" && s.kind !== "merchant"));
  useEffect(() => {
    if (!syncing) return;
    const t = setInterval(reload, 4000);
    return () => clearInterval(t);
  }, [syncing, reload]);
  // Signed in to Merchant Center with more than one account: list them.
  const needsAccount = Boolean(merchant && !merchant.account);
  useEffect(() => {
    if (!needsAccount || !canEdit) return;
    act("accounts")
      .then((d) => {
        const list = (d.accounts as { id: string; name: string }[]) ?? [];
        setAccounts(list);
        setAccount(list[0]?.id ?? "");
      })
      .catch((e) => setFail(e instanceof Error ? e.message : String(e)));
  }, [needsAccount, canEdit, act]);

  async function run(name: string, fn: () => Promise<unknown>) {
    setBusy(name);
    setFail("");
    try {
      await fn();
      await reload();
    } catch (e) {
      setFail(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy("");
    }
  }
  const remove = async (s: Source, label: string) => {
    if (await askConfirm({ title: `Remove ${label}?`, text: "Its products leave the catalog.", action: "Remove", danger: true })) await run(`rm-${s.id}`, () => act("remove", { sourceId: s.id }));
  };
  const upload = async (f: File | undefined) => {
    if (!f) return;
    await run("csv", async () => act("csv", { text: await f.text(), name: f.name }));
    if (file.current) file.current.value = "";
  };

  const tile = (logo: React.ReactNode, title: string, s: Source | null, body: React.ReactNode, label: string) => (
    <div className="aw-frame flex flex-col gap-3 p-4">
      <div className="flex items-center gap-2.5">
        {logo}
        <span className="min-w-0 flex-1 text-[14px] font-medium text-ink">{title}</span>
        {s ? <SourceStatus s={s} /> : null}
      </div>
      {s?.error ? <p className="aw-error text-[12.5px]">{s.error}</p> : null}
      {s && s.name && s.kind !== "csv" ? <span className="aw-small">{s.name}</span> : null}
      {canEdit ? (
        <div className="flex flex-wrap items-center gap-2">
          {body}
          {s ? (
            <>
              {s.kind !== "csv" && s.status !== "syncing" && (s.kind !== "merchant" || s.account) ? (
                <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm" disabled={Boolean(busy)} onClick={() => run(`sync-${s.id}`, () => act("sync", { sourceId: s.id }))}>
                  Sync now
                </button>
              ) : null}
              <button type="button" className="aw-text-link text-[13px]" disabled={Boolean(busy)} onClick={() => remove(s, label)}>
                Remove
              </button>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );

  const shopify = src("shopify");
  const csv = src("csv");
  const total = state?.sources.reduce((n, s) => n + s.products, 0) ?? 0;
  return (
    <SidePanel title="Catalog" onClose={onClose} narrow>
      {!state ? (
        error ? <p className="aw-error">{error}</p> : <Thinking text="Loading..." />
      ) : (
        <div className="flex flex-col gap-4">
          {notice ? <div className="aw-callout">{notice}</div> : null}
          {fail || error ? <p className="aw-error">{fail || error}</p> : null}
          {total ? <span className="aw-label">{total.toLocaleString()} products</span> : null}

          {tile(
            <BrandLogo src={favicon("shopify.com")} name="Shopify" size={22} />,
            "Shopify",
            shopify,
            shopify ? null : state.shopifyStores.length ? (
              <>
                {state.shopifyStores.length > 1 ? (
                  <Dropdown label="Shopify store" value={store || state.shopifyStores[0].id} onChange={setStore} className="aw-dropdown--sm" options={state.shopifyStores.map((s) => ({ id: s.id, label: s.name }))} />
                ) : null}
                <button type="button" className="aw-btn aw-btn--primary aw-btn--sm" disabled={Boolean(busy)} onClick={() => run("shopify", () => act("shopify", { connectionId: store || state.shopifyStores[0].id }))}>
                  {state.shopifyStores.length > 1 ? "Use this store" : `Use ${state.shopifyStores[0].name}`}
                </button>
              </>
            ) : (
              <button type="button" className="aw-btn aw-btn--primary aw-btn--sm" onClick={onPublishing}>
                Connect Shopify
              </button>
            ),
            "Shopify",
          )}

          {tile(
            <BrandLogo src={favicon("google.com")} name="Google Merchant Center" size={22} />,
            "Google Merchant Center",
            merchant,
            !merchant ? (
              <button
                type="button"
                className="aw-btn aw-btn--primary aw-btn--sm"
                disabled={Boolean(busy) || !state.merchantReady}
                onClick={() =>
                  run("merchant", async () => {
                    const d = await act("merchant", { back: `${window.location.pathname}?catalog=open` });
                    window.location.href = String(d.url);
                  })
                }
              >
                Connect Merchant Center
              </button>
            ) : needsAccount ? (
              accounts === null ? (
                <Thinking text="Loading accounts..." />
              ) : accounts.length ? (
                <>
                  <Dropdown label="Merchant Center account" value={account} onChange={setAccount} className="aw-dropdown--sm" options={accounts.map((a) => ({ id: a.id, label: a.name }))} />
                  <button type="button" className="aw-btn aw-btn--primary aw-btn--sm" disabled={Boolean(busy) || !account} onClick={() => run("account", () => act("account", { account }))}>
                    Use this account
                  </button>
                </>
              ) : (
                <span className="aw-small">No Merchant Center accounts on {merchant.email ?? "this Google account"}.</span>
              )
            ) : null,
            "Merchant Center",
          )}

          {tile(
            <span className="grid size-[22px] place-items-center rounded-md bg-surface-2 text-muted" aria-hidden="true">
              <svg className="aw-icon size-3.5" viewBox="0 0 24 24">
                <path d="M12 16V5M7 10l5-5 5 5M5 19h14" />
              </svg>
            </span>,
            "CSV",
            csv,
            <>
              <input ref={file} type="file" accept=".csv,.tsv,text/csv,text/plain" className="hidden" onChange={(e) => upload(e.target.files?.[0])} />
              <button type="button" className={`aw-btn aw-btn--sm ${csv ? "aw-btn--secondary" : "aw-btn--primary"}`} disabled={Boolean(busy)} onClick={() => file.current?.click()}>
                {busy === "csv" ? "Reading..." : csv ? "Replace file" : "Upload CSV"}
              </button>
            </>,
            "the CSV",
          )}
        </div>
      )}
    </SidePanel>
  );
}

// ─────────────── The page ───────────────

export function ShoppingPage({ auth, brand, canEdit, onPublishing }: { auth: RunAuth; brand: BrandRef; canEdit: boolean; onPublishing: () => void }) {
  const { state, error, reload } = useShop(auth, brand.id);
  // Back from Merchant Center's sign-in: open the panel and say how it went, then tidy the address.
  const [back] = useState(() => (typeof window === "undefined" ? null : new URLSearchParams(window.location.search)));
  const result = back?.get("catalog");
  const [open, setOpen] = useState(Boolean(result));
  const [notice] = useState(result === "error" ? (back?.get("reason") ?? "Could not connect.") : result === "connected" ? "Merchant Center connected." : "");
  useEffect(() => {
    if (result) window.history.replaceState(null, "", window.location.pathname);
  }, [result]);

  const close = useCallback(() => {
    setOpen(false);
    reload();
  }, [reload]);
  const panel = open ? <CatalogPanel auth={auth} brand={brand} canEdit={canEdit} onClose={close} onPublishing={onPublishing} notice={notice} /> : null;
  const catalogButton = (
    <button type="button" className="aw-btn aw-btn--primary" onClick={() => setOpen(true)}>
      Catalog
    </button>
  );

  if (!state) return error ? <p className="aw-error">{error}</p> : <Thinking text="Loading..." />;
  if (!state.products.length) {
    const reading = state.sources.some((s) => s.status === "syncing" || s.status === "new");
    return (
      <div className="flex flex-col gap-5">
        {panel}
        <EmptyScreen
          drawing="shop"
          title={reading ? "Reading your products" : "Track your products in AI answers"}
          action={
            canEdit ? (
              <button type="button" className="aw-btn aw-btn--primary" onClick={() => setOpen(true)}>
                {state.sources.length ? "Open catalog" : "Connect a store"}
              </button>
            ) : undefined
          }
        >
          See which products ChatGPT and Google AI Mode show, where and at what price.
        </EmptyScreen>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {panel}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="aw-label">{state.products.length.toLocaleString()} products</span>
        {catalogButton}
      </div>
      <section className="aw-frame overflow-x-auto">
        <table className="aw-table">
          <thead>
            <tr>
              <th>Product</th>
              <th className="text-right">Price</th>
              <th className="text-right">Variants</th>
              <th>Stock</th>
            </tr>
          </thead>
          <tbody>
            {state.products.map((p) => (
              <tr key={p.id} className="[&>td]:align-middle">
                <td>
                  <span className="flex min-w-0 items-center gap-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {p.image ? <img src={p.image} alt="" className="size-9 shrink-0 rounded-md border border-rule object-cover" loading="lazy" /> : <span className="size-9 shrink-0 rounded-md bg-surface-2" />}
                    {p.url ? (
                      <a href={p.url} target="_blank" rel="noopener noreferrer" className="min-w-0 break-words text-ink">
                        {p.title}
                      </a>
                    ) : (
                      <span className="min-w-0 break-words text-ink">{p.title}</span>
                    )}
                  </span>
                </td>
                <td className="aw-num text-right whitespace-nowrap">{priceText(p)}</td>
                <td className="aw-num text-right">{p.variants}</td>
                <td>{p.in_stock === null ? <span className="text-muted">–</span> : <span className={`aw-status ${p.in_stock ? "aw-status--ranked" : "aw-status--missed"}`}>{p.in_stock ? "In stock" : "Out of stock"}</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
