"use client";

// Loading, error and empty states that keep the screen (docs/unify-plan.md, Part 1.6).
//
// Loading keeps the layout. Show the real frame, headers and labels at once, with bars where the values go:
//   - Skel: one bar, sized to the value it stands in for.
//   - SkelStats: a stats strip with its labels and a bar for each number.
//   - SkelRows: table body rows of bars, at the real row height. Put it inside the table's own <tbody>.
//   - SkelBlock: a few lines of bars for a card or a text block.
// Never clear the screen with Thinking for a page load; Thinking is for AI work someone started.
//
// Errors stay inside the block that failed. BlockError says what failed, when the data was last good,
// and offers Retry. The rest of the screen keeps working.
//
// Empty keeps the frame and header. EmptyRow goes in a table body, EmptyBlock in a card body:
// one sentence and the first action. Use ToolIntro only for a tool's first screen, before there's any data.
// Zero prints as 0; missing prints as "–".

import { ago } from "@/lib/dates";

type Size = number | string;

/** One grey bar. Width and height are the value's size: a number is pixels. */
export function Skel({ w = "100%", h = 8 }: { w?: Size; h?: Size }) {
  return <span className="aw-skel" style={{ width: w, height: h }} aria-hidden="true" />;
}

/** A stats strip while its numbers load. Pass labels to keep them on screen; n sets the cell count without them. */
export function SkelStats({ n = 4, labels, tight = false }: { n?: number; labels?: React.ReactNode[]; tight?: boolean }) {
  const cells = labels ?? Array.from({ length: n }, () => null);
  return (
    <div className={`aw-stats ${tight ? "aw-stats--tight" : ""}`} style={{ ["--cols" as string]: cells.length }} aria-busy="true">
      {cells.map((label, i) => (
        <div key={i} className="aw-stat flex flex-col gap-3">
          <div className="aw-stat__lab">{label ?? <Skel w={72} />}</div>
          <Skel w="45%" h={tight ? 28 : 34} />
        </div>
      ))}
    </div>
  );
}

/** Table body rows while a table loads, for inside an existing <tbody>. The first column's bar is wider, like a name. */
export function SkelRows({ rows = 6, cols }: { rows?: number; cols: number }) {
  return (
    <>
      {Array.from({ length: rows }, (_, r) => (
        <tr key={r} aria-hidden="true">
          {Array.from({ length: cols }, (_, c) => (
            <td key={c}>
              <Skel w={c === 0 ? `${55 + ((r * 13) % 30)}%` : "40%"} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

/** A few lines of bars for a card or text block while it loads. The last line is shorter, like a paragraph. */
export function SkelBlock({ lines = 3 }: { lines?: number }) {
  return (
    <div className="flex flex-col" aria-busy="true">
      {Array.from({ length: lines }, (_, i) => (
        <Skel key={i} w={i === lines - 1 && lines > 1 ? "60%" : "100%"} />
      ))}
    </div>
  );
}

/** A block that failed to load: "Couldn't load sources. Last updated 2 h ago." and Retry. Keep it inside the block. */
export function BlockError({ what, lastGood, onRetry }: { what: string; lastGood?: string | number | Date | null; onRetry?: () => void }) {
  return (
    <p className="aw-error flex flex-wrap items-center gap-x-3 gap-y-1" role="alert">
      <span>
        Couldn&apos;t load {what}.{lastGood ? ` Last updated ${ago(lastGood)}.` : ""}
      </span>
      {onRetry ? (
        <button type="button" className="aw-text-link" onClick={onRetry}>
          Retry
        </button>
      ) : null}
    </p>
  );
}

/** An empty table body: one row across every column with a sentence and its first action. */
export function EmptyRow({ colSpan, children, action }: { colSpan: number; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan}>
        <div className="flex flex-wrap items-center gap-3 py-6">
          <span className="aw-small">{children}</span>
          {action}
        </div>
      </td>
    </tr>
  );
}

/** An empty card body: one sentence and its first action. The card keeps its frame and header. */
export function EmptyBlock({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-3 p-6">
      <span className="aw-small">{children}</span>
      {action}
    </div>
  );
}
