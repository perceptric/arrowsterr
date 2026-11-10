"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import type { BlScope } from "@/lib/backlinks";
import { downloadCsv } from "../research/shared";
import { Card, favicon, Thinking } from "../ui";

// Parts every Backlinks tab shares: the call to the route, saved answers kept while the page is open, site names that
// open their own backlinks, CSV export and the "not loaded yet" card.

export type Call = <T>(action: string, extra?: Record<string, unknown>) => Promise<T>;
export type Open = (q: string, scope: BlScope) => void;
/** Answers already fetched for this target, so moving between tabs doesn't ask again. */
export type Memo = Map<string, unknown>;
export type TabProps = { call: Call; memo: Memo; canEdit: boolean; armed: boolean; label: string; isOwn: boolean; onError: (e: string) => void; onOpen: Open };

export const num = (x: number) => x.toLocaleString("en-US");
export const when = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
export const monthOf = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
export const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));
export const fileName = (label: string, what: string) => `${label.replace(/[/?#:]+/g, "_")}-${what}.csv`;

export function Fav({ domain, size = 16 }: { domain: string; size?: number }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={favicon(domain)} alt="" width={size} height={size} className="shrink-0 rounded-[3px]" style={{ width: size, height: size }} />;
}

/** A site: its name opens its own backlinks, the arrow opens the site. */
export function SiteLink({ domain, sub, href, onOpen, children }: { domain: string; sub?: string; href?: string; onOpen: Open; children?: ReactNode }) {
  return (
    <span className="flex min-w-0 flex-col">
      <span className="flex min-w-0 flex-wrap items-center gap-2">
        <Fav domain={domain} />
        <button type="button" className="text-left font-medium text-ink wrap-anywhere hover:underline" onClick={() => onOpen(domain, "domain")}>
          {domain}
        </button>
        <a href={href ?? `https://${domain}`} target="_blank" rel="noreferrer" aria-label={`Open ${domain}`} className="text-muted hover:text-ink">
          ↗
        </a>
        {children}
      </span>
      {sub ? <span className="text-[12px] text-muted wrap-anywhere">{sub}</span> : null}
    </span>
  );
}

export function CsvButton({ name, head, rows }: { name: string; head: string[]; rows: (string | number | null | undefined)[][] }) {
  return (
    <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm" onClick={() => downloadCsv(name, head, rows)} disabled={!rows.length}>
      Export CSV
    </button>
  );
}

export function Updated({ at, busy, canRefresh, onRefresh }: { at: string; busy: boolean; canRefresh: boolean; onRefresh: () => void }) {
  return (
    <span className="flex flex-wrap items-center gap-3 text-[12px] text-muted">
      <span>Updated {when(at)}</span>
      {canRefresh ? (
        <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm" onClick={onRefresh} disabled={busy}>
          {busy ? "Refreshing" : "Refresh"}
        </button>
      ) : null}
    </span>
  );
}

/** A filter that turns on and off. */
export function Toggle({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick} className="aw-chip aw-chip--btn">
      {children}
    </button>
  );
}

export function NotLoaded({ canEdit, busy, label, onLoad }: { canEdit: boolean; busy: boolean; label: string; onLoad: () => void }) {
  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
        <span className="text-[14px] text-body">Not loaded yet.</span>
        {canEdit ? (
          <button type="button" className="aw-btn aw-btn--primary aw-btn--sm" onClick={onLoad} disabled={busy}>
            {busy ? "Loading" : label}
          </button>
        ) : null}
      </div>
    </Card>
  );
}

/**
 * One saved answer for a tab. Opening reads saved answers only; after a search or a tab pick (armed) an editor's
 * request loads a fresh one when none is saved. Answers stay in memo while the page is open.
 */
export function useAnswer<T>(call: Call, memo: Memo, action: string, pick: (r: Record<string, unknown>) => T | null | undefined, armed: boolean, onError: (e: string) => void, extra: Record<string, unknown> = {}) {
  const id = `${action}:${JSON.stringify(extra)}`;
  const [data, setData] = useState<T | null | "none">(() => (memo.has(id) ? (memo.get(id) as T) : null));
  const [busy, setBusy] = useState(false);
  const [canRefresh, setCanRefresh] = useState(false);
  const load = useCallback(
    async (fresh: boolean) => {
      if (fresh) setBusy(true);
      onError("");
      try {
        const r = await call<Record<string, unknown>>(action, { ...extra, ...(fresh ? { refresh: true } : armed ? {} : { peek: true }) });
        const v = r.notSaved ? null : pick(r);
        setCanRefresh(Boolean(r.canRefresh));
        if (v === null || v === undefined) setData("none");
        else {
          memo.set(id, v);
          setData(v);
        }
      } catch (e) {
        onError(msg(e));
        setData((d) => d ?? "none");
      } finally {
        setBusy(false);
      }
    },
    // extra is compared through id.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [call, memo, action, id, armed, onError],
  );
  useEffect(() => {
    if (memo.has(id)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setData(memo.get(id) as T);
      return;
    }
    setData(null);
    load(false);
  }, [id, memo, load]);
  return { data, busy, canRefresh, load };
}

export const Loading = ({ text = "Loading" }: { text?: string }) => <Thinking text={text} />;
