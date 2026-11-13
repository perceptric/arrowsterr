"use client";

import { useEffect, useState } from "react";
import type { RunAuth } from "@/lib/runner";
import type { ShopReport } from "@/lib/shopReportServer";
import type { Rate } from "@/lib/shopNumbers";
import { askConfirm } from "./Dialogs";
import { EmptyScreen } from "./Drawing";
import { post } from "./research/shared";
import { TrendChart, type Line } from "./TrendChart";
import { favicon, OTHER_COLORS, Seg, StatStrip, Thinking, YOU_COLOR } from "./ui";

// AI Shopping's tabs (docs/ai-shopping-plan.md, sections 6 to 8): Overview, Products, Prompts, Stores and Sources.

type BrandRef = { id: string; name: string; domain: string };
export type ShopTab = "overview" | "products" | "prompts" | "stores" | "sources";
const TABS: { id: ShopTab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "products", label: "Products" },
  { id: "prompts", label: "Prompts" },
  { id: "stores", label: "Stores" },
  { id: "sources", label: "Sources" },
];

const pctText = (r: Rate | null | undefined) => (r ? `${Math.round(r.p * 100)}%` : "–");
const rangeText = (r: Rate | null | undefined) => (r ? `${Math.round(r.lo * 100)}–${Math.round(r.hi * 100)}%` : "Too few runs");
const posText = (n: number | null | undefined) => (n === null || n === undefined ? "–" : n.toFixed(1));
const money = (n: number | null | undefined) => (n === null || n === undefined ? "–" : `$${Number(n) % 1 ? Number(n).toFixed(2) : Number(n)}`);
const host = (u: string) => {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return u;
  }
};

/** A change, colored only when it's real (the two-proportion test); otherwise gray. */
function Change({ now, before, real, points = true }: { now: number | null; before: number | null; real: boolean; points?: boolean }) {
  if (now === null || before === null) return null;
  const d = Math.round((now - before) * (points ? 100 : 10)) / (points ? 1 : 10);
  if (!d) return null;
  const tone = !real ? "text-muted" : d > 0 ? "text-pos" : "text-neg";
  return <span className={`aw-num text-[12px] ${tone}`}>{`${d > 0 ? "+" : ""}${d}${points ? " pts" : ""}`}</span>;
}

function ShareBar({ r, color = YOU_COLOR }: { r: Rate | null; color?: string }) {
  return (
    <span className="flex items-center gap-2" title={rangeText(r)}>
      <span className="h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-surface-2">
        <span className="block h-full" style={{ width: `${Math.round((r?.p ?? 0) * 100)}%`, background: color }} />
      </span>
      <span className="aw-num">{r ? pctText(r) : <span className="text-muted">Too few runs</span>}</span>
    </span>
  );
}

const FLAG: Record<string, { label: string; tone: string }> = {
  own_price: { label: "Your price differs", tone: "aw-status--missed" },
  below_floor: { label: "Under your floor", tone: "aw-status--missed" },
  out_of_stock: { label: "Out of stock", tone: "aw-status--missed" },
  reseller: { label: "Reseller", tone: "aw-status--warn" },
};

export function ShoppingReport({ auth, brand, canEdit, onCatalog }: { auth: RunAuth; brand: BrandRef; canEdit: boolean; onCatalog: () => void }) {
  const [tab, setTab] = useState<ShopTab>("overview");
  const [days, setDays] = useState<"7" | "30" | "90">("30");
  const [engine, setEngine] = useState<"all" | "gpt" | "aim">("all");
  const [report, setReport] = useState<ShopReport | null>(null);
  const [error, setError] = useState("");
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true;
    post<ShopReport>(auth, "/api/shop", { action: "report", brandId: brand.id, days: Number(days), engine })
      .then((r) => live && (setReport(r), setError("")))
      .catch((e) => live && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      live = false;
    };
  }, [auth, brand.id, days, engine, tick]);
  const reload = () => setTick((t) => t + 1);

  const head = (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="aw-tabs flex max-w-full overflow-x-auto" role="tablist" aria-label="AI Shopping">
        {TABS.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}>
            {t.label}
            {t.id === "products" && report ? <span className="ml-1.5 text-muted">{report.products.length}</span> : null}
            {t.id === "prompts" && report ? <span className="ml-1.5 text-muted">{report.prompts.length}</span> : null}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Seg label="AI" value={engine} onChange={setEngine} options={[{ id: "all", label: "Both" }, { id: "gpt", label: "ChatGPT" }, { id: "aim", label: "AI Mode" }]} />
        <Seg label="Range" value={days} onChange={setDays} options={[{ id: "7", label: "7 days" }, { id: "30", label: "30 days" }, { id: "90", label: "90 days" }]} />
        <button type="button" className="aw-btn aw-btn--primary" onClick={onCatalog}>
          Catalog
        </button>
      </div>
    </div>
  );

  if (!report) return error ? <p className="aw-error">{error}</p> : <Thinking text="Loading..." />;
  const noPrompts = !report.prompts.length;
  return (
    <div className="flex flex-col gap-5">
      {head}
      {error ? <p className="aw-error">{error}</p> : null}
      {tab === "prompts" || noPrompts ? (
        <Prompts auth={auth} brand={brand} canEdit={canEdit} report={report} onChange={reload} empty={noPrompts} />
      ) : !report.totals.runs ? (
        <EmptyScreen drawing="waiting" title="First answers on the way">
          Numbers show after the first runs on ChatGPT and Google AI Mode.
        </EmptyScreen>
      ) : tab === "overview" ? (
        <Overview report={report} brand={brand} />
      ) : tab === "products" ? (
        <Products report={report} />
      ) : tab === "stores" ? (
        <Stores report={report} />
      ) : (
        <Sources report={report} />
      )}
    </div>
  );
}

// ─────────────── Overview ───────────────

function Overview({ report: r, brand }: { report: ShopReport; brand: BrandRef }) {
  const n = r.numbers;
  const b = r.before;
  const rivals = Object.keys(r.weekly[0]?.rivals ?? {});
  const lines: Line[] = [{ name: brand.name, color: YOU_COLOR, isYou: true }, ...rivals.map((name, i) => ({ name, color: OTHER_COLORS[i % OTHER_COLORS.length], isYou: false }))];
  const points = r.weekly.map((w) => ({ label: new Date(`${w.week}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }), at: w.week, values: Object.fromEntries([[brand.name, w.you === null ? null : w.you * 100], ...rivals.map((x) => [x, w.rivals[x] === null ? null : w.rivals[x]! * 100])]) }));
  const top = r.brands.filter((x) => x.share).slice(0, 6);
  return (
    <>
      <StatStrip
        stats={[
          { label: "Product share", value: pctText(n.productShare), delta: <Change now={n.productShare?.p ?? null} before={b.productShare?.p ?? null} real={r.shareChange.real} />, sub: rangeText(n.productShare) },
          { label: "Avg card position", value: posText(n.avgPosition), sub: b.avgPosition !== null && n.avgPosition !== null ? `was ${posText(b.avgPosition)}` : undefined },
          { label: "Products seen", value: <>{n.productsSeen}<span className="text-muted text-[13px]"> of {r.products.length}</span></> },
          { label: "Prompts you're in", value: <>{n.promptsIn}<span className="text-muted text-[13px]"> of {n.prompts}</span></> },
          { label: "Card rate", value: pctText(n.cardRate), sub: `${r.totals.runs.toLocaleString()} runs` },
        ]}
      />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <section className="aw-frame">
          <div className="aw-frame__head justify-between">
            <h2 className="aw-h4">Product share by week</h2>
          </div>
          <div className="p-4">{points.length > 1 ? <TrendChart points={points} lines={lines} metric="visibility" mode="line" /> : <p className="aw-small">The chart starts after two weeks of runs.</p>}</div>
        </section>
        <section className="aw-frame">
          <div className="aw-frame__head justify-between">
            <h2 className="aw-h4">Brands</h2>
          </div>
          <ol className="flex flex-col gap-1 p-3">
            {top.map((x, i) => (
              <li key={x.name} className={`flex items-center gap-3 rounded-md px-2 py-2 ${x.you ? "bg-surface-2" : ""}`}>
                <span className="aw-num w-4 text-right text-[12px] text-muted">{i + 1}</span>
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <div className="flex flex-wrap items-baseline justify-between gap-2 text-[13px]">
                    <span className="break-words font-medium text-ink">{x.name}</span>
                    <span className="flex items-baseline gap-1.5">
                      <span className="aw-num">{pctText(x.share)}</span>
                      <Change now={x.share?.p ?? null} before={x.before} real={x.change.real} />
                    </span>
                  </div>
                  <span className="h-1.5 overflow-hidden rounded-full bg-surface-2">
                    <span className="block h-full" style={{ width: `${Math.round((x.share?.p ?? 0) * 100)}%`, background: x.you ? YOU_COLOR : OTHER_COLORS[i % OTHER_COLORS.length] }} />
                  </span>
                </div>
              </li>
            ))}
          </ol>
        </section>
      </div>
      <Products report={r} limit={5} />
    </>
  );
}

// ─────────────── Products ───────────────

function Products({ report: r, limit }: { report: ShopReport; limit?: number }) {
  const list = limit ? r.products.filter((p) => p.runs).slice(0, limit) : r.products;
  if (!list.length) return null;
  return (
    <section className="aw-frame overflow-x-auto">
      {limit ? (
        <div className="aw-frame__head">
          <h2 className="aw-h4">Your products in AI answers</h2>
        </div>
      ) : null}
      <table className="aw-table aw-table--keep">
        <thead>
          <tr>
            <th>Product</th>
            <th>Product share</th>
            <th className="text-right">Avg position</th>
            <th className="text-right">Prompts</th>
            <th>Store shown most</th>
            <th className="text-right">Price shown</th>
          </tr>
        </thead>
        <tbody>
          {list.map((p) => {
            const flags = Object.keys(p.flags).filter((f) => FLAG[f]);
            const ownPrice = Boolean(p.flags.own_price);
            return (
              <tr key={p.id} className="[&>td]:align-middle!">
                <td>
                  <span className="flex min-w-0 items-center gap-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {p.image ? <img src={p.image} alt="" className="size-9 shrink-0 rounded-md border border-rule object-cover" loading="lazy" /> : <span className="size-9 shrink-0 rounded-md bg-surface-2" />}
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="break-words text-ink">{p.title}</span>
                      {p.reason ? <span className="break-words text-[12px] text-muted">{p.reason}</span> : null}
                      {flags.length ? (
                        <span className="flex flex-wrap gap-1">
                          {flags.map((f) => (
                            <span key={f} className={`aw-status ${FLAG[f].tone}`}>
                              {FLAG[f].label}
                            </span>
                          ))}
                        </span>
                      ) : null}
                    </span>
                  </span>
                </td>
                <td>{p.runs ? <ShareBar r={p.share} /> : <span className="aw-status aw-status--missed">Not seen</span>}</td>
                <td className="aw-num text-right">{posText(p.avgPosition)}</td>
                <td className="aw-num text-right">{p.prompts}</td>
                <td className="break-words">{p.store ?? "–"}</td>
                <td className="aw-num text-right whitespace-nowrap">
                  {p.priceShown === null ? (
                    "–"
                  ) : (
                    <>
                      <span className={ownPrice ? "font-medium text-neg" : ""}>{money(p.priceShown)}</span>
                      {p.price !== null && Math.abs(p.priceShown - p.price) > 1 ? <span className="ml-1.5 text-[12px] text-muted">yours {money(p.price)}</span> : null}
                    </>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

// ─────────────── Prompts ───────────────

function Prompts({ auth, brand, canEdit, report: r, onChange, empty }: { auth: RunAuth; brand: BrandRef; canEdit: boolean; report: ShopReport; onChange: () => void; empty: boolean }) {
  const [text, setText] = useState("");
  const [ideas, setIdeas] = useState<{ prompt: string; category: string }[] | null>(null);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  async function run(name: string, fn: () => Promise<unknown>) {
    setBusy(name);
    setError("");
    try {
      await fn();
      onChange();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy("");
    }
  }
  const suggest = () =>
    run("suggest", async () => {
      const d = await post<{ prompts: { prompt: string; category: string }[] }>(auth, "/api/shop", { action: "suggest", brandId: brand.id });
      setIdeas(d.prompts);
      setPicked(new Set(d.prompts.map((_, i) => i)));
    });
  const add = (list: { prompt: string; category?: string | null }[]) =>
    run("add", async () => {
      await post(auth, "/api/shop", { action: "prompts_add", brandId: brand.id, prompts: list });
      setIdeas(null);
      setText("");
    });

  const adder = canEdit ? (
    <div className="flex flex-col gap-3">
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) add([{ prompt: text.trim() }]);
        }}
      >
        <input className="aw-input min-w-0 flex-1" value={text} onChange={(e) => setText(e.target.value)} placeholder="best trail running shoes under $150" aria-label="New prompt" />
        <button type="submit" className="aw-btn aw-btn--secondary" disabled={!text.trim() || Boolean(busy)}>
          Add
        </button>
        <button type="button" className="aw-btn aw-btn--primary" disabled={Boolean(busy)} onClick={suggest}>
          {busy === "suggest" ? "Thinking..." : "Suggest prompts"}
        </button>
      </form>
      {ideas ? (
        <section className="aw-frame flex flex-col gap-2 p-4">
          {ideas.length ? (
            <>
              {ideas.map((q, i) => (
                <label key={q.prompt} className="flex items-start gap-2 text-[13px]">
                  <input type="checkbox" className="mt-0.5" checked={picked.has(i)} onChange={() => setPicked((s) => (s.has(i) ? new Set([...s].filter((x) => x !== i)) : new Set([...s, i])))} />
                  <span className="min-w-0 flex-1 break-words text-ink">{q.prompt}</span>
                  <span className="text-muted">{q.category}</span>
                </label>
              ))}
              <div className="flex justify-end gap-2">
                <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm" onClick={() => setIdeas(null)}>
                  Cancel
                </button>
                <button type="button" className="aw-btn aw-btn--primary aw-btn--sm" disabled={!picked.size || Boolean(busy)} onClick={() => add(ideas.filter((_, i) => picked.has(i)))}>
                  Track {picked.size}
                </button>
              </div>
            </>
          ) : (
            <p className="aw-small">No new prompts. Add your own above.</p>
          )}
        </section>
      ) : null}
    </div>
  ) : null;

  if (empty)
    return (
      <div className="flex flex-col gap-4">
        {error ? <p className="aw-error">{error}</p> : null}
        {ideas ? adder : null}
        {!ideas ? (
          <EmptyScreen
            drawing="prompts"
            title="Pick your shopping prompts"
            action={
              canEdit ? (
                <button type="button" className="aw-btn aw-btn--primary" disabled={Boolean(busy)} onClick={suggest}>
                  {busy === "suggest" ? "Thinking..." : "Suggest prompts"}
                </button>
              ) : undefined
            }
          >
            Questions shoppers ask, run twice a day on ChatGPT and AI Mode.
          </EmptyScreen>
        ) : null}
      </div>
    );

  return (
    <div className="flex flex-col gap-4">
      {error ? <p className="aw-error">{error}</p> : null}
      {adder}
      <section className="aw-frame overflow-x-auto">
        <table className="aw-table aw-table--keep">
          <thead>
            <tr>
              <th>Prompt</th>
              <th>Product share</th>
              <th className="text-right">Card rate</th>
              <th className="text-right">Avg position</th>
              <th>Deep check</th>
              {canEdit ? <th className="w-px" /> : null}
            </tr>
          </thead>
          <tbody>
            {r.prompts.map((q) => (
              <tr key={q.id} className={`[&>td]:align-middle! ${q.active ? "" : "opacity-60"}`}>
                <td>
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="break-words text-ink">{q.prompt}</span>
                    {q.category ? <span className="text-[12px] text-muted">{q.category}</span> : null}
                  </span>
                </td>
                <td>{q.runs ? <ShareBar r={q.share} /> : <span className="text-muted">–</span>}</td>
                <td className="aw-num text-right">{pctText(q.cardRate)}</td>
                <td className="aw-num text-right">{posText(q.avgPosition)}</td>
                <td>
                  <span className="flex flex-wrap items-center gap-2">
                    {q.deep ? <span className="aw-num text-[12.5px]">{q.deep.cardRuns ? `${q.deep.you} of ${q.deep.cardRuns}` : `0 of ${q.deep.runs}`}</span> : null}
                    {canEdit ? (
                      <>
                        <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm" disabled={busy === `deep-${q.id}`} onClick={() => run(`deep-${q.id}`, () => post(auth, "/api/shop", { action: "deep", brandId: brand.id, promptId: q.id, engine: "gpt" }))} title="20 runs on ChatGPT">
                          ChatGPT
                        </button>
                        <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm" disabled={busy === `deep-${q.id}`} onClick={() => run(`deep-${q.id}`, () => post(auth, "/api/shop", { action: "deep", brandId: brand.id, promptId: q.id, engine: "aim" }))} title="20 runs on Google AI Mode">
                          AI Mode
                        </button>
                      </>
                    ) : null}
                  </span>
                </td>
                {canEdit ? (
                  <td>
                    <span className="flex items-center gap-1">
                      <button type="button" className="aw-text-link text-[12.5px]" onClick={() => run(`act-${q.id}`, () => post(auth, "/api/shop", { action: "prompt_update", brandId: brand.id, id: q.id, active: !q.active }))}>
                        {q.active ? "Pause" : "Resume"}
                      </button>
                      <button
                        type="button"
                        className="aw-iconbtn"
                        aria-label={`Delete ${q.prompt}`}
                        title="Delete"
                        onClick={async () => {
                          if (await askConfirm({ title: "Delete this prompt?", text: "Its runs and numbers go with it.", action: "Delete", danger: true })) run(`rm-${q.id}`, () => post(auth, "/api/shop", { action: "prompt_remove", brandId: brand.id, id: q.id }));
                        }}
                      >
                        <svg className="aw-icon" viewBox="0 0 24 24" aria-hidden="true">
                          <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />
                        </svg>
                      </button>
                    </span>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

// ─────────────── Stores ───────────────

function Stores({ report: r }: { report: ShopReport }) {
  if (!r.stores.length) return <EmptyScreen drawing="sources" title="No stores yet" fill={false} />;
  return (
    <section className="aw-frame overflow-x-auto">
      <table className="aw-table aw-table--keep">
        <thead>
          <tr>
            <th>Store</th>
            <th className="text-right">Your cards</th>
            <th className="text-right">All cards</th>
            <th className="text-right">Price gaps</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {r.stores.map((s) => (
            <tr key={s.name} className="[&>td]:align-middle!">
              <td className="break-words text-ink">{s.name}</td>
              <td className="aw-num text-right">{s.you}</td>
              <td className="aw-num text-right">{s.cards}</td>
              <td className="aw-num text-right">{s.gaps || "–"}</td>
              <td>{s.own ? <span className="aw-status aw-status--ranked">Your store</span> : null}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

// ─────────────── Sources ───────────────

function Sources({ report: r }: { report: ShopReport }) {
  if (!r.sources.length) return <EmptyScreen drawing="sources" title="No sources yet" fill={false} />;
  return (
    <section className="aw-frame overflow-x-auto">
      <table className="aw-table aw-table--keep">
        <thead>
          <tr>
            <th>Page</th>
            <th className="text-right">Runs it backed your cards</th>
          </tr>
        </thead>
        <tbody>
          {r.sources.map((s) => (
            <tr key={s.url} className="[&>td]:align-middle!">
              <td>
                <a href={s.url} target="_blank" rel="noopener noreferrer" className="flex min-w-0 items-center gap-2 text-ink">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={favicon(host(s.url))} alt="" className="size-4 shrink-0" />
                  <span className="min-w-0 wrap-anywhere">{s.url.replace(/^https?:\/\/(www\.)?/, "")}</span>
                </a>
              </td>
              <td className="aw-num text-right">
                {s.runs} <span className="text-muted">({Math.round(s.share * 100)}%)</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
