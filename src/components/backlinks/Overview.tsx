"use client";

import { useMemo, useState } from "react";
import { ANCHOR_GROUPS, anchorGroup, anchorMix, brandWords, spamLevel, type AnchorGroup, type Overview, type Week } from "@/lib/backlinks";
import { Card, Delta, Seg, StatStrip } from "../ui";
import { BacklinksIntro } from "../ToolIntros";
import { Bands, C, Donut, HBars, LineChart, NewLostBars, Stack, short, type Part } from "./charts";
import { CsvButton, fileName, Loading, monthOf, num, Toggle, Updated, useAnswer, type TabProps } from "./shared";

// Overview, Anchors and Linked pages: all three read the one saved overview.

type Ov = Overview & { at: string };
type Snap = { day: string; rank: number; backlinks: number; domains: number; spam: number } | null;
export type OvData = { overview: Ov; before: Snap };
const SPAM_CLASS = { low: "aw-status--ranked", medium: "aw-status--warn", high: "aw-status--missed" } as const;
const GROUP_COLOR: Record<AnchorGroup, string> = { brand: C.signal, url: C.sky, generic: C.grey, keyword: C.orange, empty: C.faint };

export function useOverview(p: TabProps) {
  return useAnswer<OvData>(p.call, p.memo, "overview", (r) => (r.overview ? { overview: r.overview as Ov, before: (r.before as Snap) ?? null } : null), p.armed, p.onError);
}

/** Words that name the target, for sorting anchors: the brand's name on its own site, the site's name elsewhere. */
function wordsFor(label: string, brandName: string, isOwn: boolean) {
  const host = label.replace(/[/?#].*$/, "");
  return brandWords(isOwn ? brandName : host.split(".")[0], host);
}

/** Linking sites week by week, worked back from today's count and each week's new and lost sites. */
function sitesTrend(now: number, weeks: Week[]): number[] {
  const out = [now];
  for (let i = weeks.length - 1; i >= 0; i--) out.unshift(out[0] - weeks[i].newDomains + weeks[i].lostDomains);
  return out;
}

export function OverviewTab(p: TabProps & { brandName: string; onTab: (t: "anchors" | "pages" | "domains") => void }) {
  const { data, busy, load } = useOverview(p);
  const [metric, setMetric] = useState<"domains" | "backlinks" | "rank">("domains");
  if (data === null) return <Loading text={p.armed ? "Reading links" : "Loading"} />;
  if (data === "none")
    return (
      <div className="flex flex-col gap-6">
        {p.canEdit ? (
          <div>
            <button type="button" className="aw-btn aw-btn--primary" onClick={() => load(true)} disabled={busy}>
              {busy ? "Loading" : "Load backlinks"}
            </button>
          </div>
        ) : null}
        <BacklinksIntro />
      </div>
    );
  const { overview: o, before } = data;
  const s = o.summary;
  const head = <Updated at={o.at} busy={busy} canRefresh={p.canEdit} onRefresh={() => load(true)} />;
  if (!s)
    return (
      <div className="flex flex-col gap-4">
        {head}
        <Card>
          <p className="px-5 py-6 text-[14px] text-body">No links to {o.target} found.</p>
        </Card>
      </div>
    );

  const hist = o.history ?? [];
  const prof = o.profile ?? null;
  const level = spamLevel(s.spam);
  const year = hist.length > 1 ? hist[hist.length - 1].rank - hist[0].rank : null;
  const followShare = prof && prof.followLinks + prof.nofollowLinks ? Math.round((prof.followLinks / (prof.followLinks + prof.nofollowLinks)) * 100) : s.domains ? Math.round(((s.domains - s.nofollowDomains) / s.domains) * 100) : 0;
  const mix = anchorMix(o.anchors, wordsFor(o.target, p.brandName, p.isOwn));
  const keywordShare = mix.find((g) => g.id === "keyword")?.share ?? 0;
  const last4 = o.weeks.slice(-4);
  const newDomains = last4.reduce((a, w) => a + w.newDomains, 0);
  const lostDomains = last4.reduce((a, w) => a + w.lostDomains, 0);
  const metricLabel = { domains: "Linking sites", backlinks: "Backlinks", rank: "Authority" }[metric];

  return (
    <div className="flex flex-col gap-4">
      {head}
      <StatStrip
        spark={hist.length > 1 ? hist.map((m) => m.domains) : o.weeks.length ? sitesTrend(s.domains, o.weeks) : undefined}
        stats={[
          { label: "Linking sites", value: num(s.domains), delta: <Delta now={s.domains} before={before?.domains ?? null} digits={0} />, sub: o.weeks.length ? `${num(newDomains)} new, ${num(lostDomains)} lost in 4 weeks` : undefined },
          { label: "Backlinks", value: short(s.backlinks), delta: <Delta now={s.backlinks} before={before?.backlinks ?? null} digits={0} /> },
          { label: "Authority", value: String(s.rank), sub: year !== null ? `${year >= 0 ? "+" : ""}${year} in a year` : undefined },
          { label: "Follow share", value: `${followShare}%`, sub: "of backlinks" },
          { label: "Referring IPs", value: prof ? num(prof.ips) : "–", sub: prof ? `${num(prof.subnets)} subnets` : undefined },
          { label: "Spam", value: String(s.spam), delta: <span className={`aw-status ${SPAM_CLASS[level]}`}>{level === "low" ? "Low" : level === "medium" ? "Some" : "High"}</span> },
        ]}
      />

      <div className={`grid gap-4 ${hist.length > 1 && o.weeks.length ? "xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]" : ""}`}>
        {hist.length > 1 ? (
          <Card title="Growth" action={<Seg label="Growth metric" value={metric} onChange={setMetric} options={[{ id: "domains", label: "Linking sites" }, { id: "backlinks", label: "Backlinks" }, { id: "rank", label: "Authority" }]} />}>
            <div className="px-5 pb-5">
              <LineChart series={[{ name: metricLabel, color: C.signal, values: hist.map((m) => m[metric]), width: 2.5 }]} labels={hist.map((m) => monthOf(m.date))} area label={`${metricLabel} by month`} />
            </div>
          </Card>
        ) : null}
        {o.weeks.length ? (
          <Card title="New and lost linking sites" action={<span className="flex gap-3 text-[12px] text-body"><Key color={C.pos} label="New" /><Key color={C.neg} label="Lost" /></span>}>
            <div className="px-5 pb-5">
              <NewLostBars weeks={o.weeks} />
            </div>
          </Card>
        ) : null}
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {o.bands && o.listed ? (
          <Card title="Authority of linking sites" action={<button type="button" className="aw-btn aw-btn--secondary aw-btn--sm" onClick={() => p.onTab("domains")}>All sites</button>}>
            <div className="flex flex-col gap-3 px-5 pb-5">
              <Bands bands={o.bands} />
              <span className="flex flex-wrap gap-3 text-[12px] text-body">
                <Key color={C.signal} label={`Strong 60+: ${num(o.bands.slice(6).reduce((a, b) => a + b, 0))}`} />
                <Key color={C.sky} label={`Middle: ${num(o.bands.slice(3, 6).reduce((a, b) => a + b, 0))}`} />
                <Key color={C.faint} label={`Weak: ${num(o.bands.slice(0, 3).reduce((a, b) => a + b, 0))}`} />
              </span>
              {o.listed >= 1000 && s.domains > o.listed ? <span className="text-[12px] text-muted">The 1,000 strongest of {num(s.domains)} linking sites</span> : null}
            </div>
          </Card>
        ) : null}
        {mix.length ? (
          <Card title="Anchor mix" action={<button type="button" className="aw-btn aw-btn--secondary aw-btn--sm" onClick={() => p.onTab("anchors")}>All anchors</button>}>
            <div className="flex flex-col gap-4 px-5 pb-5">
              <Stack parts={mix.map((g) => ({ label: g.label, value: g.domains, color: GROUP_COLOR[g.id] }))} />
              <HBars rows={mix.map((g) => ({ key: g.id, label: g.label, value: g.share, color: GROUP_COLOR[g.id] }))} unit="%" />
              {keywordShare > 30 ? <span className="aw-status aw-status--warn self-start">Keyword anchors over 30%</span> : null}
            </div>
          </Card>
        ) : null}
        {prof && prof.followLinks + prof.nofollowLinks ? (
          <Card title="Link attributes">
            <div className="flex flex-col gap-3 px-5 pb-5">
              <Donut label="Follow and nofollow backlinks" parts={[{ label: "Follow", value: prof.followLinks, color: C.signal }, { label: "Nofollow", value: prof.nofollowLinks, color: C.light }]} />
              <span className="flex flex-wrap gap-4 text-[12px] text-muted">
                <span>UGC: {num(prof.ugc)}</span>
                <span>Sponsored: {num(prof.sponsored)}</span>
              </span>
            </div>
          </Card>
        ) : null}
      </div>

      {prof ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {prof.tlds.length ? (
            <Card title="Top-level domains">
              <div className="px-5 pb-5">
                <HBars rows={prof.tlds.map((t) => ({ key: t.key, label: t.label, value: t.value, color: t.key === "edu" || t.key === "gov" ? C.pos : undefined }))} fmt={short} />
              </div>
            </Card>
          ) : null}
          {prof.platforms.length ? (
            <Card title="Site types">
              <div className="px-5 pb-5">
                <HBars rows={prof.platforms.map((t) => ({ key: t.key, label: t.label, value: t.value }))} color={C.sky} fmt={short} />
              </div>
            </Card>
          ) : null}
          {prof.places.length ? (
            <Card title="Where links sit on the page">
              <div className="px-5 pb-5">
                <HBars rows={prof.places.map((t) => ({ key: t.key, label: t.label, value: t.value, color: t.key === "article" || t.key === "main" ? C.signal : C.light }))} fmt={short} />
              </div>
            </Card>
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {prof && prof.types.length ? (
          <Card title="Link types">
            <div className="px-5 pb-5">
              <Donut label="Link types" parts={prof.types.map((t, i): Part => ({ label: t.label, value: t.value, color: [C.signal, C.sky, C.light, C.faint, C.grey][i] ?? C.faint }))} />
            </div>
          </Card>
        ) : null}
        {o.anchors.length ? (
          <Card title="Top anchors" action={<button type="button" className="aw-btn aw-btn--secondary aw-btn--sm" onClick={() => p.onTab("anchors")}>All anchors</button>}>
            <div className="px-5 pb-5">
              <HBars rows={o.anchors.slice(0, 6).map((a) => ({ key: a.anchor, label: a.anchor, value: a.domains }))} />
            </div>
          </Card>
        ) : null}
        {o.pages.length ? (
          <Card title="Most linked pages" action={<button type="button" className="aw-btn aw-btn--secondary aw-btn--sm" onClick={() => p.onTab("pages")}>All pages</button>}>
            <div className="px-5 pb-5">
              <HBars rows={o.pages.slice(0, 6).map((pg) => ({ key: pg.url, label: pathOf(pg.url), value: pg.domains, color: C.ink, onClick: () => p.onOpen(pg.url, "url") }))} />
            </div>
          </Card>
        ) : null}
      </div>
    </div>
  );
}

export const pathOf = (u: string) => {
  try {
    const x = new URL(u);
    return x.pathname + x.search || "/";
  } catch {
    return u;
  }
};

export const Key = ({ color, label }: { color: string; label: string }) => (
  <span className="flex items-center gap-1.5">
    <span className="inline-block h-2.5 w-2.5 rounded-[3px]" style={{ background: color }} />
    {label}
  </span>
);

export function AnchorsTab(p: TabProps & { brandName: string }) {
  const { data, busy, load } = useOverview(p);
  const [group, setGroup] = useState<AnchorGroup | "all">("all");
  const words = useMemo(() => wordsFor(p.label, p.brandName, p.isOwn), [p.label, p.brandName, p.isOwn]);
  if (data === null) return <Loading />;
  if (data === "none" || !data.overview.summary) return <OverviewFirst canEdit={p.canEdit} busy={busy} onLoad={() => load(true)} />;
  const o = data.overview;
  const rows = o.anchors.map((a) => ({ ...a, group: anchorGroup(a.anchor, words) }));
  const mix = anchorMix(o.anchors, words);
  const shown = rows.filter((a) => group === "all" || a.group === group);
  const top = Math.max(1, ...rows.map((a) => a.domains));
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <Card title="Anchor mix">
          <div className="px-5 pb-5">
            <Donut label="Anchor groups" parts={mix.map((g) => ({ label: g.label, value: g.domains, color: GROUP_COLOR[g.id] }))} />
          </div>
        </Card>
        <Card title="What each group means">
          <ul className="flex flex-col gap-2 px-5 pb-5 text-[13px] text-body">
            <li><b className="font-medium text-ink">Brand:</b> the name, like {words[0] ?? "acme"}. Most natural profiles lead with it.</li>
            <li><b className="font-medium text-ink">URL:</b> a bare address, like {p.label.replace(/[/?#].*$/, "")}.</li>
            <li><b className="font-medium text-ink">Generic:</b> words like click here or read more.</li>
            <li><b className="font-medium text-ink">Keyword:</b> words people search for. Over 30% can look paid.</li>
          </ul>
        </Card>
      </div>
      <Card title={`${num(rows.length)} anchors`} action={<CsvButton name={fileName(p.label, "anchors")} head={["anchor", "group", "linking sites", "backlinks", "share %"]} rows={shown.map((a) => [a.anchor, a.group, a.domains, a.backlinks, a.share])} />}>
        <div className="flex flex-wrap gap-2 px-5 pb-3">
          <Toggle on={group === "all"} onClick={() => setGroup("all")}>All</Toggle>
          {ANCHOR_GROUPS.filter((g) => mix.some((m) => m.id === g.id)).map((g) => (
            <Toggle key={g.id} on={group === g.id} onClick={() => setGroup(g.id)}>
              {g.label}
            </Toggle>
          ))}
        </div>
        <div className="overflow-x-auto">
          <table className="aw-table">
            <thead>
              <tr>
                <th>Anchor</th>
                <th>Group</th>
                <th className="text-right">Linking sites</th>
                <th className="min-w-40">Share</th>
                <th className="text-right">Backlinks</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((a) => (
                <tr key={a.anchor}>
                  <td className="min-w-48 font-medium text-ink wrap-anywhere">{a.anchor}</td>
                  <td>
                    <span className="aw-tag">{ANCHOR_GROUPS.find((g) => g.id === a.group)?.label}</span>
                  </td>
                  <td className="aw-num text-right">{num(a.domains)}</td>
                  <td>
                    <span className="flex items-center gap-2">
                      <span className="block h-2 flex-1 rounded-full bg-[var(--aw-surface-2)]">
                        <span className="block h-full rounded-full" style={{ width: `${Math.max(1.5, (a.domains / top) * 100)}%`, background: GROUP_COLOR[a.group] }} />
                      </span>
                      <span className="aw-num w-10 text-right text-[12px] text-muted">{a.share}%</span>
                    </span>
                  </td>
                  <td className="aw-num text-right">{num(a.backlinks)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

export function PagesTab(p: TabProps) {
  const { data, busy, load } = useOverview(p);
  if (data === null) return <Loading />;
  if (data === "none" || !data.overview.summary) return <OverviewFirst canEdit={p.canEdit} busy={busy} onLoad={() => load(true)} />;
  const pages = data.overview.pages;
  if (!pages.length)
    return (
      <Card>
        <p className="px-5 py-6 text-[14px] text-body">{p.label.includes("/") ? "One page has no pages of its own to list." : "No linked pages found."}</p>
      </Card>
    );
  const top = Math.max(1, ...pages.map((x) => x.domains));
  return (
    <Card title={`${num(pages.length)} most linked pages`} action={<CsvButton name={fileName(p.label, "pages")} head={["page", "linking sites", "backlinks"]} rows={pages.map((x) => [x.url, x.domains, x.backlinks])} />}>
      <div className="overflow-x-auto">
        <table className="aw-table">
          <thead>
            <tr>
              <th>Page</th>
              <th className="text-right">Linking sites</th>
              <th className="min-w-40">Share of the top page</th>
              <th className="text-right">Backlinks</th>
            </tr>
          </thead>
          <tbody>
            {pages.map((x) => (
              <tr key={x.url}>
                <td className="min-w-64">
                  <span className="flex flex-wrap items-center gap-2">
                    <button type="button" className="text-left font-medium text-ink wrap-anywhere hover:underline" onClick={() => p.onOpen(x.url, "url")}>
                      {pathOf(x.url)}
                    </button>
                    <a href={x.url} target="_blank" rel="noreferrer" aria-label={`Open ${x.url}`} className="text-muted hover:text-ink">
                      ↗
                    </a>
                  </span>
                </td>
                <td className="aw-num text-right">{num(x.domains)}</td>
                <td>
                  <span className="block h-2 rounded-full bg-[var(--aw-surface-2)]">
                    <span className="block h-full rounded-full bg-[var(--signal)]" style={{ width: `${Math.max(1.5, (x.domains / top) * 100)}%` }} />
                  </span>
                </td>
                <td className="aw-num text-right">{num(x.backlinks)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/** Tabs built on the overview, before it's loaded. */
export function OverviewFirst({ canEdit, busy, onLoad }: { canEdit: boolean; busy: boolean; onLoad: () => void }) {
  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
        <span className="text-[14px] text-body">Load the overview first.</span>
        {canEdit ? (
          <button type="button" className="aw-btn aw-btn--primary aw-btn--sm" onClick={onLoad} disabled={busy}>
            {busy ? "Loading" : "Load backlinks"}
          </button>
        ) : null}
      </div>
    </Card>
  );
}
