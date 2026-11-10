"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { LINK_KINDS, type LinkKind, type LinkRow } from "@/lib/backlinks";
import { Card } from "../ui";
import { CsvButton, fileName, Loading, msg, num, SiteLink, Toggle, Updated, when, type TabProps } from "./shared";
import { pathOf } from "./Overview";

// Every backlink, one row per linking site, with the words around each anchor. Lists by type, plus "in the article"
// and anchor words, each a saved DataForSEO answer of 100 rows a page.

type Page = { rows: LinkRow[]; total: number; at: string };
const PLACE: Record<string, string> = { article: "Article", main: "Main content", section: "Section", summary: "Summary", aside: "Sidebar", footer: "Footer", header: "Header", nav: "Menu" };

export function LinksTab(p: TabProps) {
  const [kind, setKind] = useState<LinkKind>("all");
  const [article, setArticle] = useState(false);
  const [anchor, setAnchor] = useState("");
  const [typed, setTyped] = useState("");
  const [pages, setPages] = useState<Record<string, Page | "none">>({});
  const [shown, setShown] = useState(1);
  const [busy, setBusy] = useState(false);
  // After a search or a tab pick, a list that isn't saved loads on its own for editors.
  const live = useRef(p.armed);
  const id = `${kind}:${article ? "a" : ""}:${anchor}`;
  const { call, onError, memo } = p;

  const fetchPage = useCallback(
    async (page: number, fresh: boolean) => {
      const key = `${id}:${page}`;
      const hit = memo.get(`links:${key}`) as Page | undefined;
      if (hit && !fresh) return setPages((m) => ({ ...m, [key]: hit }));
      if (fresh) setBusy(true);
      onError("");
      try {
        const r = await call<{ links?: Page; notSaved?: boolean }>("links", { kind, page, article, anchor: anchor || undefined, ...(fresh ? { refresh: true } : live.current ? {} : { peek: true }) });
        if (r.links) memo.set(`links:${key}`, r.links);
        setPages((m) => ({ ...m, [key]: r.links ?? "none" }));
      } catch (e) {
        onError(msg(e));
        setPages((m) => ({ ...m, [key]: m[key] ?? "none" }));
      } finally {
        setBusy(false);
      }
    },
    [id, kind, article, anchor, call, onError, memo],
  );
  useEffect(() => {
    if (pages[`${id}:0`] !== undefined) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchPage(0, false);
  }, [id, pages, fetchPage]);

  const change = (fn: () => void) => {
    live.current = true;
    fn();
    setShown(1);
  };
  const first = pages[`${id}:0`];
  const rows: LinkRow[] = [];
  for (let i = 0; i < shown; i++) {
    const pg = pages[`${id}:${i}`];
    if (pg && pg !== "none") rows.push(...pg.rows);
  }
  const total = first && first !== "none" ? first.total : 0;
  const nextMissing = pages[`${id}:${shown}`] === undefined || pages[`${id}:${shown}`] === "none";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {LINK_KINDS.map((k) => (
          <Toggle key={k.id} on={kind === k.id} onClick={() => change(() => setKind(k.id))}>
            {k.label}
          </Toggle>
        ))}
        <span className="mx-1 h-5 w-px bg-[var(--aw-rule)]" aria-hidden="true" />
        <Toggle on={article} onClick={() => change(() => setArticle(!article))}>
          In the article
        </Toggle>
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            change(() => setAnchor(typed.trim()));
          }}
        >
          <input className="aw-input py-1.5! text-[13px]!" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Anchor contains" aria-label="Anchor contains" />
          {anchor ? (
            <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm" onClick={() => change(() => { setTyped(""); setAnchor(""); })}>
              Clear
            </button>
          ) : null}
        </form>
      </div>
      {first === undefined ? (
        <Loading />
      ) : first === "none" ? (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
            <span className="text-[14px] text-body">Not loaded yet.</span>
            {p.canEdit ? (
              <button type="button" className="aw-btn aw-btn--primary aw-btn--sm" onClick={() => fetchPage(0, true)} disabled={busy}>
                {busy ? "Loading" : "Load links"}
              </button>
            ) : null}
          </div>
        </Card>
      ) : (
        <Card
          title={`${num(total)} linking ${total === 1 ? "site" : "sites"}`}
          action={
            <span className="flex flex-wrap items-center gap-3">
              <CsvButton name={fileName(p.label, `${kind}-links`)} head={["linking site", "from page", "page title", "authority", "text before", "anchor", "text after", "to page", "follow", "attributes", "sits in", "spam", "new", "lost", "first seen"]} rows={rows.map((l) => [l.domain, l.from, l.title ?? "", l.rank, l.pre ?? "", l.anchor, l.post ?? "", l.to, l.follow ? "follow" : "nofollow", (l.attrs ?? []).join(" "), l.place ?? "", l.spam, l.isNew ? "yes" : "", l.isLost ? "yes" : "", l.firstSeen ?? ""])} />
              <Updated
                at={first.at}
                busy={busy}
                canRefresh={p.canEdit}
                onRefresh={() => {
                  setShown(1);
                  setPages((m) => Object.fromEntries(Object.entries(m).filter(([k]) => !k.startsWith(`${id}:`))));
                  fetchPage(0, true);
                }}
              />
            </span>
          }
        >
          {rows.length ? (
            <div className="overflow-x-auto">
              <table className="aw-table">
                <thead>
                  <tr>
                    <th>From</th>
                    <th className="text-right">Authority</th>
                    <th>Anchor in context</th>
                    <th>To</th>
                    <th>Type</th>
                    <th>Sits in</th>
                    <th>First seen</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((l) => (
                    <tr key={`${l.from}>${l.to}`}>
                      <td className="min-w-56">
                        <SiteLink domain={l.domain} sub={l.title || l.from} href={l.from} onOpen={p.onOpen} />
                      </td>
                      <td className="aw-num text-right">{l.rank}</td>
                      <td className="max-w-96 min-w-56 text-[13px] text-muted wrap-break-word">
                        {l.pre ? `${l.pre} ` : ""}
                        {l.anchor ? <mark className="rounded-[3px] bg-[var(--aw-brand-pale)] px-1 font-medium text-[var(--signal)]">{l.anchor}</mark> : <span className="aw-tag">{l.type === "image" ? "Image" : "No text"}</span>}
                        {l.post ? ` ${l.post}` : ""}
                      </td>
                      <td className="min-w-32 wrap-anywhere">
                        <button type="button" className="text-left hover:underline" onClick={() => p.onOpen(l.to, "url")}>
                          {pathOf(l.to)}
                        </button>
                      </td>
                      <td>
                        <span className="flex flex-wrap gap-1">
                          <span className={`aw-status ${l.follow ? "aw-status--ranked" : "aw-status--pending"}`}>{l.follow ? "Follow" : "Nofollow"}</span>
                          {(l.attrs ?? []).includes("ugc") ? <span className="aw-tag">UGC</span> : null}
                          {(l.attrs ?? []).includes("sponsored") ? <span className="aw-tag">Sponsored</span> : null}
                          {l.spam > 60 ? <span className="aw-status aw-status--missed">Spam {l.spam}</span> : null}
                          {l.isLost ? <span className="aw-status aw-status--missed">Lost</span> : l.isNew ? <span className="aw-status aw-status--ranked">New</span> : null}
                        </span>
                      </td>
                      <td className="text-[13px] text-muted">{l.place ? (PLACE[l.place] ?? l.place) : "–"}</td>
                      <td className="whitespace-nowrap">{l.firstSeen ? when(l.firstSeen) : "–"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="px-5 pb-5 text-[13px] text-muted">No links of this kind.</p>
          )}
          {rows.length < total && shown < 10 ? (
            <div className="px-5 py-4">
              <button
                type="button"
                className="aw-btn aw-btn--secondary aw-btn--sm"
                disabled={busy || (!p.canEdit && nextMissing)}
                onClick={async () => {
                  live.current = true;
                  if (nextMissing) await fetchPage(shown, false);
                  setShown((x) => x + 1);
                }}
              >
                {busy ? "Loading" : "Next 100"}
              </button>
            </div>
          ) : null}
        </Card>
      )}
    </div>
  );
}
