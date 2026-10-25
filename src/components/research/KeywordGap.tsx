"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import { addCalendarItems, type Site } from "@/lib/db";
import { stageFromIntent } from "@/lib/research";
import type { BrandStat } from "@/lib/metrics";
import { bare, nameFromDomain, splitShared, type Gap, type GapRow } from "@/lib/gap";
import type { RunAuth } from "@/lib/runner";
import { useStash } from "@/lib/stash";
import { BrandLogo } from "../BrandLogo";
import { Sheet, type Col } from "../Sheet";
import { EmptyBlock } from "../states";
import { CalendarIcon, Card, favicon, Seg, Thinking } from "../ui";
import type { WriterAccess } from "./ContentPiece";
import { AddedNotice, BAR_BUTTON, BAR_INPUT, Difficulty, downloadCsv, KeywordLink, OutlineStarted, post, SelectionBar, startOutline } from "./shared";

type Tab = "missing" | "shared" | "weaker" | "lead" | "only";
const TABS: Tab[] = ["missing", "weaker", "lead", "only", "shared"];
const SHORT: Record<Tab, string> = { missing: "Missing", weaker: "Weaker", lead: "Lead", only: "Only", shared: "Shared" };
/** What each region holds, for its tab's tooltip. */
const LABEL = (them: string): Record<Tab, string> => ({
  missing: `Owned by ${them}`,
  shared: "Shared keywords",
  weaker: `${them} ranks higher`,
  lead: "You rank higher",
  only: "Owned by you",
});
const isTab = (v: string | null): v is Tab => TABS.includes(v as Tab);
/** The region in the address bar (?region=weaker), so Back, refresh and links keep it. Missing is the default. */
const readRegion = (): Tab => {
  if (typeof window === "undefined") return "missing";
  const v = new URLSearchParams(window.location.search).get("region");
  return isTab(v) ? v : "missing";
};
function writeRegion(t: Tab | null) {
  const p = new URLSearchParams(window.location.search);
  if (t && t !== "missing") p.set("region", t);
  else p.delete("region");
  const url = window.location.pathname + (p.size ? `?${p}` : "");
  if (url !== window.location.pathname + window.location.search) window.history.replaceState(window.history.state, "", url);
}
const rank = (n: number | null) => (n === null ? <span className="text-muted">–</span> : <span className="aw-rank">#{n}</span>);

/** A brand's logo and name side by side. */
const Brand = ({ name, logo, size = 16 }: { name: string; logo: string; size?: number }) => (
  <span className="inline-flex min-w-0 items-center gap-1.5">
    <BrandLogo src={logo} name={name} size={size} />
    <span className="truncate">{name}</span>
  </span>
);

/** Competitive Analysis: rivals from your AI answers and from Google, and how your keywords overlap with theirs. */
export function KeywordGap({
  sb,
  auth,
  site,
  canEdit,
  writer,
  stats,
  days = 30,
  me,
}: {
  sb: SupabaseClient;
  auth: RunAuth;
  site: Site;
  canEdit: boolean;
  writer?: WriterAccess;
  stats: BrandStat[];
  /** The window the AI visibility numbers cover. */
  days?: number;
  /** Your brand's name and logo. */
  me: { name: string; logo?: string | null };
}) {
  const aiRivals = stats.filter((s) => !s.isYou && s.domain && bare(s.domain) !== bare(site.domain)).slice(0, 8);
  const [rivals, setRivals] = useStash<string[] | null>(`rivals:${site.id}`, null);
  const [result, setResult] = useStash<{ gap: Gap; them: string } | null>(`gap:${site.id}`, null);
  const [query, setQuery] = useState(result?.them ?? "");
  const [tab, setTabState] = useState<Tab>(readRegion);
  const setTab = (t: Tab) => {
    setTabState(t);
    writeRegion(t);
  };
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [outline, setOutline] = useState<{ keyword: string; briefId: string | null; writing?: boolean } | null>(null);

  // Back and Forward bring their region back; leaving the screen takes it out of the address.
  useEffect(() => {
    const pop = () => setTabState(readRegion());
    window.addEventListener("popstate", pop);
    return () => {
      window.removeEventListener("popstate", pop);
      writeRegion(null);
    };
  }, []);

  useEffect(() => {
    if (rivals || !canEdit) return;
    let live = true;
    post<{ rivals: string[] }>(auth, "/api/research/gap", { action: "rivals", siteId: site.id })
      .then((r) => live && setRivals(r.rivals))
      .catch(() => live && setRivals([]));
    return () => {
      live = false;
    };
  }, [auth, site.id, canEdit, rivals, setRivals]);

  async function run(domain: string) {
    if (!domain.trim()) return;
    setQuery(domain);
    setBusy(true);
    setError("");
    setNotice("");
    setOutline(null);
    setPicked(new Set());
    try {
      const r = await post<{ gap: Gap; them: string }>(auth, "/api/research/gap", { siteId: site.id, competitor: domain });
      setResult({ gap: r.gap, them: r.them });
      setTab("missing");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const gap = result?.gap;
  // Shared keywords split by who ranks higher: an opportunity when they beat you, a lead when you beat them.
  const { weaker, lead } = splitShared(gap?.shared ?? []);
  const lists: Record<Tab, GapRow[]> = { missing: gap?.missing ?? [], shared: gap?.shared ?? [], weaker, lead, only: gap?.only ?? [] };
  const counts: Record<Tab, number> = { missing: gap?.totals.missing ?? 0, shared: gap?.totals.shared ?? 0, weaker: weaker.length, lead: lead.length, only: gap?.totals.only ?? 0 };
  const rows = lists[tab];
  // Brands by name and logo: the name AI answers use when there is one, else one made from the domain.
  const nameOf = (d: string) => stats.find((s) => s.domain && bare(s.domain) === bare(d))?.name ?? nameFromDomain(d);
  const themName = result ? nameOf(result.them) : "them";
  const themLogo = result ? favicon(bare(result.them)) : "";
  const myLogo = me.logo || favicon(bare(site.domain));
  const labels = LABEL(themName);
  const toItem = (r: GapRow) => ({ site_id: site.id, keyword: r.keyword, secondary: [], stage: stageFromIntent(r.intent), theme: null, volume: r.volume, difficulty: r.kd, intent: r.intent, cpc: null, source: `keyword gap: ${themName}` });

  const cols: Col<GapRow>[] = [
    { id: "keyword", label: "Keyword", type: "text", value: (r) => r.keyword, cell: (r) => <KeywordLink keyword={r.keyword} />, width: 220 },
    { id: "volume", label: "Volume", type: "number", value: (r) => r.volume },
    { id: "kd", label: "KD %", type: "number", value: (r) => r.kd, cell: (r) => <Difficulty kd={r.kd} /> },
    { id: "intent", label: "Intent", type: "list", value: (r) => r.intent },
    { id: "them", label: themName, head: <Brand name={themName} logo={themLogo} size={14} />, type: "number", value: (r) => r.them, cell: (r) => rank(r.them) },
    { id: "you", label: me.name, head: <Brand name={me.name} logo={myLogo} size={14} />, type: "number", value: (r) => r.you, cell: (r) => rank(r.you) },
    {
      id: "url",
      label: `${themName}'s page`,
      type: "text",
      value: (r) => r.url,
      // The whole address, wrapped onto more lines when it is long.
      cell: (r) =>
        r.url ? (
          <a href={r.url} target="_blank" rel="noopener noreferrer" className="block max-w-sm whitespace-normal break-all" title={r.url}>
            {r.url.replace(/^https?:\/\/(www\.)?/, "")}
          </a>
        ) : (
          <span className="text-muted">–</span>
        ),
    },
  ];

  async function bank() {
    const list = rows.filter((r) => picked.has(r.keyword));
    setError("");
    try {
      const n = await addCalendarItems(sb, auth.workspaceId, list.map(toItem));
      setPicked(new Set());
      setNotice(n ? `${n} added to the Editorial Calendar.` : "Already in the Editorial Calendar.");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  /** Write outline for one picked keyword: adds it to the Editorial Calendar if needed and starts its outline. */
  async function writeOutline(r: GapRow) {
    if (writer && !writer.open) return writer.onUpgrade?.();
    setError("");
    setOutline({ keyword: r.keyword, briefId: null });
    try {
      const { briefId, writing } = await startOutline(sb, auth, toItem(r));
      setOutline({ keyword: r.keyword, briefId, writing });
      setPicked(new Set());
    } catch (e) {
      setOutline(null);
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <form
        className="aw-frame flex flex-wrap items-center gap-3 p-3"
        onSubmit={(e) => {
          e.preventDefault();
          run(query);
        }}
      >
        <span className="flex h-12 items-center gap-2 px-2 text-[15px] font-medium text-ink" title={site.domain}>
          <Brand name={me.name} logo={myLogo} size={18} />
          <span className="text-muted">vs</span>
        </span>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="competitor.com" aria-label="Competitor domain" className={BAR_INPUT} />
        <button type="submit" className={BAR_BUTTON} disabled={!canEdit || busy || !query.trim()}>
          Compare
        </button>
        {aiRivals.length ? (
          <div className="flex w-full flex-wrap items-center gap-2 px-1">
            <span className="aw-label w-24 shrink-0">In AI answers</span>
            {aiRivals.map((r) => (
              <button key={r.name} type="button" className={`aw-chip ${bare(result?.them) === bare(r.domain) ? "aw-chip--brand" : ""}`} onClick={() => run(r.domain!)} disabled={!canEdit || busy}>
                <BrandLogo src={favicon(bare(r.domain))} name={r.name} size={14} />
                {r.name}
                <span className="text-muted">
                  {Math.round(r.visibility)}% visibility, {days} days
                </span>
              </button>
            ))}
          </div>
        ) : null}
        {rivals?.length ? (
          <div className="flex w-full flex-wrap items-center gap-2 px-1">
            <span className="aw-label w-24 shrink-0">On Google</span>
            {rivals
              .filter((d) => !aiRivals.some((r) => bare(r.domain) === bare(d)))
              .slice(0, 6)
              .map((d) => (
                <button key={d} type="button" title={d} className={`aw-chip ${bare(result?.them) === bare(d) ? "aw-chip--brand" : ""}`} onClick={() => run(d)} disabled={!canEdit || busy}>
                  <BrandLogo src={favicon(bare(d))} name={nameOf(d)} size={14} />
                  {nameOf(d)}
                </button>
              ))}
          </div>
        ) : null}
      </form>

      {error ? <p className="aw-error">{error}</p> : null}
      {notice ? <AddedNotice text={notice} /> : null}
      {outline?.briefId ? (
        <div className="aw-callout flex flex-wrap items-center gap-3">
          <span>{outline.keyword}</span>
          <OutlineStarted briefId={outline.briefId} brandId={site.brand_id} writing={outline.writing} />
        </div>
      ) : null}
      {busy ? <Thinking text={`Comparing ${me.name} with ${nameOf(query)}...`} /> : null}

      {!busy && !gap ? (
        <Card title="Keywords">
          <EmptyBlock>Pick a rival above.</EmptyBlock>
        </Card>
      ) : null}

      {!busy && gap ? (
        <>
          <Card
            title={
              <Seg
                label="Keyword overlap"
                value={tab}
                onChange={(t) => {
                  setTab(t);
                  setPicked(new Set());
                }}
                options={TABS.filter((t) => t !== "shared" || tab === "shared").map((t) => ({ id: t, label: <span title={labels[t]}>{`${SHORT[t]} ${counts[t].toLocaleString("en-US")}`}</span> }))}
              />
            }
            action={
              <button
                type="button"
                className="aw-btn aw-btn--secondary aw-btn--sm"
                onClick={() =>
                  downloadCsv(`keyword-gap-${site.domain}-${result!.them}-${tab}.csv`, ["keyword", "volume", "kd", "intent", themName, me.name, `${themName} page`], rows.map((r) => [r.keyword, r.volume, r.kd, r.intent, r.them, r.you, r.url]))
                }
              >
                Export CSV
              </button>
            }
          >
            {picked.size && canEdit ? (
              <SelectionBar count={picked.size} noun={picked.size === 1 ? "keyword" : "keywords"} onClear={() => setPicked(new Set())}>
                <button type="button" className="aw-btn aw-btn--primary aw-btn--sm" onClick={bank}>
                  <CalendarIcon />
                  Add to Editorial Calendar
                </button>
                {picked.size === 1 ? (
                  <button
                    type="button"
                    className="aw-btn aw-btn--secondary aw-btn--sm"
                    disabled={Boolean(outline && !outline.briefId)}
                    onClick={() => {
                      const r = rows.find((x) => picked.has(x.keyword));
                      if (r) writeOutline(r);
                    }}
                  >
                    {outline && !outline.briefId ? "Starting..." : "Write outline"}
                  </button>
                ) : null}
              </SelectionBar>
            ) : null}
            <Sheet<GapRow>
              id={`gap:${site.id}:${tab}`}
              label="Keyword gap"
              rows={rows}
              cols={cols}
              rowKey={(r) => r.keyword}
              sort={{ key: "volume", desc: true }}
              selected={canEdit ? picked : undefined}
              onSelect={canEdit ? setPicked : undefined}
              pageSize={100}
              height="none"
            />
          </Card>
        </>
      ) : null}
    </div>
  );
}
