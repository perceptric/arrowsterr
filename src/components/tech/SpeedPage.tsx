"use client";

import { useCallback, useEffect, useState } from "react";
import type { RunAuth } from "@/lib/runner";
import { byUrl } from "@/lib/tech/checks";
import { METRICS, passes, rate, showMetric, type HistoryPoint, type Metric, type Rating, type Vitals } from "@/lib/tech/google";
import { C, HBars, LineChart, Stack } from "../backlinks/charts";
import { downloadCsv } from "../research/shared";
import { Card, Seg, SidePanel, Thinking } from "../ui";
import { SpeedIntro } from "../ToolIntros";
import { useApi } from "../ZippiePage";

// Technical SEO, Speed (docs/technical-seo-plan.md, phase 2): Core Web Vitals for real Chrome visitors from the Chrome
// UX Report, for the whole site on phones and computers with about 6 months of weekly history, by template and for the
// brand's most visited pages, plus PageSpeed Insights lab tests that name the fixes.

type Brand = { id: string; name: string; domain: string };
type Origin = { form_factor: string; fetched_at: string; vitals: Vitals; history: Partial<Record<Metric, HistoryPoint[]>> };
type UrlRow = { url: string; form_factor: string; fetched_at: string; vitals: Vitals; source: string; lab: Lab | null };
type Lab = { url: string; strategy: string; score: number | null; lab: { lcp: { ms: number } | null; cls: { value: number } | null; tbt: { ms: number } | null; fcp: { ms: number } | null; si: { ms: number } | null }; field: unknown; fixes: { title: string; savingsMs: number }[] };
type Data = { cruxReady: boolean; origin: Origin[]; urls: UrlRow[]; templates: { map: Record<string, string>; names: Record<string, string> } };

const CLS: Record<Rating, string> = { good: "aw-status--ranked", ni: "aw-status--warn", poor: "aw-status--missed" };
const WORD: Record<Rating, string> = { good: "Good", ni: "Needs work", poor: "Poor" };
const path = (u: string) => {
  try {
    const x = new URL(u);
    return x.pathname + x.search;
  } catch {
    return u;
  }
};
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function SpeedPage({ brand, auth, canEdit }: { brand: Brand; auth: RunAuth; canEdit: boolean }) {
  const api = useApi(auth);
  const call = useCallback(<T,>(action: string, extra: Record<string, unknown> = {}) => api<T>("/api/tech", { action, brandId: brand.id, ...extra }), [api, brand.id]);
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [device, setDevice] = useState<"phone" | "desktop">("phone");
  const [metric, setMetric] = useState<Metric>("lcp");
  const [busy, setBusy] = useState("");
  const [lab, setLab] = useState<Lab | null>(null);
  const [testUrl, setTestUrl] = useState("");

  const load = useCallback(async () => {
    try {
      setData(await call<Data>("speed"));
    } catch (e) {
      setError(msg(e));
    }
  }, [call]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function test(url: string) {
    setBusy(url);
    setError("");
    // The first test also starts the real-visitor fetch, so the page needs no second button.
    if (canEdit && data && !data.origin.length) call("sync").catch(() => {});
    try {
      setLab((await call<{ lab: Lab }>("lab", { url, device: device === "desktop" ? "desktop" : "mobile" })).lab);
    } catch (e) {
      setError(msg(e));
    } finally {
      setBusy("");
    }
  }
  async function sync() {
    setBusy("sync");
    try {
      await call("sync");
      setError("");
    } catch (e) {
      setError(msg(e));
    } finally {
      setBusy("");
    }
  }

  const head = (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <h1 className="aw-h2 mb-0!">Speed</h1>
      {data?.origin.length ? (
        <span className="flex flex-wrap items-center gap-2">
          <Seg label="Device" value={device} onChange={setDevice} options={[{ id: "phone", label: "Phones" }, { id: "desktop", label: "Computers" }]} />
          {canEdit ? (
            <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm" onClick={sync} disabled={busy === "sync"}>
              {busy === "sync" ? "Starting" : "Sync now"}
            </button>
          ) : null}
        </span>
      ) : null}
    </div>
  );
  const labPanel = lab ? <LabPanel lab={lab} onClose={() => setLab(null)} /> : null;
  const tester = canEdit ? (
    <form
      className="aw-frame flex flex-wrap items-center gap-3 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (testUrl.trim()) test(testUrl.trim());
      }}
    >
      <input className="aw-input h-11! min-w-56 flex-1 py-0!" value={testUrl} onChange={(e) => setTestUrl(e.target.value)} placeholder={`${brand.domain}/pricing`} aria-label="Page to test" />
      <button type="submit" className="aw-btn aw-btn--primary" disabled={Boolean(busy) || !testUrl.trim()}>
        {busy && busy !== "sync" ? "Running" : "Run"}
      </button>
    </form>
  ) : null;

  if (!data) return <div className="flex flex-col gap-6">{head}{error ? <p className="aw-error">{error}</p> : <Thinking text="Loading" />}</div>;
  const o = data.origin.find((x) => x.form_factor === device);
  const v = o?.vitals ?? {};
  if (!data.cruxReady || !data.origin.length || !v.lcp)
    return (
      <div className="flex flex-col gap-6">
        {head}
        {error ? <p className="aw-error">{error}</p> : null}
        {!data.cruxReady ? (
          <p className="aw-callout">The Chrome UX Report isn&apos;t set up on the server. Add CRUX_API_KEY (a Google Cloud key with the Chrome UX Report API turned on).</p>
        ) : data.origin.length ? (
          <p className="aw-callout">Google has too few Chrome visits to {brand.domain} on {device === "phone" ? "phones" : "computers"} to report real-visitor speed. Lab tests still work.</p>
        ) : null}
        {tester}
        <SpeedIntro />
        {labPanel}
      </div>
    );

  const verdict = passes(v);
  const hist = o?.history?.[metric] ?? [];
  const points = hist.filter((h) => h.value !== null);
  const def = METRICS.find((m) => m.id === metric)!;
  const pages = data.urls.filter((u) => u.form_factor === "phone" && u.source === "crux" && u.vitals.lcp);
  const tpl = new Map<string, { good: number; all: number }>();
  for (const p of pages) {
    const t = byUrl(data.templates.map, p.url);
    const name = t ? (data.templates.names[t] ?? t) : "Other pages";
    const cur = tpl.get(name) ?? { good: 0, all: 0 };
    cur.all++;
    if (rate("lcp", p.vitals.lcp!.p75) === "good") cur.good++;
    tpl.set(name, cur);
  }
  const worst = [...pages].sort((a, b) => (b.vitals.lcp?.p75 ?? 0) - (a.vitals.lcp?.p75 ?? 0));

  return (
    <div className="flex flex-col gap-4">
      {head}
      {error ? <p className="aw-error">{error}</p> : null}
      <div className="flex flex-wrap items-center gap-3 text-[13px] text-muted">
        <span className={`aw-status ${verdict ? "aw-status--ranked" : "aw-status--missed"}`}>Core Web Vitals: {verdict ? "Passed" : "Failed"} on {device === "phone" ? "phones" : "computers"}</span>
        <span>Real Chrome visitors, last 28 days, updated {o ? new Date(o.fetched_at).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "–"}</span>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {(["lcp", "inp", "cls"] as const).map((m) => {
          const x = v[m];
          const d = METRICS.find((y) => y.id === m)!;
          return (
            <section key={m} className="aw-frame flex flex-col gap-3 px-5 py-4">
              <span className="flex items-center justify-between gap-2">
                <span className="text-[13px] font-medium text-muted">{d.label}</span>
                {x ? <span className={`aw-status ${CLS[rate(m, x.p75)]}`}>{WORD[rate(m, x.p75)]}</span> : null}
              </span>
              <span className="aw-num text-[30px] leading-tight font-semibold tracking-[-0.03em] text-ink">{x ? showMetric(m, x.p75) : "–"}</span>
              {x ? (
                <>
                  <Stack parts={[{ label: "Good", value: x.good, color: C.pos }, { label: "Needs work", value: x.ni, color: C.warn }, { label: "Poor", value: x.poor, color: C.neg }]} />
                  <span className="text-[12px] text-muted">
                    {Math.round(x.good)}% good, {Math.round(x.ni)}% needs work, {Math.round(x.poor)}% poor
                  </span>
                </>
              ) : (
                <span className="text-[12px] text-muted">Not enough data</span>
              )}
            </section>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-4 text-[13px] text-body">
        {(["ttfb", "fcp"] as const).map((m) => (v[m] ? <span key={m}>{METRICS.find((x) => x.id === m)!.label}: <b className="font-semibold text-ink">{showMetric(m, v[m]!.p75)}</b></span> : null))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Card title={`${def.label} over 6 months`} action={<Seg label="Metric" value={metric} onChange={setMetric} options={METRICS.filter((m) => o?.history?.[m.id]?.length).map((m) => ({ id: m.id, label: m.id.toUpperCase() }))} />}>
          <div className="px-5 pb-5">
            {points.length > 1 ? (
              <LineChart
                series={[{ name: def.label, color: C.signal, values: points.map((p) => p.value!), width: 2.5 }]}
                labels={points.map((p) => new Date(p.end).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }))}
                every={Math.ceil(points.length / 6)}
                fmt={(x) => showMetric(metric, x)}
                line={{ value: def.good, label: "Good" }}
                label={`${def.label} by week`}
              />
            ) : (
              <p className="text-[13.5px] text-body">No history yet.</p>
            )}
          </div>
        </Card>
        <Card title="Good LCP by template" action={<span className="text-[12px] text-muted">Phones</span>}>
          <div className="px-5 pb-5">
            {tpl.size ? <HBars rows={[...tpl.entries()].sort((a, b) => a[1].good / a[1].all - b[1].good / b[1].all).map(([name, x]) => ({ key: name, label: `${name} (${x.all})`, value: Math.round((x.good / x.all) * 100), color: x.good / x.all < 0.75 ? C.warn : C.pos }))} unit="%" /> : <p className="text-[13.5px] text-body">Google has page-level data for none of your pages yet.</p>}
          </div>
        </Card>
      </div>

      {tester}

      <Card
        title={`${pages.length} pages with real-visitor data`}
        action={
          <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm" disabled={!pages.length} onClick={() => downloadCsv("speed-pages.csv", ["url", "lcp ms", "inp ms", "cls", "fetched"], worst.map((p) => [p.url, p.vitals.lcp?.p75 ?? "", p.vitals.inp?.p75 ?? "", p.vitals.cls?.p75 ?? "", p.fetched_at]))}>
            Export CSV
          </button>
        }
      >
        {worst.length ? (
          <div className="overflow-x-auto">
            <table className="aw-table">
              <thead>
                <tr>
                  <th>Page</th>
                  <th>Template</th>
                  <th className="text-right">LCP</th>
                  <th className="text-right">INP</th>
                  <th className="text-right">CLS</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {worst.slice(0, 200).map((p) => (
                  <tr key={p.url}>
                    <td className="max-w-96 min-w-56 font-medium wrap-anywhere text-ink">{path(p.url)}</td>
                    <td>
                      <span className="aw-tag">{(() => {
                        const t = byUrl(data.templates.map, p.url);
                        return t ? (data.templates.names[t] ?? t) : "–";
                      })()}</span>
                    </td>
                    {(["lcp", "inp", "cls"] as const).map((m) => (
                      <td key={m} className="text-right">
                        {p.vitals[m] ? <span className={`aw-status ${CLS[rate(m, p.vitals[m]!.p75)]}`}>{showMetric(m, p.vitals[m]!.p75)}</span> : <span className="text-muted">–</span>}
                      </td>
                    ))}
                    <td className="text-right">
                      {canEdit ? (
                        <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm" onClick={() => test(p.url)} disabled={Boolean(busy)}>
                          {busy === p.url ? "Testing" : "Lab test"}
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="px-5 pb-5 text-[13.5px] text-body">Google reports page-level data only for pages with enough Chrome visits. The site-wide numbers above cover every page.</p>
        )}
      </Card>
      {labPanel}
    </div>
  );
}

function LabPanel({ lab, onClose }: { lab: Lab; onClose: () => void }) {
  const row = (label: string, value: string | null) => (
    <div className="flex items-center justify-between gap-3 border-t border-[var(--aw-rule)] py-2 text-[13.5px] first:border-t-0">
      <span className="text-muted">{label}</span>
      <span className="aw-num font-medium text-ink">{value ?? "–"}</span>
    </div>
  );
  return (
    <SidePanel title={path(lab.url)} kicker={`Lab test, ${lab.strategy === "desktop" ? "computer" : "phone"}`} onClose={onClose}>
      <div className="flex flex-col gap-5">
        <div className="flex items-center gap-3">
          <span className={`aw-num text-[34px] font-semibold ${lab.score === null ? "text-muted" : lab.score >= 90 ? "text-pos" : lab.score >= 50 ? "text-[var(--aw-warn)]" : "text-neg"}`}>{lab.score ?? "–"}</span>
          <span className="text-[13px] text-muted">Lighthouse performance score</span>
        </div>
        <div className="flex flex-col">
          {row("Largest Contentful Paint", lab.lab.lcp ? showMetric("lcp", lab.lab.lcp.ms) : null)}
          {row("Cumulative Layout Shift", lab.lab.cls ? showMetric("cls", lab.lab.cls.value) : null)}
          {row("Total Blocking Time", lab.lab.tbt ? `${lab.lab.tbt.ms} ms` : null)}
          {row("First Contentful Paint", lab.lab.fcp ? showMetric("fcp", lab.lab.fcp.ms) : null)}
          {row("Speed Index", lab.lab.si ? showMetric("fcp", lab.lab.si.ms) : null)}
        </div>
        <div>
          <h3 className="aw-h4 mb-2">Biggest fixes</h3>
          {lab.fixes.length ? (
            <ul className="flex flex-col gap-2 text-[13.5px]">
              {lab.fixes.map((f) => (
                <li key={f.title} className="flex items-center justify-between gap-3">
                  <span className="text-body">{f.title}</span>
                  <span className="aw-num shrink-0 text-muted">saves {(f.savingsMs / 1000).toFixed(1)} s</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[13.5px] text-body">No big savings found.</p>
          )}
        </div>
      </div>
    </SidePanel>
  );
}
