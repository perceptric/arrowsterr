"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AREAS, fixGain, type Check, type FixPlay, type MainKeyword, type OnpageResult } from "@/lib/onpage";
import type { RunAuth } from "@/lib/runner";
import { BAR_INPUT } from "./research/shared";
import { SearchBar, SearchButton } from "./SearchBar";
import { Card, Seg, SidePanel, Thinking } from "./ui";
import { OnpageIntro } from "./ToolIntros";
import { ChangeSetCard, useApi } from "./ZippiePage";

// On-page Audit (docs/onpage-audit.md): one page scored against Google's top 10 for its keyword, every check with
// its fix, the terms top pages share, and a suggested title, description and opening. All pages lists every page
// audited for the brand, and finds the pages that bring the most visits.

type Row = { id: string; url: string; keyword: string; status: "running" | "done" | "failed"; step: string; score: number | null; top_score: number | null; error: string | null; created_at: string; result?: OnpageResult | null };
type Brand = { id: string; name: string; domain: string };
type Tab = "page" | "all";

const FIX_LABEL: Record<FixPlay, string> = { meta: "Rewrite title and description", schema: "Add structured data", faq: "Add an FAQ", alt: "Write alt text", links: "Add internal links" };
const when = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
const tone = (s: number) => (s >= 80 ? "var(--aw-pos)" : s >= 65 ? "var(--signal)" : s >= 50 ? "var(--aw-warn)" : "var(--aw-neg)");
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function OnpageAuditPage({ brand, sb, auth, canEdit, onConnect }: { brand: Brand; sb: SupabaseClient; auth: RunAuth; canEdit: boolean; onConnect: () => void }) {
  const api = useApi(auth);
  const [tab, setTab] = useState<Tab>("page");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [url, setUrl] = useState("");
  const [keyword, setKeyword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [proposed, setProposed] = useState<Set<string>>(new Set());
  const [setId, setSetId] = useState<string | null>(null);
  const [needsSite, setNeedsSite] = useState("");
  const [pages, setPages] = useState<MainKeyword[] | null>(null);

  const load = useCallback(async () => {
    const { data, error: e } = await sb
      .from("onpage_audits")
      .select("id, url, keyword, status, step, score, top_score, error, created_at")
      .eq("brand_id", brand.id)
      .order("created_at", { ascending: false })
      .limit(100);
    if (e) return setError(/onpage_audits/.test(e.message) ? "Run supabase/062_onpage.sql with psql on the VPS database." : e.message);
    setRows((data ?? []) as Row[]);
  }, [sb, brand.id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const current = useMemo(() => (rows ? (rows.find((r) => r.id === openId) ?? rows[0] ?? null) : null), [rows, openId]);

  // The open audit's result, read once it's done and kept by id.
  const [results, setResults] = useState<Record<string, OnpageResult | null>>({});
  const needResult = current?.status === "done" && !current.result && !(current.id in results) ? current.id : null;
  useEffect(() => {
    if (!needResult) return;
    let live = true;
    sb.from("onpage_audits")
      .select("result")
      .eq("id", needResult)
      .maybeSingle()
      .then(({ data }) => live && setResults((m) => ({ ...m, [needResult]: (data?.result as OnpageResult) ?? null })));
    return () => {
      live = false;
    };
  }, [needResult, sb]);
  const detail: Row | null = current ? { ...current, result: current.result ?? results[current.id] } : null;

  const running = rows?.some((r) => r.status === "running");
  useEffect(() => {
    if (!running) return;
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [running, load]);

  async function call<T>(action: string, extra: Record<string, unknown>) {
    return api<T>("/api/onpage", { action, brandId: brand.id, ...extra });
  }
  async function start(u = url, k = keyword) {
    setBusy("start");
    setError("");
    try {
      const r = await call<{ auditId: string }>("start", { url: u, keyword: k });
      setOpenId(r.auditId);
      setTab("page");
      setUrl(u);
      setKeyword(k);
      await load();
    } catch (e) {
      setError(msg(e));
    } finally {
      setBusy("");
    }
  }
  async function fix(play: FixPlay) {
    if (!detail) return;
    setBusy(play);
    setError("");
    setNeedsSite("");
    try {
      const r = await call<{ setId: string }>("fix", { auditId: detail.id, play });
      setProposed((s) => new Set(s).add(`${detail.id}:${play}`));
      setSetId(r.setId);
    } catch (e) {
      if (/^Connect /.test(msg(e))) setNeedsSite(msg(e));
      else setError(msg(e));
    } finally {
      setBusy("");
    }
  }
  async function findPages() {
    setBusy("pages");
    setError("");
    try {
      setPages((await call<{ pages: MainKeyword[] }>("pages", {})).pages);
    } catch (e) {
      setError(msg(e));
    } finally {
      setBusy("");
    }
  }

  const form = canEdit ? (
    <SearchBar onSubmit={() => start()}>
      <input id="onpage-url" className={BAR_INPUT} value={url} onChange={(e) => setUrl(e.target.value)} placeholder={`https://${brand.domain}/page`} aria-label="Page" />
      <input id="onpage-keyword" className={BAR_INPUT} value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="Keyword" aria-label="Keyword" />
      <SearchButton label="Audit" busyLabel="Starting" busy={busy === "start"} disabled={!url.trim() || !keyword.trim()} />
    </SearchBar>
  ) : null;

  const head = (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <h1 className="aw-h2 mb-0!">On-page Audit</h1>
      {rows ? <Seg label="On-page Audit view" value={tab} onChange={setTab} options={[{ id: "page", label: "This page" }, { id: "all", label: "All pages" }]} /> : null}
    </div>
  );

  if (rows === null) return <div className="flex flex-col gap-6">{head}{error ? <p className="aw-error">{error}</p> : <Thinking text="Loading" />}</div>;

  return (
    <div className="flex flex-col gap-6">
      {head}
      {error ? <p className="aw-error">{error}</p> : null}
      {needsSite ? (
        <div className="aw-callout flex flex-wrap items-center justify-between gap-3">
          <span>{needsSite}</span>
          <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm" onClick={onConnect}>
            Connect website
          </button>
        </div>
      ) : null}

      {tab === "all" ? (
        <AllPages rows={rows} pages={pages} canEdit={canEdit} busy={busy} onFind={findPages} onOpen={(id) => { setOpenId(id); setTab("page"); }} onAudit={(u, k) => start(u, k)} />
      ) : (
        <>
          {form}
          {!rows.length ? <OnpageIntro /> : null}
          {detail ? <Detail row={detail} history={rows.filter((r) => r.url === detail.url && r.keyword === detail.keyword && r.status === "done")} canEdit={canEdit} busy={busy} proposed={proposed} onFix={fix} onAgain={() => start(detail.url, detail.keyword)} /> : null}
        </>
      )}

      {setId ? (
        <SidePanel title="Review the fix" onClose={() => setSetId(null)}>
          <ChangeSetCard id={setId} api={api} canEdit={canEdit} />
        </SidePanel>
      ) : null}
    </div>
  );
}

function Ring({ value, size = 120, stroke = 11, label }: { value: number | null; size?: number; stroke?: number; label?: React.ReactNode }) {
  const r = size / 2 - stroke / 2 - 1;
  const len = 2 * Math.PI * r;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} role="img" aria-label={value === null ? "Not scored" : `Score ${value} of 100`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--aw-surface-2)" strokeWidth={stroke} />
        {value !== null ? <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={tone(value)} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={`${(len * value) / 100} ${len}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} /> : null}
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">{label ?? <span className="aw-num font-semibold text-ink">{value ?? "–"}</span>}</div>
    </div>
  );
}

const STATUS_ICON: Record<Check["status"], { text: string; cls: string }> = {
  pass: { text: "✓", cls: "bg-[var(--aw-pos-bg)] text-pos" },
  warn: { text: "!", cls: "bg-[var(--aw-warn-bg)] text-warn" },
  fail: { text: "×", cls: "bg-[var(--aw-neg-bg)] text-neg" },
  unknown: { text: "–", cls: "bg-[var(--aw-surface-2)] text-muted" },
};

function Detail({ row, history, canEdit, busy, proposed, onFix, onAgain }: { row: Row; history: Row[]; canEdit: boolean; busy: string; proposed: Set<string>; onFix: (p: FixPlay) => void; onAgain: () => void }) {
  const [view, setView] = useState<"now" | "suggested">("now");
  const [copied, setCopied] = useState("");
  if (row.status === "running") return <Thinking text={`${row.step || "Working"}: ${row.url}`} />;
  if (row.status === "failed")
    return (
      <div className="aw-error flex flex-wrap items-center justify-between gap-3">
        <span className="wrap-anywhere">
          {row.url}: {row.error}
        </span>
        {canEdit ? (
          <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm" onClick={onAgain}>
            Try again
          </button>
        ) : null}
      </div>
    );
  const r = row.result;
  if (!r) return <Thinking text="Loading" />;
  const copy = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(""), 1500);
    } catch {
      setCopied("");
    }
  };
  const s = r.suggest;
  const shownTitle = view === "suggested" && s ? s.title : r.title;
  const shownDesc = view === "suggested" && s ? s.description : r.description;
  const plays = [...new Set(r.checks.filter((c) => c.fix && (c.status === "fail" || c.status === "warn")).map((c) => c.fix as FixPlay))];
  const older = history.filter((h) => h.id !== row.id);
  const answerCheck = r.checks.find((c) => c.id === "ai_answer");

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Card>
          <div className="flex flex-wrap items-center gap-6 px-5 py-5">
            <Ring value={r.score} size={128} label={<div><div className="aw-num text-[32px] leading-none font-semibold text-ink">{r.score}</div><div className="mt-1 text-[12px] text-muted">of 100</div></div>} />
            <div className="flex min-w-0 flex-1 flex-col gap-2.5">
              <div className="flex flex-wrap items-center gap-2">
                {r.topScore !== null ? <span className="aw-status aw-status--pending">Top 10 average {r.topScore}</span> : null}
                <span className="aw-status aw-status--pending">
                  {r.read} of {r.top.filter((t) => t.url).length} top pages read
                </span>
                <span className={`aw-status ${r.rank ? "aw-status--ranked" : "aw-status--warn"}`}>{r.rank ? `#${r.rank} on Google` : "Not in the top 10"}</span>
              </div>
              {AREAS.map((a) => (
                <AreaBar key={a.id} label={a.label} you={r.areas[a.id]} top={r.topAreas?.[a.id] ?? null} />
              ))}
              {older.length ? (
                <p className="text-[12px] text-muted">
                  Before: {older.slice(0, 4).map((h) => `${h.score} on ${when(h.created_at)}`).join(", ")}
                </p>
              ) : null}
            </div>
          </div>
        </Card>
        <Card
          title="Google preview"
          action={s ? <Seg label="Preview" value={view} onChange={setView} options={[{ id: "now", label: "Now" }, { id: "suggested", label: "Suggested" }]} /> : null}
        >
          <div className="flex flex-col gap-3 px-5 pb-5">
            <div className="flex flex-col gap-1 rounded-[10px] bg-[var(--aw-surface-2)] px-4 py-3">
              <span className="text-[12px] text-body wrap-anywhere">{r.url}</span>
              <span className="text-[17px] leading-snug text-[var(--signal-ink)] wrap-break-word">{shownTitle || "No title"}</span>
              <span className="text-[13px] text-muted wrap-break-word">{shownDesc || "No meta description"}</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className={`aw-status ${shownTitle.length >= 30 && shownTitle.length <= 60 ? "aw-status--ranked" : "aw-status--warn"}`}>Title {shownTitle.length}</span>
              <span className={`aw-status ${shownDesc.length >= 120 && shownDesc.length <= 160 ? "aw-status--ranked" : "aw-status--warn"}`}>Description {shownDesc.length}</span>
              {view === "suggested" && s ? (
                <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm" onClick={() => copy("snippet", `${s.title}\n${s.description}`)}>
                  {copied === "snippet" ? "Copied" : "Copy"}
                </button>
              ) : null}
            </div>
          </div>
        </Card>
      </div>

      {canEdit && plays.length ? (
        <Card title="Fixes">
          <ul className="flex flex-col">
            {plays.map((p) => {
              const key = `${row.id}:${p}`;
              const gain = fixGain(r, p);
              return (
                <li key={p} className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--aw-rule)] px-5 py-3 first:border-t-0">
                  <span className="text-[14px] font-medium text-ink">{FIX_LABEL[p]}</span>
                  <span className="flex items-center gap-2">
                    {gain ? <span className="text-[12px] font-medium text-pos">+{gain} points</span> : null}
                    <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm" onClick={() => onFix(p)} disabled={busy === p || proposed.has(key)}>
                      {proposed.has(key) ? "Proposed" : busy === p ? "Preparing" : "Fix"}
                    </button>
                  </span>
                </li>
              );
            })}
          </ul>
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Card title="Checks">
          <div className="flex flex-col gap-4 px-5 pb-5">
            {AREAS.map((a) => {
              const list = r.checks.filter((c) => c.area === a.id);
              if (!list.length) return null;
              return (
                <div key={a.id} className="flex flex-col">
                  <div className="mb-1 flex justify-between text-[12px] font-medium text-muted">
                    <span>{a.label}</span>
                    <span>
                      {list.filter((c) => c.status === "pass").length} of {list.filter((c) => c.status !== "unknown").length} passed
                    </span>
                  </div>
                  {list.map((c) => (
                    <div key={c.id} className="flex items-start gap-3 border-t border-[var(--aw-rule)] py-2.5 first:border-t-0">
                      <span className={`mt-0.5 grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full text-[11px] font-bold ${STATUS_ICON[c.status].cls}`} aria-label={c.status}>
                        {STATUS_ICON[c.status].text}
                      </span>
                      <span className="flex min-w-0 flex-col">
                        <span className="text-[13.5px] font-medium text-ink">{c.label}</span>
                        <span className="text-[12px] text-muted wrap-break-word">{c.detail}</span>
                      </span>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </Card>
        <div className="flex min-w-0 flex-col gap-4">
          {s?.answer && answerCheck && answerCheck.status !== "pass" ? (
            <Card title="Suggested opening" action={<button type="button" className="aw-btn aw-btn--secondary aw-btn--sm" onClick={() => copy("answer", s.answer)}>{copied === "answer" ? "Copied" : "Copy"}</button>}>
              <p className="px-5 pb-5 text-[13.5px] leading-relaxed text-body">{s.answer}</p>
            </Card>
          ) : null}
          <Card title="Terms the top pages share">
            <div className="flex flex-col gap-2 px-5 pb-5">
              {r.terms.length ? (
                <div className="flex flex-wrap gap-1.5">
                  {r.terms.map((t) => (
                    <span key={t.term} className={`inline-flex items-center gap-1.5 rounded-[8px] px-2.5 py-1 text-[12.5px] ${t.page ? "bg-[var(--aw-pos-bg)] text-pos" : "shadow-[inset_0_0_0_1px_var(--aw-rule)] text-ink"}`} title={`Used by ${t.pages} top pages`}>
                      {t.term}
                      <span className="aw-num text-[11.5px] opacity-75">
                        {t.page} / {t.top}
                      </span>
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-[13px] text-muted">{r.read < 3 ? `Only ${r.read} top pages could be read.` : "No terms most top pages share."}</p>
              )}
              {r.terms.length ? <p className="text-[12px] text-muted">On this page / top 10 average</p> : null}
            </div>
          </Card>
          <Card title={`Top 10 for “${r.keyword}”`}>
            <ul className="flex flex-col px-5 pb-4">
              {r.top.map((t) => (
                <li key={`${t.rank}-${t.url}`} className="flex items-center gap-3 border-t border-[var(--aw-rule)] py-2 first:border-t-0">
                  <span className="aw-num w-7 shrink-0 text-[12px] text-muted">#{t.rank}</span>
                  <a href={t.url} target="_blank" rel="noreferrer" className="min-w-0 flex-1 text-[13px] text-ink wrap-anywhere hover:underline">
                    {t.domain}
                  </a>
                  {t.read ? <Ring value={t.score} size={34} stroke={3.5} /> : <span className="text-[12px] text-muted">Not read</span>}
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}

function AreaBar({ label, you, top }: { label: string; you: number | null; top: number | null }) {
  const color = you === null ? "var(--aw-rule)" : top === null || you >= top ? "var(--aw-pos)" : you >= top - 15 ? "var(--signal)" : "var(--aw-warn)";
  return (
    <div className="grid grid-cols-[minmax(96px,130px)_minmax(0,1fr)_36px] items-center gap-3 text-[13px]">
      <span className="text-body">{label}</span>
      <span className="relative block h-2 rounded-full bg-[var(--aw-surface-2)]">
        <span className="block h-full rounded-full" style={{ width: `${you ?? 0}%`, background: color }} />
        {top !== null ? <span className="absolute -top-[3px] h-[14px] w-[2px] rounded-[1px] bg-[var(--aw-ink)]" style={{ left: `${top}%` }} title={`Top 10 average ${top}`} /> : null}
      </span>
      <span className="aw-num text-right font-medium text-ink">{you ?? "–"}</span>
    </div>
  );
}

function AllPages({ rows, pages, canEdit, busy, onFind, onOpen, onAudit }: { rows: Row[]; pages: MainKeyword[] | null; canEdit: boolean; busy: string; onFind: () => void; onOpen: (id: string) => void; onAudit: (url: string, keyword: string) => void }) {
  // The latest audit of each page and keyword.
  const latest = useMemo(() => {
    const seen = new Set<string>();
    return rows.filter((r) => {
      const k = `${r.url}|${r.keyword}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }, [rows]);
  const audited = new Set(latest.map((r) => r.url.replace(/\/+$/, "")));
  const sorted = [...latest].sort((a, b) => (a.score ?? 101) - (b.score ?? 101));
  return (
    <div className="flex flex-col gap-4">
      {sorted.length ? (
        <Card title="Audited pages">
          <div className="overflow-x-auto">
            <table className="aw-table">
              <thead>
                <tr>
                  <th>Page</th>
                  <th>Keyword</th>
                  <th className="text-center">Score</th>
                  <th className="text-right">Top 10</th>
                  <th>Audited</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {sorted.map((r) => (
                  <tr key={r.id}>
                    <td className="min-w-52 wrap-anywhere">{r.url}</td>
                    <td className="min-w-40">{r.keyword}</td>
                    <td className="text-center">{r.status === "done" ? <span className="inline-block"><Ring value={r.score} size={34} stroke={3.5} /></span> : <span className="text-[12px] text-muted">{r.status === "running" ? "Working" : "Failed"}</span>}</td>
                    <td className="aw-num text-right">{r.top_score ?? "–"}</td>
                    <td className="whitespace-nowrap">{when(r.created_at)}</td>
                    <td className="text-right">
                      <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm" onClick={() => onOpen(r.id)}>
                        Open
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}
      {canEdit ? (
        <Card
          title="Pages that bring the most visits"
          action={
            <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm" onClick={onFind} disabled={busy === "pages"}>
              {busy === "pages" ? "Finding" : pages ? "Find again" : "Find my pages"}
            </button>
          }
        >
          {pages ? (
            pages.length ? (
              <div className="overflow-x-auto">
                <table className="aw-table">
                  <thead>
                    <tr>
                      <th>Page</th>
                      <th>Main keyword</th>
                      <th className="text-right">Position</th>
                      <th className="text-right">Visits a month</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {pages.map((p) => (
                      <tr key={p.url}>
                        <td className="min-w-52 wrap-anywhere">{p.url}</td>
                        <td className="min-w-40">{p.keyword}</td>
                        <td className="aw-num text-right">{p.rank ?? "–"}</td>
                        <td className="aw-num text-right">{p.traffic.toLocaleString("en-US")}</td>
                        <td className="text-right">
                          <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm" onClick={() => onAudit(p.url, p.keyword)} disabled={busy === "start"}>
                            {audited.has(p.url.replace(/\/+$/, "")) ? "Audit again" : "Audit"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="px-5 pb-5 text-[13px] text-muted">Google shows no rankings for this site yet.</p>
            )
          ) : null}
        </Card>
      ) : null}
    </div>
  );
}
