"use client";

import { useState } from "react";
import type { AuditIssue, AuditResult } from "@/lib/audit";
import { AREAS, type Area, type Severity } from "@/lib/tech/checks";
import type { IssueChange } from "@/lib/siteAudit";
import { downloadCsv } from "../research/shared";
import { Card, Seg } from "../ui";
import { areaOf, ChangeTag, howOf, num, SEV, SevDot, short } from "./shared";

// Every issue, grouped by Errors, Warnings and Notices, with filters, the pages each hits, and Fix where a play exists.

export function Issues(p: {
  result: AuditResult;
  pages: number;
  changes: Map<string, IssueChange>;
  area: Area | null;
  onArea: (a: Area | null) => void;
  open: string | null;
  onOpen: (id: string | null) => void;
  canEdit: boolean;
  busy: string;
  onFix: (i: AuditIssue) => void;
  onPages: (issueId: string) => void;
  hasPages: boolean;
}) {
  const [sev, setSev] = useState<Severity | "all">("all");
  const [onlyNew, setOnlyNew] = useState(false);
  const [onlyFix, setOnlyFix] = useState(false);
  const root = p.result.root;
  const list = p.result.issues.filter((i) => (sev === "all" || i.severity === sev) && (!p.area || areaOf(i) === p.area) && (!onlyNew || p.changes.get(i.id)?.kind === "new") && (!onlyFix || Boolean(i.play)));
  const n = (s: Severity) => p.result.issues.filter((i) => i.severity === s && (!p.area || areaOf(i) === p.area)).length;
  const csv = () =>
    downloadCsv(
      "site-audit-issues.csv",
      ["severity", "area", "issue", "pages", "example pages"],
      list.map((i) => [SEV[i.severity].one, AREAS.find((a) => a.id === areaOf(i))?.label ?? "", i.title, i.count, i.pages.slice(0, 20).join(" ")]),
    );

  return (
    <Card
      title={`${num(list.length)} ${list.length === 1 ? "issue" : "issues"}`}
      action={
        <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm" onClick={csv} disabled={!list.length}>
          Export CSV
        </button>
      }
    >
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--aw-rule)] px-5 pb-3">
        <Seg label="Severity" value={sev} onChange={setSev} options={[{ id: "all", label: "All" }, { id: "high", label: `Errors ${n("high")}` }, { id: "medium", label: `Warnings ${n("medium")}` }, { id: "low", label: `Notices ${n("low")}` }]} />
        <button type="button" aria-pressed={onlyNew} onClick={() => setOnlyNew(!onlyNew)} className="aw-chip aw-chip--btn">
          New only
        </button>
        <button type="button" aria-pressed={onlyFix} onClick={() => setOnlyFix(!onlyFix)} className="aw-chip aw-chip--btn">
          Has a fix
        </button>
        {AREAS.filter((a) => p.result.issues.some((i) => areaOf(i) === a.id)).map((a) => (
          <button key={a.id} type="button" aria-pressed={p.area === a.id} onClick={() => p.onArea(p.area === a.id ? null : a.id)} className="aw-chip aw-chip--btn">
            {a.label}
          </button>
        ))}
      </div>
      {list.length ? (
        <div className="overflow-x-auto">
          <table className="aw-table">
            <thead>
              <tr>
                <th>Issue</th>
                <th className="text-right">Pages</th>
                <th className="min-w-36">Share of pages</th>
                <th>Since last crawl</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {(["high", "medium", "low"] as const).flatMap((s) => {
                const group = list.filter((i) => i.severity === s);
                if (!group.length) return [];
                return [
                  <tr key={`h${s}`}>
                    <td colSpan={5} className="bg-[var(--aw-surface-2)] py-2! text-[12px] font-semibold text-muted">
                      {SEV[s].name}
                    </td>
                  </tr>,
                  ...group.flatMap((i) => {
                    const isOpen = p.open === i.id;
                    const siteWide = i.siteWide ?? !i.pages.length;
                    const share = siteWide ? null : Math.min(1, i.count / Math.max(1, p.pages));
                    return [
                      <tr key={i.id} className="cursor-pointer" onClick={() => p.onOpen(isOpen ? null : i.id)}>
                        <td className="min-w-64">
                          <span className="flex items-start gap-2.5">
                            <span className="pt-1.5">
                              <SevDot s={i.severity} />
                            </span>
                            <span className="min-w-0">
                              <span className="block font-medium text-ink">{i.title}</span>
                              <span className="block text-[12px] text-muted">{AREAS.find((a) => a.id === areaOf(i))?.label ?? ""}</span>
                            </span>
                          </span>
                        </td>
                        <td className="aw-num text-right">{siteWide ? "Site" : num(i.count)}</td>
                        <td>
                          {share !== null ? (
                            <span className="flex items-center gap-2">
                              <span className="block h-2 flex-1 rounded-full bg-[var(--aw-surface-2)]">
                                <span className="block h-full rounded-full" style={{ width: `${Math.max(2, share * 100)}%`, background: SEV[i.severity].color }} />
                              </span>
                              <span className="aw-num w-9 text-right text-[12px] text-muted">{Math.round(share * 100)}%</span>
                            </span>
                          ) : (
                            <span className="text-[12px] text-muted">Whole site</span>
                          )}
                        </td>
                        <td>
                          <ChangeTag change={p.changes.get(i.id)} />
                        </td>
                        <td className="text-right" onClick={(e) => e.stopPropagation()}>
                          {p.canEdit && i.play ? (
                            <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm" onClick={() => p.onFix(i)} disabled={p.busy === i.id}>
                              {p.busy === i.id ? "Preparing" : "Fix"}
                            </button>
                          ) : null}
                        </td>
                      </tr>,
                      isOpen ? (
                        <tr key={`${i.id}-open`}>
                          <td colSpan={5} className="bg-[var(--aw-paper,#FBFBFC)]">
                            <div className="grid gap-4 py-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
                              <div className="flex flex-col gap-2 text-[13px] text-body">
                                <div>
                                  <b className="font-semibold text-ink">Why it matters. </b>
                                  {i.why}
                                </div>
                                {howOf(i) ? (
                                  <div>
                                    <b className="font-semibold text-ink">How to fix it. </b>
                                    {howOf(i)}
                                  </div>
                                ) : null}
                              </div>
                              <div className="flex min-w-0 flex-col gap-1.5 text-[13px]">
                                {i.id === "broken_links" && p.result.brokenLinks.length ? (
                                  <ul className="flex flex-col gap-1">
                                    {p.result.brokenLinks.slice(0, 15).map((b, k) => (
                                      <li key={k} className="wrap-anywhere">
                                        <span className="aw-status aw-status--missed mr-2">{b.status || "No answer"}</span>
                                        {short(b.url, root)} <span className="text-muted">on {short(b.from, root)}</span>
                                      </li>
                                    ))}
                                  </ul>
                                ) : i.pages.length ? (
                                  <ul className="flex flex-col gap-1">
                                    {i.pages.slice(0, 12).map((u) => (
                                      <li key={u} className="wrap-anywhere">
                                        <a href={u} target="_blank" rel="noreferrer" className="text-ink hover:underline">
                                          {short(u, root)}
                                        </a>
                                      </li>
                                    ))}
                                  </ul>
                                ) : null}
                                {i.pages.length ? (
                                  <span className="flex flex-wrap items-center gap-3 pt-1">
                                    {i.count > 12 ? <span className="text-muted">and {num(i.count - 12)} more</span> : null}
                                    {p.hasPages ? (
                                      <button type="button" className="aw-text-link text-[13px]" onClick={() => p.onPages(i.id)}>
                                        See every page
                                      </button>
                                    ) : null}
                                  </span>
                                ) : null}
                              </div>
                            </div>
                          </td>
                        </tr>
                      ) : null,
                    ];
                  }),
                ];
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="px-5 py-5 text-[13px] text-muted">No issues match these filters.</p>
      )}
    </Card>
  );
}
