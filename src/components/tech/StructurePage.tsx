"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { RunAuth } from "@/lib/runner";
import { folderOf, type Suggestion } from "@/lib/tech/structure";
import { C, HBars } from "../backlinks/charts";
import { downloadCsv } from "../research/shared";
import { Card, Seg, SidePanel, StatStrip, Thinking } from "../ui";
import { StructureIntro } from "../ToolIntros";
import { useApi } from "../ZippiePage";

// Technical SEO, Site structure (docs/technical-seo-plan.md, phase 3): the latest crawl as a map by folder and click
// depth, how deep the pages that earn clicks sit, pages that need more internal links with suggested links, orphans,
// the internal link score and redirects.

type Brand = { id: string; name: string; domain: string };
type Weak = { url: string; depth: number | null; linksIn: number; rank: number | null; clicks: number; title: string };
type Data = {
  crawl: { id: string; at: string; pages: number; root: string | null; gsc: boolean } | null;
  folders: { folder: string; pages: number; depth: number | null; linksIn: number; clicks: number; rank: number | null }[];
  depth: { pages: number; valuable: number }[];
  weak: Weak[];
  orphans: { url: string; title: string | null; clicks: number }[];
  lowRank: Weak[];
  topRank: { url: string; rank: number | null; linksIn: number }[];
  chains: { url: string; chain: { url: string; status: number }[] }[];
  redirectLinks: { from: string; to: string }[];
  sample: { url: string; depth: number | null; rank: number | null; indexable: boolean }[];
};
type List = "weak" | "orphans" | "low" | "redirects";

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));
const num = (x: number) => x.toLocaleString("en-US");
const short = (u: string, root?: string | null) => {
  try {
    const x = new URL(u);
    return root && x.origin === new URL(root).origin ? x.pathname + x.search : u.replace(/^https?:\/\//, "");
  } catch {
    return u;
  }
};
const rankText = (r: number | null) => (r === null ? "–" : r.toFixed(1));

export function StructurePage({ brand, auth }: { brand: Brand; auth: RunAuth }) {
  const api = useApi(auth);
  const call = useCallback(<T,>(action: string, extra: Record<string, unknown> = {}) => api<T>("/api/tech", { action, brandId: brand.id, ...extra }), [api, brand.id]);
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [list, setList] = useState<List>("weak");
  const [open, setOpen] = useState<Weak | null>(null);

  useEffect(() => {
    let gone = false;
    call<Data>("structure")
      .then((d) => !gone && setData(d))
      .catch((e) => !gone && setError(msg(e)));
    return () => {
      gone = true;
    };
  }, [call]);

  const head = <h1 className="aw-h2 mb-0!">Site structure</h1>;
  if (!data) return <div className="flex flex-col gap-6">{head}{error ? <p className="aw-error">{error}</p> : <Thinking text="Loading" />}</div>;
  if (!data.crawl)
    return (
      <div className="flex flex-col gap-6">
        {head}
        <p className="aw-callout">Run a Site Audit to map {brand.domain}.</p>
        <StructureIntro />
      </div>
    );

  const root = data.crawl.root;
  const linked = data.depth.reduce((a, d) => a + d.pages, 0);
  const avg = linked ? data.depth.reduce((a, d, i) => a + d.pages * i, 0) / linked : 0;
  const deep = data.depth.slice(4).reduce((a, d) => a + d.pages, 0);
  const lists: { id: List; label: string }[] = [
    { id: "weak", label: `Need links ${data.weak.length}` },
    { id: "orphans", label: `Orphans ${data.orphans.length}` },
    { id: "low", label: "Lowest link score" },
    { id: "redirects", label: `Redirects ${data.chains.length + data.redirectLinks.length}` },
  ];

  return (
    <div className="flex flex-col gap-4">
      {head}
      {error ? <p className="aw-error">{error}</p> : null}
      <StatStrip
        stats={[
          { label: "Pages crawled", value: num(data.crawl.pages), sub: `Crawled ${new Date(data.crawl.at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` },
          { label: "Average depth", value: linked ? avg.toFixed(1) : "–", sub: "Clicks from home" },
          { label: "4+ clicks deep", value: num(deep), tone: deep ? "warn" : undefined },
          { label: "Orphans", value: num(data.orphans.length), tone: data.orphans.length ? "neg" : undefined },
          { label: "Redirect chains", value: num(data.chains.length), tone: data.chains.length ? "warn" : undefined },
          { label: "Links to redirects", value: num(data.redirectLinks.length), tone: data.redirectLinks.length ? "warn" : undefined },
        ]}
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <Card title="Crawl map" action={<MapKey />}>
          <div className="px-5 pb-5">
            <CrawlMap sample={data.sample} folders={data.folders} root={root} />
          </div>
        </Card>
        <Card title="Pages by click depth" action={data.crawl.gsc ? <span className="text-[12px] text-muted">With search clicks in green</span> : null}>
          <div className="flex flex-col gap-2.5 px-5 pb-5">
            <DepthBars depth={data.depth} gsc={data.crawl.gsc} />
          </div>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Card
          title={`${data.folders.length} folders`}
          action={
            <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm" onClick={() => downloadCsv("site-structure-folders.csv", ["folder", "pages", "average depth", "link score", "links in", "clicks"], data.folders.map((f) => [f.folder, f.pages, f.depth ?? "", f.rank ?? "", f.linksIn, f.clicks]))}>
              Export CSV
            </button>
          }
        >
          <div className="overflow-x-auto">
            <table className="aw-table">
              <thead>
                <tr>
                  <th>Folder</th>
                  <th className="text-right">Pages</th>
                  <th className="text-right">Avg depth</th>
                  <th className="text-right">Link score</th>
                  <th className="text-right">Links in</th>
                  {data.crawl.gsc ? <th className="text-right">Clicks</th> : null}
                </tr>
              </thead>
              <tbody>
                {data.folders.map((f) => (
                  <tr key={f.folder}>
                    <td className="font-medium wrap-anywhere text-ink">{f.folder}</td>
                    <td className="aw-num text-right">{num(f.pages)}</td>
                    <td className={`aw-num text-right ${(f.depth ?? 0) >= 4 ? "text-[var(--aw-warn)]" : ""}`}>{f.depth ?? "–"}</td>
                    <td className="aw-num text-right">{rankText(f.rank)}</td>
                    <td className="aw-num text-right">{num(f.linksIn)}</td>
                    {data.crawl!.gsc ? <td className="aw-num text-right">{num(f.clicks)}</td> : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <Card title="Highest link score">
          <div className="px-5 pb-5">
            {data.topRank.length ? <HBars rows={data.topRank.map((p) => ({ key: p.url, label: short(p.url, root), value: p.rank ?? 0, color: C.signal }))} fmt={(v) => v.toFixed(1)} /> : <p className="text-[13px] text-muted">No scores yet.</p>}
          </div>
        </Card>
      </div>

      <Card title="Pages to fix" action={<Seg label="List" value={list} onChange={setList} options={lists} />}>
        {list === "weak" ? (
          <PageTable rows={data.weak} root={root} gsc={data.crawl.gsc} onSuggest={setOpen} empty="Every page that earns clicks has strong internal links." />
        ) : list === "low" ? (
          <PageTable rows={data.lowRank} root={root} gsc={data.crawl.gsc} onSuggest={setOpen} empty="No scores yet." />
        ) : list === "orphans" ? (
          data.orphans.length ? (
            <div className="overflow-x-auto">
              <table className="aw-table">
                <thead>
                  <tr>
                    <th>Page in a sitemap with no internal links</th>
                    {data.crawl.gsc ? <th className="text-right">Clicks</th> : null}
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {data.orphans.map((o) => (
                    <tr key={o.url}>
                      <td className="max-w-[560px] min-w-60">
                        <span className="block font-medium wrap-anywhere text-ink">{short(o.url, root)}</span>
                        {o.title ? <span className="block text-[12px] wrap-break-word text-muted">{o.title}</span> : null}
                      </td>
                      {data.crawl!.gsc ? <td className="aw-num text-right">{num(o.clicks)}</td> : null}
                      <td className="text-right">
                        <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm" onClick={() => setOpen({ url: o.url, title: o.title ?? "", depth: null, linksIn: 0, rank: null, clicks: o.clicks })}>
                          Suggest links
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="px-5 pb-5 text-[13px] text-muted">Every page in your sitemaps has internal links.</p>
          )
        ) : (
          <Redirects chains={data.chains} links={data.redirectLinks} root={root} />
        )}
      </Card>
      {open ? <SuggestPanel page={open} root={root} call={call} onClose={() => setOpen(null)} /> : null}
    </div>
  );
}

function MapKey() {
  const dot = (color: string, label: string, hollow = false) => (
    <span className="flex items-center gap-1.5">
      <span className="inline-block h-2 w-2 rounded-full" style={hollow ? { border: `1.5px solid ${C.light}` } : { background: color }} />
      {label}
    </span>
  );
  return (
    <span className="flex flex-wrap items-center gap-3 text-[12px] text-muted">
      {dot(C.signal, "Strong links")}
      {dot(C.sky, "Some")}
      {dot(C.light, "Weak")}
      {dot("", "Not indexable", true)}
    </span>
  );
}

/** Each page as a dot: its folder sets the angle, its click depth the ring. Pages not linked from home sit outside. */
function CrawlMap({ sample, folders, root }: { sample: Data["sample"]; folders: Data["folders"]; root: string | null }) {
  const S = 420;
  const mid = S / 2;
  const ring = (d: number | null) => (d === null ? 196 : 18 + Math.min(6, d) * 28);
  const dots = useMemo(() => {
    const shown = folders.slice(0, 11).map((f) => f.folder);
    const key = (u: string) => {
      const f = folderOf(u);
      return shown.includes(f) ? f : "Other";
    };
    const groups = [...shown, "Other"].map((f) => ({ folder: f, pages: sample.filter((p) => key(p.url) === f) })).filter((g) => g.pages.length);
    const total = groups.reduce((a, g) => a + g.pages.length, 0) || 1;
    let start = -Math.PI / 2;
    const sectors: { folder: string; a0: number; a1: number }[] = [];
    const out: { x: number; y: number; url: string; rank: number | null; indexable: boolean; depth: number | null }[] = [];
    for (const g of groups) {
      const span = (g.pages.length / total) * Math.PI * 2;
      sectors.push({ folder: g.folder, a0: start, a1: start + span });
      g.pages.forEach((p, i) => {
        // A steady spread inside the sector: the golden ratio keeps dots apart without randomness.
        const t = ((i * 0.618034) % 1) * 0.86 + 0.07;
        const a = start + span * t;
        const r = p.url === root ? 0 : ring(p.depth) + (((i * 7) % 5) - 2) * 2.5;
        out.push({ x: mid + Math.cos(a) * r, y: mid + Math.sin(a) * r, url: p.url, rank: p.rank, indexable: p.indexable, depth: p.depth });
      });
      start += span;
    }
    return { out, sectors };
  }, [sample, folders, root, mid]);
  const color = (r: number | null) => (r === null ? C.light : r >= 6 ? C.signal : r >= 3 ? C.sky : C.light);
  return (
    <svg viewBox={`-120 -24 ${S + 240} ${S + 48}`} className="h-auto w-full" role="img" aria-label="Map of crawled pages by folder and click depth">
      {[1, 2, 3, 4, 5, 6].map((d) => (
        <circle key={d} cx={mid} cy={mid} r={ring(d)} fill="none" stroke="var(--aw-rule)" strokeDasharray={d >= 4 ? "3 4" : undefined} />
      ))}
      {[1, 2, 3, 4, 5, 6].map((d) => (
        <text key={d} x={mid + 3} y={mid - ring(d) + 10} fill="var(--aw-muted)" style={{ font: "9.5px Inter, system-ui, sans-serif" }}>
          {d === 6 ? "6+" : d}
        </text>
      ))}
      {dots.sectors.map((s) => (
        <line key={s.folder} x1={mid} y1={mid} x2={mid + Math.cos(s.a0) * 186} y2={mid + Math.sin(s.a0) * 186} stroke="var(--aw-rule)" />
      ))}
      {dots.out.map((p) => (
        <circle key={p.url} cx={p.x} cy={p.y} r={p.url === root ? 6 : 2.6} fill={p.indexable ? color(p.rank) : "none"} stroke={p.indexable ? "none" : C.light} strokeWidth="1.2">
          <title>{`${short(p.url, root)}, ${p.depth === null ? "not linked from home" : `${p.depth} clicks`}, link score ${rankText(p.rank)}`}</title>
        </circle>
      ))}
      {dots.sectors
        .filter((s) => s.a1 - s.a0 > 0.16)
        .map((s) => {
          const a = (s.a0 + s.a1) / 2;
          const x = mid + Math.cos(a) * 214;
          const y = mid + Math.sin(a) * 214;
          return (
            <text key={s.folder} x={x} y={y} textAnchor={Math.abs(Math.cos(a)) < 0.3 ? "middle" : Math.cos(a) > 0 ? "start" : "end"} dominantBaseline="middle" fill="var(--aw-ink)" style={{ font: "500 11px Inter, system-ui, sans-serif" }}>
              {s.folder === "/" ? "Top level" : s.folder}
            </text>
          );
        })}
    </svg>
  );
}

function DepthBars({ depth, gsc }: { depth: Data["depth"]; gsc: boolean }) {
  const max = Math.max(1, ...depth.map((d) => d.pages));
  return (
    <>
      {depth.map((d, i) => (
        <div key={i} className="grid grid-cols-[72px_minmax(0,1fr)_88px] items-center gap-3 text-[13px]">
          <span className="text-body">{i === 0 ? "Home" : `${i === 6 ? "6+" : i} ${i === 1 ? "click" : "clicks"}`}</span>
          <span className="relative block h-3 bg-[var(--aw-surface-2)]">
            <span className="absolute inset-y-0 left-0 block" style={{ width: `${(d.pages / max) * 100}%`, background: i >= 4 ? C.warn : C.sky }} />
            {gsc ? <span className="absolute inset-y-0 left-0 block" style={{ width: `${(d.valuable / max) * 100}%`, background: C.green }} /> : null}
          </span>
          <span className="aw-num text-right text-ink">
            {num(d.pages)}
            {gsc && d.valuable ? <span className="text-muted"> / {num(d.valuable)}</span> : null}
          </span>
        </div>
      ))}
    </>
  );
}

function PageTable({ rows, root, gsc, onSuggest, empty }: { rows: Weak[]; root: string | null; gsc: boolean; onSuggest: (p: Weak) => void; empty: string }) {
  if (!rows.length) return <p className="px-5 pb-5 text-[13px] text-muted">{empty}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="aw-table">
        <thead>
          <tr>
            <th>Page</th>
            {gsc ? <th className="text-right">Clicks</th> : null}
            <th className="text-right">Depth</th>
            <th className="text-right">Links in</th>
            <th className="text-right">Link score</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.url}>
              <td className="max-w-[560px] min-w-60">
                <span className="block font-medium wrap-anywhere text-ink">{short(p.url, root)}</span>
                {p.title ? <span className="block text-[12px] wrap-break-word text-muted">{p.title}</span> : null}
              </td>
              {gsc ? <td className="aw-num text-right">{num(p.clicks)}</td> : null}
              <td className={`aw-num text-right ${(p.depth ?? 0) >= 4 ? "text-[var(--aw-warn)]" : ""}`}>{p.depth ?? "–"}</td>
              <td className={`aw-num text-right ${p.linksIn <= 2 ? "text-[var(--aw-warn)]" : ""}`}>{num(p.linksIn)}</td>
              <td className={`aw-num text-right ${(p.rank ?? 10) < 3 ? "text-[var(--aw-warn)]" : ""}`}>{rankText(p.rank)}</td>
              <td className="text-right">
                <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm" onClick={() => onSuggest(p)}>
                  Suggest links
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Redirects({ chains, links, root }: { chains: Data["chains"]; links: Data["redirectLinks"]; root: string | null }) {
  if (!chains.length && !links.length) return <p className="px-5 pb-5 text-[13px] text-muted">No redirect chains and no links to redirects.</p>;
  return (
    <div className="flex flex-col gap-5 px-5 pb-5 text-[13px]">
      {chains.length ? (
        <div>
          <h3 className="aw-h4 mb-2">Redirect chains ({num(chains.length)})</h3>
          <ul className="flex flex-col gap-2">
            {chains.map((c) => (
              <li key={c.url} className="flex flex-wrap items-center gap-1.5">
                {c.chain.map((h, i) => (
                  <span key={i} className="flex min-w-0 items-center gap-1.5">
                    <span className="wrap-anywhere text-ink">{short(h.url, root)}</span>
                    <span className={`aw-status ${h.status >= 200 && h.status < 300 ? "aw-status--ranked" : h.status >= 300 && h.status < 400 ? "aw-status--warn" : "aw-status--missed"}`}>{h.status || "No answer"}</span>
                    {i < c.chain.length - 1 ? <span className="text-muted">→</span> : null}
                  </span>
                ))}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {links.length ? (
        <div>
          <h3 className="aw-h4 mb-2">Links to redirects ({num(links.length)})</h3>
          <div className="overflow-x-auto">
            <table className="aw-table">
              <thead>
                <tr>
                  <th>On page</th>
                  <th>Links to</th>
                </tr>
              </thead>
              <tbody>
                {links.map((l) => (
                  <tr key={`${l.from} ${l.to}`}>
                    <td className="wrap-anywhere">{short(l.from, root)}</td>
                    <td className="wrap-anywhere">{short(l.to, root)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Copy({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="aw-btn aw-btn--secondary aw-btn--sm"
      onClick={() =>
        navigator.clipboard.writeText(text).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 2000);
        })
      }
    >
      {done ? "Copied" : "Copy"}
    </button>
  );
}

function SuggestPanel({ page, root, call, onClose }: { page: Weak; root: string | null; call: <T>(action: string, extra?: Record<string, unknown>) => Promise<T>; onClose: () => void }) {
  const [res, setRes] = useState<{ anchor: string; suggestions: Suggestion[] } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let gone = false;
    call<{ anchor: string; suggestions: Suggestion[] }>("suggest", { url: page.url })
      .then((r) => !gone && setRes(r))
      .catch((e) => !gone && setError(msg(e)));
    return () => {
      gone = true;
    };
  }, [call, page.url]);
  const html = res ? `<a href="${page.url}">${res.anchor}</a>` : "";
  return (
    <SidePanel title={short(page.url, root)} kicker="Suggested internal links" onClose={onClose}>
      {error ? (
        <p className="aw-error">{error}</p>
      ) : !res ? (
        <Thinking text="Finding pages" />
      ) : (
        <div className="flex flex-col gap-5 text-[13px]">
          <div className="flex flex-col gap-2">
            <h3 className="aw-h4 mb-0">Anchor text</h3>
            <div className="flex flex-wrap items-center gap-2">
              <span className="min-w-0 flex-1 font-medium wrap-break-word text-ink">{res.anchor || "–"}</span>
              {res.anchor ? <Copy text={html} /> : null}
            </div>
            {res.anchor ? <code className="block bg-[var(--aw-surface-2)] px-2 py-1.5 text-[12px] wrap-anywhere">{html}</code> : null}
          </div>
          <div>
            <h3 className="aw-h4 mb-2">Add the link on these pages</h3>
            {res.suggestions.length ? (
              <ul className="flex flex-col gap-3">
                {res.suggestions.map((s) => (
                  <li key={s.from} className="flex flex-col gap-0.5 border-t border-[var(--aw-rule)] pt-3 first:border-t-0 first:pt-0">
                    <span className="flex flex-wrap items-center justify-between gap-2">
                      <a href={s.from} target="_blank" rel="noreferrer" className="min-w-0 font-medium wrap-anywhere text-ink hover:underline">
                        {short(s.from, root)}
                      </a>
                      <span className="aw-num text-muted">Link score {rankText(s.rank)}</span>
                    </span>
                    {s.title ? <span className="wrap-break-word text-muted">{s.title}</span> : null}
                    <span className="flex flex-wrap gap-1 pt-1">
                      {s.shared.map((w) => (
                        <span key={w} className="aw-tag">
                          {w}
                        </span>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted">No other page shares this page&apos;s topic.</p>
            )}
          </div>
        </div>
      )}
    </SidePanel>
  );
}
