"use client";

import { useMemo, useState } from "react";
import { ANCHOR_GROUPS, anchorGroup, anchorMix, brandWords, spamLevel, type AnchorGroup, type Overview, type Week } from "@/lib/backlinks";
import { Card, Delta, Seg, StatStrip } from "../ui";
import { BacklinksIntro } from "../ToolIntros";
import { C, Donut, HBars, LineChart, NewLostBars, Stack, short } from "./charts";
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
            <AuthorityBands bands={o.bands} note={o.listed >= 1000 && s.domains > o.listed ? `The 1,000 strongest of ${num(s.domains)} linking sites` : null} />
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

      {o.anchors.length || o.pages.length ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {o.anchors.length ? (
            <Card title="Top anchors" action={<button type="button" className="aw-btn aw-btn--secondary aw-btn--sm" onClick={() => p.onTab("anchors")}>All anchors</button>}>
              <TopAnchors anchors={o.anchors.slice(0, 7)} />
            </Card>
          ) : null}
          {o.pages.length ? (
            <Card title="Most linked pages" action={<button type="button" className="aw-btn aw-btn--secondary aw-btn--sm" onClick={() => p.onTab("pages")}>All pages</button>}>
              <TopPages pages={o.pages} onOpen={(u) => p.onOpen(u, "url")} />
            </Card>
          ) : null}
        </div>
      ) : null}

      {prof && (prof.platforms.length || prof.tlds.length || prof.places.length || prof.types.length) ? <Sources prof={prof} /> : null}
    </div>
  );
}

/** Linking sites in three authority bands: one bar and the three counts. */
function AuthorityBands({ bands, note }: { bands: number[]; note: string | null }) {
  const sum = (a: number, b: number) => a + b;
  const rows = [
    { label: "Strong, 60 and up", value: bands.slice(6).reduce(sum, 0), color: "var(--signal-strong)" },
    { label: "Middle, 30 to 59", value: bands.slice(3, 6).reduce(sum, 0), color: C.signal },
    { label: "Weak, under 30", value: bands.slice(0, 3).reduce(sum, 0), color: "var(--border-strong)" },
  ];
  return (
    <div className="flex flex-col gap-3 px-5 pb-5">
      <div className="flex h-3 gap-0.5" role="img" aria-label={rows.map((r) => `${r.label}: ${r.value}`).join(", ")}>
        {rows.filter((r) => r.value > 0).map((r) => (
          <span key={r.label} className="min-w-1.5 rounded-[4px]" style={{ flex: `${r.value} 1 0`, background: r.color }} />
        ))}
      </div>
      <dl className="flex flex-col">
        {rows.map((r) => (
          <div key={r.label} className="flex min-h-9 items-center gap-2.5 border-t border-[var(--border-medium)] text-[14px]">
            <span className="h-2 w-2 shrink-0 rounded-[2px]" style={{ background: r.color }} />
            <dt className="flex-1 text-body">{r.label}</dt>
            <dd className="aw-num font-medium text-ink">{num(r.value)}</dd>
          </div>
        ))}
      </dl>
      {note ? <span className="text-[12px] text-muted">{note}</span> : null}
    </div>
  );
}

/** Anchors that read like a paid-link listing: several sales words in one long anchor. */
const SPAM_WORDS = /\b(dofollow|backlinks?|pbn|da ?\d+|pa ?\d+|buy|cheap|premium|rank first|link building|seo service|guest post)\b/gi;
export const spammyAnchor = (a: string) => a.length > 40 && (a.match(SPAM_WORDS) ?? []).length >= 2;

function TopAnchors({ anchors }: { anchors: Overview["anchors"] }) {
  const max = Math.max(1, ...anchors.map((a) => a.domains));
  return (
    <ul className="flex flex-col">
      {anchors.map((a) => {
        const spam = spammyAnchor(a.anchor);
        const empty = !a.anchor.trim();
        return (
          <li key={a.anchor} className="flex items-start gap-4 border-t border-[var(--border-medium)] px-5 py-3 first:border-t-0">
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <span className={empty ? "text-muted italic" : spam ? "max-w-[52ch] text-[13px] leading-relaxed text-body wrap-anywhere" : "text-ink wrap-anywhere"}>{empty ? "No anchor text" : a.anchor}</span>
              {spam ? <span className="aw-status aw-status--missed self-start">Looks like paid links</span> : null}
              <span className="block h-1 max-w-80 rounded-full bg-[var(--bg-tertiary)]">
                <span className="block h-full rounded-full" style={{ width: `${Math.max(2, (a.domains / max) * 100)}%`, background: spam ? "var(--red-11)" : empty ? C.light : C.signal }} />
              </span>
            </div>
            <span className="aw-num shrink-0 pt-px text-right font-medium text-ink">{num(a.domains)}</span>
          </li>
        );
      })}
    </ul>
  );
}

/** One page with all the addresses that reach it: http and https, with and without www, a trailing slash or a ?ref tag. */
export function pageGroups(pages: Overview["pages"]) {
  const key = (u: string) => {
    try {
      const x = new URL(u);
      return x.hostname.replace(/^www\./, "") + (x.pathname.replace(/\/+$/, "") || "/");
    } catch {
      return u;
    }
  };
  const by = new Map<string, Overview["pages"]>();
  for (const pg of pages) by.set(key(pg.url), [...(by.get(key(pg.url)) ?? []), pg]);
  return [...by.values()]
    .map((list) => ({ url: list[0].url, domains: list.reduce((a, x) => a + x.domains, 0), variants: list.length > 1 ? list : [] }))
    .sort((a, b) => b.domains - a.domains);
}

function TopPages({ pages, onOpen }: { pages: Overview["pages"]; onOpen: (u: string) => void }) {
  const groups = pageGroups(pages).slice(0, 6);
  const max = Math.max(1, ...groups.map((g) => g.domains));
  const label = (u: string) => {
    const p = pathOf(u);
    return p === "/" ? "Home page" : p;
  };
  return (
    <ul className="flex flex-col">
      {groups.map((g) => (
        <li key={g.url} className="flex items-start gap-4 border-t border-[var(--border-medium)] px-5 py-3 first:border-t-0">
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <button type="button" onClick={() => onOpen(g.url)} className="self-start text-left font-medium text-ink wrap-anywhere hover:underline">
              {label(g.url)}
            </button>
            {g.variants.length ? (
              <>
                <span className="flex flex-wrap gap-1.5">
                  {g.variants.map((v) => (
                    <span key={v.url} className="aw-tag">
                      {v.url.replace(/^https:\/\//, "")} <b className="aw-num font-semibold text-ink">{num(v.domains)}</b>
                    </span>
                  ))}
                </span>
                <span className="aw-status aw-status--warn self-start">{g.variants.length} addresses for one page</span>
              </>
            ) : null}
            <span className="block h-1 max-w-80 rounded-full bg-[var(--bg-tertiary)]">
              <span className="block h-full rounded-full" style={{ width: `${Math.max(2, (g.domains / max) * 100)}%`, background: C.signal }} />
            </span>
          </div>
          <span className="aw-num shrink-0 pt-px text-right font-medium text-ink">{num(g.domains)}</span>
        </li>
      ))}
    </ul>
  );
}

type Profile = NonNullable<Overview["profile"]>;
type SourceView = "platforms" | "tlds" | "places" | "types";
const SOURCE_VIEWS: { id: SourceView; label: string }[] = [
  { id: "platforms", label: "Site type" },
  { id: "tlds", label: "Domain ending" },
  { id: "places", label: "Place on page" },
  { id: "types", label: "Link type" },
];

/** Where the backlinks come from, one view at a time: full counts and each one's share. */
function Sources({ prof }: { prof: Profile }) {
  const views = SOURCE_VIEWS.filter((v) => prof[v.id].length);
  const [view, setView] = useState<SourceView>(views[0]?.id ?? "platforms");
  const rows = prof[view] ?? [];
  const total = rows.reduce((a, r) => a + r.value, 0) || 1;
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <Card title="Where the backlinks come from" action={<Seg label="Group backlinks by" value={view} onChange={setView} options={views} />}>
      <div className="grid gap-x-10 px-5 pb-4 md:grid-cols-2">
        {rows.map((r) => (
          <div key={r.key} className="grid min-h-10 grid-cols-[minmax(100px,1fr)_minmax(70px,1.3fr)_72px_44px] items-center gap-3 border-t border-[var(--border-medium)] text-[14px]">
            <span className="min-w-0 text-body wrap-anywhere">{r.label}</span>
            <span className="block h-1.5 rounded-full bg-[var(--bg-tertiary)]">
              <span className="block h-full rounded-full" style={{ width: `${Math.max(1.5, (r.value / max) * 100)}%`, background: C.signal }} />
            </span>
            <span className="aw-num text-right font-medium text-ink">{num(r.value)}</span>
            <span className="aw-num text-right text-[13px] text-muted">{Math.round((r.value / total) * 100)}%</span>
          </div>
        ))}
      </div>
    </Card>
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
