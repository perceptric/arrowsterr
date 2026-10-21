"use client";

import { track } from "@/lib/analytics";
import Link from "next/link";
import { useEffect, useState } from "react";
import { notesFor, partOfPair, plannedModule, type Pair } from "@/lib/articleGrid";
import type { PmNode } from "@/lib/docHtml";
import type { GridPlan } from "@/lib/gridData";
import { kindOf, MODULE_KINDS } from "@/lib/moduleCatalog";
import type { RunAuth } from "@/lib/runner";
import { Dropdown } from "../Pickers";
import { Modal } from "../reports/Dialog";
import { post } from "../research/shared";
import { Thinking } from "../ui";

// Generate content, one section or all of them (docs/content-grid.md). The screen shows what each section will be
// written from: the brief's points (edit them), the interactive module to build (or none) and a note for all.
// Nothing runs until the brand's voice, guidelines and kit are on the Brand page. Sections run one at a time and
// each lands in the doc as it finishes.

type Row = { pair: number; heading: string; on: boolean; points: string; module: string; hasText: boolean };
type State = { s: "waiting" | "writing" | "done" | "failed"; note?: string };

const MODULE_OPTIONS = [{ id: "", label: "No module" }, ...MODULE_KINDS.map((k) => ({ id: k.id, label: k.label }))];

export function GenerateDialog({
  auth,
  itemId,
  pairs,
  plan,
  only,
  current,
  onSection,
  onClose,
}: {
  auth: RunAuth;
  itemId: string;
  pairs: Pair[];
  plan: GridPlan | null;
  /** The one section to start with picked, or null for all. */
  only: number | null;
  /** A section's text now, for the writer to build on. */
  current: (pair: number) => string;
  /** Put a finished section into the doc (made from the brief first if it doesn't exist yet). */
  onSection: (pair: number, nodes: PmNode[]) => Promise<void>;
  onClose: () => void;
}) {
  const [missing, setMissing] = useState<string[] | null>(null);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [rows, setRows] = useState<Row[]>(() =>
    pairs.map((p, pair) => {
      const part = partOfPair(pair);
      return {
        pair,
        heading: p.heading,
        on: only === null || only === pair,
        points: (notesFor(plan, part, p.heading)?.points ?? []).join("\n"),
        module: part === "intro" ? "" : (plannedModule(plan, p.heading) ?? ""),
        hasText: Boolean(p.body && (p.body.words || p.body.has.length)),
      };
    }),
  );
  const [state, setState] = useState<Record<number, State>>({});
  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState(false);

  useEffect(() => {
    let live = true;
    post<{ missing: string[] }>(auth, "/api/agentic-writer/grid", { action: "brand", itemId })
      .then((r) => live && setMissing(r.missing))
      .catch((e) => {
        if (!live) return;
        setError(e instanceof Error ? e.message : String(e));
        setMissing([]);
      });
    return () => {
      live = false;
    };
  }, [auth, itemId]);

  const picked = rows.filter((r) => r.on);
  const set = (pair: number, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.pair === pair ? { ...r, ...patch } : r)));

  async function run() {
    setRunning(true);
    setError("");
    setState(Object.fromEntries(picked.map((r) => [r.pair, { s: "waiting" }])));
    for (const r of picked) {
      setState((x) => ({ ...x, [r.pair]: { s: "writing" } }));
      try {
        const part = partOfPair(r.pair);
        const out = await post<{ nodes: PmNode[]; moduleError: string | null }>(auth, "/api/agentic-writer/grid", {
          action: "section",
          itemId,
          part: part === "intro" ? "intro" : "section",
          h2: part === "intro" ? "" : r.heading,
          index: part === "intro" ? 0 : part,
          points: r.points.split("\n").map((x) => x.trim()).filter(Boolean),
          note,
          current: current(r.pair),
          module: r.module || null,
        });
        await onSection(r.pair, out.nodes);
        track("section_generated", { module: r.module || "none", module_failed: Boolean(out.moduleError), all: only === null });
        setState((x) => ({ ...x, [r.pair]: out.moduleError ? { s: "done", note: out.moduleError } : { s: "done" } }));
      } catch (e) {
        setState((x) => ({ ...x, [r.pair]: { s: "failed", note: e instanceof Error ? e.message : String(e) } }));
      }
    }
    setRunning(false);
    setFinished(true);
  }

  const TAG: Record<State["s"], [string, string]> = { waiting: ["Waiting", ""], writing: ["Writing", "tw-tag--orange"], done: ["Done", "tw-tag--green"], failed: ["Failed", "tw-tag--red"] };

  return (
    <Modal title={only === null ? "Generate content" : `Generate section ${only + 1}`} onClose={running ? () => {} : onClose} width="max-w-3xl">
      {missing === null ? (
        <Thinking text="Checking the brand..." />
      ) : missing.length ? (
        <div className="flex flex-col gap-4">
          <p className="text-[13px] text-ink">Fill these in on the Brand page first:</p>
          <ul className="flex flex-col gap-1.5">
            {missing.map((m) => (
              <li key={m} className="flex items-center gap-2 text-[13px]">
                <span className="tw-tag tw-tag--red">Missing</span>
                {m}
              </li>
            ))}
          </ul>
          <div className="flex justify-end gap-2">
            <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm" onClick={onClose}>
              Close
            </button>
            <Link href="/brand" className="aw-btn aw-btn--primary aw-btn--sm">
              Open Brand page
            </Link>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex max-h-[58vh] flex-col gap-2 overflow-y-auto pr-1">
            {rows.map((r) => {
              const st = state[r.pair];
              const kind = r.module ? kindOf(r.module) : null;
              return (
                <div key={r.pair} className={`flex flex-col gap-2 border border-rule px-3 py-2.5 ${r.on ? "bg-white" : "bg-[var(--bg-secondary)]"}`}>
                  <label className="flex items-center gap-2 text-[13px]">
                    <input type="checkbox" checked={r.on} disabled={running || finished} onChange={() => set(r.pair, { on: !r.on })} />
                    <span className="text-muted">Section {r.pair + 1}</span>
                    <span className="min-w-0 flex-1 truncate font-medium text-ink">{r.pair === 0 ? "Intro" : r.heading || "Untitled"}</span>
                    {r.hasText && r.on && !st ? <span className="tw-tag">Replaces text</span> : null}
                    {st ? (
                      <span className={`tw-tag ${TAG[st.s][1]}`} title={st.note}>
                        {TAG[st.s][0]}
                      </span>
                    ) : null}
                  </label>
                  {st?.note ? <p className={st.s === "failed" ? "aw-error" : "text-[12px] text-muted"}>{st.note}</p> : null}
                  {r.on && !st ? (
                    <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_220px]">
                      <textarea value={r.points} rows={3} onChange={(e) => set(r.pair, { points: e.target.value })} aria-label={`Points for section ${r.pair + 1}`} className="aw-input min-h-20 py-2 text-[12px]" placeholder="One point per line" />
                      {r.pair === 0 ? (
                        <span />
                      ) : (
                        <span className="flex flex-col gap-1">
                          <Dropdown label={`Module for section ${r.pair + 1}`} value={r.module} onChange={(v) => set(r.pair, { module: v })} options={MODULE_OPTIONS} />
                          {kind ? <span className="text-[11px] leading-snug text-muted">{kind.when}</span> : null}
                        </span>
                      )}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
          {!finished ? (
            <label className="flex flex-col gap-1.5 text-[13px] text-body">
              Note
              <input value={note} maxLength={500} disabled={running} onChange={(e) => setNote(e.target.value)} className="aw-input" placeholder="Short paragraphs, name real prices" />
            </label>
          ) : null}
          {error ? <p className="aw-error">{error}</p> : null}
          <div className="flex justify-end gap-2">
            {finished ? (
              <button type="button" className="aw-btn aw-btn--primary aw-btn--sm" onClick={onClose}>
                Done
              </button>
            ) : (
              <>
                <button type="button" className="aw-btn aw-btn--secondary aw-btn--sm" disabled={running} onClick={onClose}>
                  Cancel
                </button>
                <button type="button" className="aw-btn aw-btn--primary aw-btn--sm" disabled={running || !picked.length} onClick={() => void run()}>
                  {running ? "Generating..." : picked.length === 1 ? "Generate 1 section" : `Generate ${picked.length} sections`}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
