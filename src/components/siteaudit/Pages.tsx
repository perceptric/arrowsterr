"use client";

import { useCallback, useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AuditResult } from "@/lib/audit";
import { CHECKS } from "@/lib/tech/checks";
import type { PageFacts } from "@/lib/tech/parse";
import { rawShare, type Rendered } from "@/lib/tech/render";
import { Dropdown } from "../Pickers";
import { downloadCsv } from "../research/shared";
import { Card, SidePanel, Thinking } from "../ui";
import { num, SEV, SevDot, short } from "./shared";

// Every crawled URL from crawl_pages, read as the signed-in person (viewers may read), with quick filters, a template
// and issue filter, sorting, 100 rows a page, and a panel with everything the crawl saw on one page.

type PageRow = { url: string; status: number; template: string | null; indexable: boolean; reason: string | null; depth: number | null; words: number; links_in: number; ms: number; in_sitemap: boolean; title: string | null; issues: string[]; rendered_words: number | null; internal_rank: number | null };
type Quick = "all" | "errors" | "notindexable" | "orphans" | "deep" | "issues" | "nositemap";
type Sort = "url" | "links_in" | "depth" | "words" | "ms" | "status" | "internal_rank";
const QUICK: { id: Quick; label: string }[] = [
  { id: "all", label: "All" },
  { id: "errors", label: "Errors" },
  { id: "notindexable", label: "Not indexable" },
  { id: "orphans", label: "Orphans" },
  { id: "deep", label: "4+ clicks deep" },
  { id: "issues", label: "With issues" },
  { id: "nositemap", label: "Not in sitemap" },
];
const COLS = "url, status, template, indexable, reason, depth, words, links_in, ms, in_sitemap, title, issues, rendered_words, internal_rank";
const PAGE = 100;
/** The share of the rendered text the raw HTML already had, for pages Chromium rendered. */
const rawPct = (r: Pick<PageRow, "words" | "rendered_words">) => (r.rendered_words === null ? null : rawShare(r.words, { words: r.rendered_words }));

export function Pages({ sb, auditId, result, issue, onIssue }: { sb: SupabaseClient; auditId: string; result: AuditResult; issue: string | null; onIssue: (id: string | null) => void }) {
  const [quick, setQuick] = useState<Quick>("all");
  const [template, setTemplate] = useState("");
  const [q, setQ] = useState("");
  const [typed, setTyped] = useState("");
  const [sort, setSort] = useState<{ by: Sort; asc: boolean }>({ by: "url", asc: true });
  const [rows, setRows] = useState<PageRow[] | null>(null);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(0);
  const [error, setError] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const root = result.root;

  const query = useCallback(
    (cols: string, from: number, to: number) => {
      let x = sb.from("crawl_pages").select(cols, { count: "exact" }).eq("audit_id", auditId);
      if (quick === "errors") x = x.or("status.gte.400,status.eq.0");
      if (quick === "notindexable") x = x.eq("indexable", false);
      if (quick === "orphans") x = x.eq("in_sitemap", true).eq("links_in", 0);
      if (quick === "deep") x = x.gte("depth", 4);
      if (quick === "issues") x = x.neq("issues", "{}");
      if (quick === "nositemap") x = x.eq("in_sitemap", false).eq("indexable", true);
      if (template) x = x.eq("template", template);
      if (issue) x = x.contains("issues", [issue]);
      if (q) x = x.ilike("url", `%${q.replace(/[%_]/g, "")}%`);
      return x.order(sort.by, { ascending: sort.asc, nullsFirst: false }).order("url").range(from, to);
    },
    [sb, auditId, quick, template, issue, q, sort],
  );

  useEffect(() => {
    let gone = false;
     
    setRows(null);
    query(COLS, page * PAGE, page * PAGE + PAGE - 1).then(({ data, count: c, error: err }) => {
      if (gone) return;
      if (err) setError(/crawl_pages/.test(err.message) ? "Run supabase/067_crawler.sql on the VPS database." : err.message);
      setRows((data ?? []) as unknown as PageRow[]);
      setCount(c ?? 0);
    });
    return () => {
      gone = true;
    };
  }, [query, page]);

  const reset = (fn: () => void) => {
    fn();
    setPage(0);
  };
  async function csv() {
    const { data } = await query(COLS, 0, 9999);
    downloadCsv("site-audit-pages.csv", ["url", "status", "template", "indexable", "reason", "depth", "words", "rendered words", "raw text %", "links in", "link score", "response ms", "in sitemap", "title", "issues"], ((data ?? []) as unknown as PageRow[]).map((r) => [r.url, r.status, r.template, r.indexable ? "yes" : "no", r.reason, r.depth, r.words, r.rendered_words, rawPct(r) ?? "", r.links_in, r.internal_rank, r.ms, r.in_sitemap ? "yes" : "no", r.title, r.issues.join(" ")]));
  }
  const th = (by: Sort, children: string, right = false) => (
    <th key={by} className={right ? "text-right" : undefined}>
      <button type="button" className="font-medium hover:text-ink" onClick={() => reset(() => setSort({ by, asc: sort.by === by ? !sort.asc : by === "url" }))}>
        {children}
        {sort.by === by ? (sort.asc ? " ↑" : " ↓") : ""}
      </button>
    </th>
  );
  const templates = result.stats?.templates ?? [];

  return (
    <>
      <Card
        title={rows === null ? "Pages" : `${num(count)} ${count === 1 ? "page" : "pages"}`}
        action={
          <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm" onClick={csv} disabled={!count}>
            Export CSV
          </button>
        }
      >
        <div className="flex flex-wrap items-center gap-2 border-b border-[var(--aw-rule)] px-5 pb-3">
          {QUICK.map((x) => (
            <button key={x.id} type="button" aria-pressed={quick === x.id} onClick={() => reset(() => setQuick(x.id))} className="aw-chip aw-chip--btn">
              {x.label}
            </button>
          ))}
          {templates.length > 1 ? <Dropdown label="Template" value={template} onChange={(v) => reset(() => setTemplate(v))} options={[{ id: "", label: "Every template" }, ...templates.map((t) => ({ id: t.pattern, label: `${t.name} (${t.pages})` }))]} /> : null}
          {issue ? (
            <button type="button" aria-pressed className="aw-chip aw-chip--btn" onClick={() => reset(() => onIssue(null))}>
              {CHECKS[issue]?.title ?? issue} ×
            </button>
          ) : null}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              reset(() => setQ(typed.trim()));
            }}
          >
            <input className="aw-input py-1.5! text-[13px]!" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="URL contains" aria-label="URL contains" />
          </form>
        </div>
        {error ? <p className="aw-error px-5 py-3">{error}</p> : null}
        {rows === null ? (
          <div className="p-5">
            <Thinking text="Loading" />
          </div>
        ) : rows.length ? (
          <div className="overflow-x-auto">
            <table className="aw-table">
              <thead>
                <tr>
                  {th("url", "URL")}
                  <th>Template</th>
                  {th("status", "Status")}
                  <th>Indexable</th>
                  {th("words", "Words", true)}
                  {th("depth", "Depth", true)}
                  <th className="text-right">Raw text</th>
                  {th("links_in", "Links in", true)}
                  {th("internal_rank", "Link score", true)}
                  {th("ms", "Response", true)}
                  <th>Issues</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.url} className="cursor-pointer" onClick={() => setOpen(r.url)}>
                    <td className="max-w-96 min-w-60">
                      <span className="block font-medium text-ink wrap-anywhere">{short(r.url, root)}</span>
                      {r.title ? <span className="block text-[12px] text-muted wrap-break-word">{r.title}</span> : null}
                    </td>
                    <td>
                      <span className="aw-tag">{templates.find((t) => t.pattern === r.template)?.name ?? r.template ?? "–"}</span>
                    </td>
                    <td>
                      <span className={`aw-status ${r.status >= 200 && r.status < 300 ? "aw-status--ranked" : r.status >= 300 && r.status < 400 ? "aw-status--warn" : "aw-status--missed"}`}>{r.status || "No answer"}</span>
                    </td>
                    <td>{r.indexable ? <span className="aw-status aw-status--ranked">Yes</span> : <span className="text-[12.5px] text-muted">{r.reason ?? "No"}</span>}</td>
                    <td className="aw-num text-right">{num(r.words)}</td>
                    <td className="aw-num text-right">{r.depth ?? "–"}</td>
                    <td className="aw-num text-right">{(() => {
                      const x = rawPct(r);
                      return x === null ? <span className="text-muted">–</span> : <span className={x < 30 ? "text-neg" : x < 70 ? "text-[var(--aw-warn)]" : ""}>{x}%</span>;
                    })()}</td>
                    <td className="aw-num text-right">{num(r.links_in)}</td>
                    <td className="aw-num text-right">{r.internal_rank === null ? <span className="text-muted">–</span> : r.internal_rank.toFixed(1)}</td>
                    <td className={`aw-num text-right ${r.ms > 1000 ? "text-neg" : ""}`}>{(r.ms / 1000).toFixed(2)} s</td>
                    <td>{r.issues.length ? <span className="aw-num text-[13px] text-ink">{r.issues.length}</span> : <span className="text-muted">–</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="px-5 py-5 text-[13px] text-muted">No pages match these filters.</p>
        )}
        {count > PAGE ? (
          <div className="flex flex-wrap items-center gap-3 px-5 py-4 text-[13px] text-muted">
            <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm" disabled={page === 0} onClick={() => setPage(page - 1)}>
              Previous
            </button>
            <span>
              {num(page * PAGE + 1)} to {num(Math.min(count, page * PAGE + PAGE))} of {num(count)}
            </span>
            <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm" disabled={(page + 1) * PAGE >= count} onClick={() => setPage(page + 1)}>
              Next
            </button>
          </div>
        ) : null}
      </Card>
      {open ? <PagePanel sb={sb} auditId={auditId} url={open} root={root} onClose={() => setOpen(null)} /> : null}
    </>
  );
}

type Full = PageRow & { rendered: Rendered | null; shot: string | null; facts: { final?: string; chain?: { url: string; status: number }[]; loop?: boolean; bytes?: number; compressed?: boolean; type?: string; page?: Omit<PageFacts, "internal" | "external">; links?: { u: string; a: string; n: number }[]; ext?: string[] } };

function PagePanel({ sb, auditId, url, root, onClose }: { sb: SupabaseClient; auditId: string; url: string; root?: string; onClose: () => void }) {
  const [row, setRow] = useState<Full | null>(null);
  const [linksIn, setLinksIn] = useState<string[] | null>(null);
  const [tab, setTab] = useState<"overview" | "issues" | "links" | "rendering">("overview");
  useEffect(() => {
    sb.from("crawl_pages")
      .select(`${COLS}, facts, rendered, shot`)
      .eq("audit_id", auditId)
      .eq("url", url)
      .maybeSingle()
      .then(({ data }) => setRow(data as unknown as Full));
  }, [sb, auditId, url]);
  useEffect(() => {
    if (tab !== "links" || linksIn) return;
    // Pages that link here: the saved links of each page are searched on the server side by JSON containment.
    sb.from("crawl_pages")
      .select("url")
      .eq("audit_id", auditId)
      .contains("facts", { links: [{ u: url }] })
      .limit(50)
      .then(({ data }) => setLinksIn((data ?? []).map((d) => d.url as string)));
  }, [tab, linksIn, sb, auditId, url]);

  const f = row?.facts.page;
  const kv = (label: string, value: React.ReactNode) => (
    <div className="grid grid-cols-[minmax(110px,150px)_minmax(0,1fr)] gap-3 border-t border-[var(--aw-rule)] py-2 text-[13px] first:border-t-0">
      <span className="text-muted">{label}</span>
      <span className="min-w-0 text-ink wrap-anywhere">{value}</span>
    </div>
  );
  return (
    <SidePanel title={short(url, root)} kicker={row?.template ?? undefined} onClose={onClose}>
      {!row ? (
        <Thinking text="Loading" />
      ) : (
        <div className="flex flex-col gap-4">
          <div role="tablist" className="flex gap-1 border-b border-[var(--aw-rule)]">
            {(["overview", "issues", "links", ...(row.rendered ? (["rendering"] as const) : [])] as const).map((t) => (
              <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`-mb-px border-b-2 px-3 py-2 text-[13.5px] font-medium ${tab === t ? "border-[var(--signal)] text-ink" : "border-transparent text-muted"}`}>
                {t === "overview" ? "Overview" : t === "issues" ? `Issues ${row.issues.length}` : t === "links" ? "Links" : "Rendering"}
              </button>
            ))}
          </div>
          {tab === "overview" ? (
            <div className="flex flex-col">
              {kv(
                "Status",
                <span className="flex flex-wrap items-center gap-1.5">
                  {(row.facts.chain ?? [{ url, status: row.status }]).map((h, i, all) => (
                    <span key={i} className="flex items-center gap-1.5">
                      <span className={`aw-status ${h.status >= 200 && h.status < 300 ? "aw-status--ranked" : h.status >= 300 && h.status < 400 ? "aw-status--warn" : "aw-status--missed"}`}>{h.status || "No answer"}</span>
                      {i < all.length - 1 ? <span className="text-muted">→ {short(all[i + 1].url, root)} →</span> : null}
                    </span>
                  ))}
                  {row.facts.loop ? <span className="aw-status aw-status--missed">Loop</span> : null}
                </span>,
              )}
              {kv("Indexable", row.indexable ? "Yes" : `No: ${row.reason ?? "unknown"}`)}
              {f ? (
                <>
                  {kv("Title", f.title ? `${f.title} (${f.title.length} characters)` : <span className="text-neg">Missing</span>)}
                  {kv("Description", f.description ? `${f.description} (${f.description.length})` : <span className="text-neg">Missing</span>)}
                  {kv("H1", f.h1.length ? f.h1.join(" | ") : <span className="text-neg">Missing</span>)}
                  {kv("Canonical", f.canonical ? (f.canonical === row.url || f.canonical === row.facts.final ? "Points to itself" : short(f.canonical, root)) : "None")}
                  {kv("Robots", [f.metaRobots, f.xRobots].filter(Boolean).join(" | ") || "index, follow")}
                  {kv("Words", num(f.words))}
                  {kv("Structured data", f.schema.length ? f.schema.join(", ") : "None")}
                  {f.hreflang.length ? kv("hreflang", f.hreflang.map((h) => `${h.lang}: ${short(h.url, root)}`).join(", ")) : null}
                  {kv("Images", `${num(f.images)}, ${num(f.imagesNoAlt)} without alt`)}
                  {kv("Language", f.lang || "Not set")}
                  {kv("Share image", f.ogImage ? "Yes" : "No")}
                </>
              ) : null}
              {kv("Depth", row.depth === null ? "Not linked from the home page" : `${row.depth} ${row.depth === 1 ? "click" : "clicks"} from home`)}
              {kv("Links in", num(row.links_in))}
              {row.internal_rank !== null ? kv("Link score", `${row.internal_rank.toFixed(1)} of 10`) : null}
              {kv("In a sitemap", row.in_sitemap ? "Yes" : "No")}
              {kv("Response", `${(row.ms / 1000).toFixed(2)} s, ${num(Math.round((row.facts.bytes ?? 0) / 1024))} KB${row.facts.compressed ? ", compressed" : ", not compressed"}`)}
              <div className="flex flex-wrap gap-2 pt-3">
                <a href={url} target="_blank" rel="noreferrer" className="aw-btn aw-btn--secondary aw-btn--sm">
                  Open page
                </a>
              </div>
            </div>
          ) : tab === "rendering" && row.rendered ? (
            <RenderTab row={row} r={row.rendered} root={root} />
          ) : tab === "issues" ? (
            row.issues.length ? (
              <ul className="flex flex-col gap-3">
                {row.issues.map((id) => {
                  const c = CHECKS[id];
                  return (
                    <li key={id} className="flex gap-2.5 text-[13px]">
                      {c ? <span className="pt-1.5"><SevDot s={c.severity} /></span> : null}
                      <span className="min-w-0">
                        <span className="block font-medium text-ink">{c?.title ?? id}</span>
                        {c ? <span className="block text-muted">{c.how ?? c.why}</span> : null}
                        {c ? <span className="block text-[11.5px] text-muted">{SEV[c.severity].one}</span> : null}
                      </span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-[13px] text-body">No issues on this page.</p>
            )
          ) : (
            <div className="flex flex-col gap-4 text-[13px]">
              <div>
                <h3 className="aw-h4 mb-1">Links to this page</h3>
                {linksIn === null ? <Thinking text="Loading" /> : linksIn.length ? <ul className="flex flex-col gap-1">{linksIn.map((u) => <li key={u} className="wrap-anywhere">{short(u, root)}</li>)}</ul> : <p className="text-muted">No crawled page links here.</p>}
              </div>
              <div>
                <h3 className="aw-h4 mb-1">Links on this page ({num(row.facts.links?.length ?? 0)})</h3>
                <ul className="flex flex-col gap-1">
                  {(row.facts.links ?? []).slice(0, 100).map((l) => (
                    <li key={l.u} className="wrap-anywhere">
                      {short(l.u, root)} <span className="text-muted">{l.a ? `"${l.a}"` : "no text"}{l.n ? ", nofollow" : ""}</span>
                    </li>
                  ))}
                </ul>
              </div>
              {row.facts.ext?.length ? (
                <div>
                  <h3 className="aw-h4 mb-1">Links to other sites ({num(row.facts.ext.length)})</h3>
                  <ul className="flex flex-col gap-1">
                    {row.facts.ext.slice(0, 60).map((u) => (
                      <li key={u} className="wrap-anywhere">
                        {u}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          )}
        </div>
      )}
    </SidePanel>
  );
}

/** Raw HTML next to what Chromium saw after JavaScript ran, with the browser's errors and a screenshot. */
function RenderTab({ row, r, root }: { row: Full; r: Rendered; root?: string }) {
  const f = row.facts.page;
  const share = rawShare(row.words, r);
  const same = (a: string, b: string) => a.trim() === b.trim();
  const line = (label: string, raw: React.ReactNode, after: React.ReactNode, changed = false) => (
    <tr key={label}>
      <td className="text-muted">{label}</td>
      <td className="wrap-anywhere">{raw}</td>
      <td className="wrap-anywhere">{changed ? <span className="font-medium text-[var(--aw-warn)]">{after}</span> : after}</td>
    </tr>
  );
  const rawNoindex = /noindex/i.test(`${f?.metaRobots ?? ""} ${f?.xRobots ?? ""}`);
  return (
    <div className="flex flex-col gap-5 text-[13px]">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`aw-status ${r.status >= 200 && r.status < 300 ? "aw-status--ranked" : "aw-status--missed"}`}>{r.status || "No answer"}</span>
        {share !== null ? <span className={`aw-status ${share < 30 ? "aw-status--missed" : share < 70 ? "aw-status--warn" : "aw-status--ranked"}`}>{share}% of the text in raw HTML</span> : null}
        {r.timeout ? <span className="aw-status aw-status--warn">Still loading after 10 s</span> : null}
      </div>
      <div className="overflow-x-auto">
        <table className="aw-table">
          <thead>
            <tr>
              <th />
              <th>Raw HTML</th>
              <th>After JavaScript</th>
            </tr>
          </thead>
          <tbody>
            {line("Words", num(row.words), num(r.words), share !== null && share < 70)}
            {line("Internal links", num(row.facts.links?.length ?? 0), num(r.internal), r.onlyRendered.length >= 5)}
            {line("Headings", num(f?.headings ?? 0), num(r.headings))}
            {line("Title", f?.title || "–", r.title || "–", !same(f?.title ?? "", r.title))}
            {line("Description", f?.description || "–", r.description || "–", !same(f?.description ?? "", r.description))}
            {line("H1", f?.h1.join(" | ") || "–", r.h1.join(" | ") || "–", !same(f?.h1.join("|") ?? "", r.h1.join("|")))}
            {line("Canonical", f?.canonical ? short(f.canonical, root) : "None", r.canonical ? short(r.canonical, root) : "None", (f?.canonical ?? null) !== r.canonical)}
            {line("Robots", rawNoindex ? "noindex" : "index", r.noindex ? "noindex" : "index", rawNoindex !== r.noindex)}
            {line("Structured data", f?.schema.join(", ") || "None", r.schema.join(", ") || "None", (f?.schema.length ?? 0) !== r.schema.length)}
          </tbody>
        </table>
      </div>
      {r.onlyRendered.length ? (
        <div>
          <h3 className="aw-h4 mb-1">Links only after JavaScript ({num(r.onlyRendered.length)})</h3>
          <ul className="flex flex-col gap-1">
            {r.onlyRendered.map((u) => (
              <li key={u} className="wrap-anywhere">
                {short(u, root)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {r.errors ? (
        <div>
          <h3 className="aw-h4 mb-1">JavaScript errors ({num(r.errors)})</h3>
          <ul className="flex flex-col gap-1 font-mono text-[12px]">
            {r.errorSamples.map((e, i) => (
              <li key={i} className="wrap-anywhere text-body">
                {e}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {r.failed.length ? (
        <div>
          <h3 className="aw-h4 mb-1">Failed requests ({num(r.failed.length)})</h3>
          <ul className="flex flex-col gap-1">
            {r.failed.map((x) => (
              <li key={x.url} className="wrap-anywhere">
                {short(x.url, root)} <span className="text-muted">{x.type}, {x.reason}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {row.shot ? (
        <div>
          <h3 className="aw-h4 mb-2">Phone screenshot</h3>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`data:image/jpeg;base64,${row.shot}`} alt={`How ${short(row.url, root)} looks on a phone`} className="w-full max-w-72 border border-[var(--aw-rule)]" />
        </div>
      ) : null}
    </div>
  );
}
