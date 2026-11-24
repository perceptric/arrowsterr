"use client";

import { useEffect, useState } from "react";
import { bareHost, SOURCES, type BrandPresence, type GbpPresence, type Status, type TrustpilotPresence, type WikiPresence } from "@/lib/presence";
import type { RunAuth } from "@/lib/runner";
import { useStash } from "@/lib/stash";
import { BrandLogo } from "./BrandLogo";
import { EmptyNote } from "./Drawing";
import { favicon, guessDomain, Thinking, Tip } from "./ui";

// "Where AI gets its facts": the picked brand and its top competitors on Wikipedia, Wikidata,
// Trustpilot and Google Business Profile. Wikipedia is free and loads on open. Review sites are
// paid checks an editor starts; they come back within minutes and are kept for a week.

type Data = { brands: BrandPresence[]; unchecked: number; taskCost: number; paidReady: boolean };
type Rival = { name: string; domain: string | null };

const POLL_MS = 20_000;
const MAX_POLLS = 45; // about 15 minutes on the page

const STATUS: Record<Status, { label: string; cls: string }> = {
  found: { label: "Found", cls: "aw-status--ranked" },
  missing: { label: "Missing", cls: "aw-status--missed" },
  checking: { label: "Checking", cls: "aw-status--pending" },
  unchecked: { label: "Not checked yet", cls: "aw-status--pending" },
  error: { label: "Couldn't check", cls: "aw-status--warn" },
};

const n = (v: number | null | undefined) => (v === null || v === undefined ? "–" : v.toLocaleString("en-US"));
const day = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "–");
const stars = (r: number | null | undefined) => (r === null || r === undefined ? "–" : `★ ${r.toFixed(1)}`);

function Badge({ status }: { status: Status }) {
  const s = STATUS[status];
  return <span className={`aw-status ${s.cls}`}>{s.label}</span>;
}

function Line({ children }: { children: React.ReactNode }) {
  return <span className="block truncate text-[12px] text-muted">{children}</span>;
}

function Tipline({ text }: { text: string }) {
  return <span className="mt-1 block text-[12px] leading-4 text-body">{text}</span>;
}

/** Wikipedia: the article, its languages, last edit and recent views. */
function WikiCell({ w, you }: { w: WikiPresence; you?: boolean }) {
  const status: Status = w.status === "found" && !w.article ? "missing" : w.status;
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <Badge status={status} />
      {w.article ? (
        <>
          <a href={w.article.url} target="_blank" rel="noreferrer" className="aw-text-link truncate text-[13px]">
            {w.article.title}
          </a>
          <Line>
            {w.languages?.length ?? 1} language{(w.languages?.length ?? 1) === 1 ? "" : "s"}
          </Line>
          <Line>Edited {day(w.article.lastEdit)}</Line>
          <Line>{n(w.article.views30)} views in 30 days</Line>
        </>
      ) : null}
      {w.note ? <Line>{w.note}</Line> : null}
      {you && status === "missing" ? <Tipline text={SOURCES.wiki.tip} /> : null}
    </div>
  );
}

/** Wikidata: the item and its key facts. */
function WikidataCell({ w, you }: { w: WikiPresence; you?: boolean }) {
  const f = w.facts;
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <Badge status={w.status} />
      {w.wikidata ? (
        <a href={w.wikidata.url} target="_blank" rel="noreferrer" className="aw-text-link truncate text-[13px]" title={w.wikidata.description ?? undefined}>
          {w.wikidata.label} · {w.wikidata.id}
        </a>
      ) : null}
      {f ? (
        <>
          <Line>Website: {f.website ? bareHost(f.website) : "–"}</Line>
          <Line>Founded: {f.founded ?? "–"}</Line>
          <Line>Head office: {f.hq ?? "–"}</Line>
          {f.industry.length ? <Line>Industry: {f.industry.join(", ")}</Line> : null}
        </>
      ) : null}
      {w.match === "name" ? <Line>Matched by name only</Line> : null}
      {you && w.status === "missing" ? <Tipline text={SOURCES.wikidata.tip} /> : null}
    </div>
  );
}

function TrustpilotCell({ t, you }: { t: TrustpilotPresence; you?: boolean }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <Badge status={t.status} />
      {t.status === "found" ? (
        <>
          <span className="aw-num text-[13px] text-ink">
            {stars(t.rating)} · {n(t.reviews)} reviews
          </span>
          {t.url ? (
            <a href={t.url} target="_blank" rel="noreferrer" className="aw-text-link text-[12px]">
              Open on Trustpilot
            </a>
          ) : null}
          {t.recent?.length ? (
            <details className="mt-1 text-[12px]">
              <summary className="cursor-pointer text-muted">Recent reviews</summary>
              <ul className="mt-1 flex flex-col gap-2">
                {t.recent.map((r, i) => (
                  <li key={r.url ?? i} className="border-l-2 border-rule-faint pl-2">
                    <span className="block text-ink">
                      {stars(r.rating)} {r.title ? `· ${r.title}` : ""}
                    </span>
                    <span className="line-clamp-3 block text-muted">{r.text}</span>
                    <span className="block text-muted">{r.date ?? ""}</span>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </>
      ) : null}
      {t.note ? <Line>{t.note}</Line> : null}
      {you && t.status === "missing" ? <Tipline text={SOURCES.trustpilot.tip} /> : null}
    </div>
  );
}

function GbpCell({ g, you }: { g: GbpPresence; you?: boolean }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="flex flex-wrap items-center gap-1.5">
        <Badge status={g.status} />
        {g.status === "found" && g.claimed !== null && g.claimed !== undefined ? <span className="aw-chip">{g.claimed ? "Claimed" : "Unclaimed"}</span> : null}
      </span>
      {g.status === "found" ? (
        <>
          <span className="aw-num text-[13px] text-ink">
            {stars(g.rating)} · {n(g.reviews)} reviews
          </span>
          {g.category ? <Line>{g.category}</Line> : null}
          {g.address ? <Line>{g.address}</Line> : null}
          {g.url ? (
            <a href={g.url} target="_blank" rel="noreferrer" className="aw-text-link text-[12px]">
              Open on Google Maps
            </a>
          ) : null}
        </>
      ) : null}
      {g.note ? <Line>{g.note}</Line> : null}
      {you && g.status === "missing" ? <Tipline text={SOURCES.gbp.tip} /> : null}
    </div>
  );
}

const ROWS: { id: string; label: string; help: string; cell: (b: BrandPresence) => React.ReactNode }[] = [
  { id: "wiki", label: SOURCES.wiki.label, help: "The brand's own article. AI tools read it for history and key facts.", cell: (b) => <WikiCell w={b.wiki} you={b.you} /> },
  { id: "wikidata", label: SOURCES.wikidata.label, help: "The open facts database behind Wikipedia. We match it by the brand's website.", cell: (b) => <WikidataCell w={b.wiki} you={b.you} /> },
  { id: "trustpilot", label: SOURCES.trustpilot.label, help: "Star rating and reviews from customers.", cell: (b) => <TrustpilotCell t={b.trustpilot} you={b.you} /> },
  { id: "gbp", label: SOURCES.gbp.label, help: "The brand's listing on Google Search and Maps. We only count a profile that links to the brand's site.", cell: (b) => <GbpCell g={b.gbp} you={b.you} /> },
];

export function PresencePanel({ brand, rivals, reader, canCheck }: { brand: { id: string; name: string; domain: string }; rivals: Rival[]; reader: RunAuth; canCheck: boolean }) {
  const [data, setData] = useStash<Data | null>(`presence:${brand.id}`, null);
  const [loaded, setLoaded] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [polls, setPolls] = useState(0);
  const key = JSON.stringify(rivals);
  const loading = loaded !== `${brand.id}:${key}`;

  const ask = async (action?: "check") => {
    const res = await fetch("/api/presence", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${await reader.token()}` },
      body: JSON.stringify({ workspaceId: reader.workspaceId, brandId: brand.id, competitors: JSON.parse(key), action }),
    }).catch(() => null);
    const out = res ? await res.json().catch(() => null) : null;
    if (!res?.ok || !out?.brands) throw new Error(out?.error ?? "Couldn't load this right now. Try again in a minute.");
    return out as Data;
  };

  // Load on open and when the competitors change. Saved results are free.
  useEffect(() => {
    let live = true;
    ask()
      .then((d) => {
        if (!live) return;
        setData(d);
        setError(null);
      })
      .catch((e) => {
        if (live) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (live) setLoaded(`${brand.id}:${key}`);
      });
    return () => {
      live = false;
    };
    // ask reads key and brand; the request depends on those.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, brand.id, reader]);

  // While a review check is queued, look again every so often. Reading results is free.
  const checking = Boolean(data?.brands.some((b) => b.trustpilot.status === "checking" || b.gbp.status === "checking"));
  useEffect(() => {
    if (!checking || polls >= MAX_POLLS) return;
    const t = setTimeout(() => {
      ask()
        .then((d) => setData(d))
        .catch(() => {})
        .finally(() => setPolls((p) => p + 1));
    }, POLL_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checking, polls]);

  const check = async () => {
    setBusy(true);
    setError(null);
    try {
      setData(await ask("check"));
      setPolls(0);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const tasks = data ? data.unchecked * data.taskCost : 0;
  return (
    <section className="aw-frame" aria-busy={loading || busy}>
      <div className="aw-frame__head flex-wrap justify-between gap-3">
        <h2 className="aw-h4">
          Where AI gets its facts
          <Tip text="AI tools lean on a few sites for basic facts about a company. See how you and your top competitors show up on each one." />
        </h2>
        {checking ? (
          <span className="aw-micro">Checking review sites. This usually takes a few minutes.</span>
        ) : canCheck && data?.paidReady && data.unchecked ? (
          <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm" disabled={busy} onClick={check}>
            {busy ? "Starting…" : `Check review sites · ${tasks} task${tasks === 1 ? "" : "s"}`}
          </button>
        ) : null}
      </div>
      {error ? <p className="aw-error m-5">{error}</p> : null}
      {!data && loading ? (
        <div className="p-5">
          <Thinking text="Looking up Wikipedia and review sites" />
        </div>
      ) : null}
      {!data && !loading && !error ? <EmptyNote drawing="sources">Nothing to show yet.</EmptyNote> : null}
      {data ? (
        <div className="overflow-x-auto">
          <table className="aw-table min-w-[640px]">
            <thead>
              <tr>
                <th className="w-44">Source</th>
                {data.brands.map((b) => (
                  <th key={b.name} className="text-left">
                    <span className="flex items-center gap-2 normal-case">
                      <BrandLogo src={favicon(b.domain || guessDomain(b.name))} name={b.name} size={18} />
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate font-medium text-ink">{b.name}</span>
                        {b.you ? <span className="text-[11px] text-muted">You</span> : b.domain ? <span className="truncate text-[11px] text-muted">{b.domain}</span> : null}
                      </span>
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROWS.map((r) => (
                <tr key={r.id}>
                  <td className="align-top font-medium text-ink">
                    {r.label}
                    <Tip text={r.help} />
                  </td>
                  {data.brands.map((b) => (
                    <td key={b.name} className={`align-top ${b.you ? "bg-surface-2" : ""}`}>
                      {r.cell(b)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {data.brands.length === 1 ? <p className="aw-small border-t border-rule-faint px-5 py-3">Your top competitors show up here once AI answers name them.</p> : null}
          {!canCheck && data.unchecked ? <p className="aw-small border-t border-rule-faint px-5 py-3">An editor can check the review sites for these brands.</p> : null}
        </div>
      ) : null}
    </section>
  );
}
