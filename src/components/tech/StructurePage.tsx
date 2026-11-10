"use client";

import { useCallback, useEffect, useState } from "react";
import type { RunAuth } from "@/lib/runner";
import type { Suggestion } from "@/lib/tech/structure";
import { C } from "../backlinks/charts";
import { Card, Seg, SidePanel, StatStrip, Thinking } from "../ui";
import { StructureIntro } from "../ToolIntros";
import { useApi } from "../ZippiePage";

// Technical SEO, Site structure (docs/technical-seo-plan.md, phase 3): from the latest crawl, how many clicks from the
// home page each page sits, then one list of pages to fix: pages that need links (with suggested links), orphans and
// redirects.

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
type List = "weak" | "orphans" | "redirects";

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
  const deep = data.depth.slice(4).reduce((a, d) => a + d.pages, 0);
  const redirects = data.chains.length + data.redirectLinks.length;
  const lists: { id: List; label: string }[] = [
    { id: "weak", label: `Need links ${data.weak.length}` },
    { id: "orphans", label: `Orphans ${data.orphans.length}` },
    { id: "redirects", label: `Redirects ${redirects}` },
  ];

  return (
    <div className="flex flex-col gap-4">
      {head}
      {error ? <p className="aw-error">{error}</p> : null}
      <StatStrip
        stats={[
          { label: "Pages crawled", value: num(data.crawl.pages), sub: `Crawled ${new Date(data.crawl.at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` },
          { label: "Need links", value: num(data.weak.length), tone: data.weak.length ? "warn" : undefined },
          { label: "Orphans", value: num(data.orphans.length), tone: data.orphans.length ? "neg" : undefined },
          { label: "4+ clicks from home", value: num(deep), tone: deep ? "warn" : undefined },
        ]}
      />

      <Card title="Clicks from the home page" action={data.crawl.gsc ? <span className="text-[12px] text-muted">Pages with search clicks in green</span> : null}>
        <div className="flex flex-col gap-2.5 px-5 pb-5">
          <DepthBars depth={data.depth} gsc={data.crawl.gsc} />
        </div>
      </Card>

      <Card title="Pages to fix" action={<Seg label="List" value={list} onChange={setList} options={lists} />}>
        {list === "weak" ? (
          <PageTable rows={data.weak} root={root} gsc={data.crawl.gsc} onSuggest={setOpen} empty="Every page that earns clicks has enough internal links." />
        ) : list === "orphans" ? (
          data.orphans.length ? (
            <div className="overflow-x-auto">
              <table className="aw-table">
                <thead>
                  <tr>
                    <th>Page with no internal links</th>
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

function DepthBars({ depth, gsc }: { depth: Data["depth"]; gsc: boolean }) {
  const max = Math.max(1, ...depth.map((d) => d.pages));
  return (
    <>
      {depth.map((d, i) => (
        <div key={i} className="grid grid-cols-[88px_minmax(0,1fr)_88px] items-center gap-3 text-[13px]">
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
            <th className="text-right">Clicks from home</th>
            <th className="text-right">Links in</th>
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
