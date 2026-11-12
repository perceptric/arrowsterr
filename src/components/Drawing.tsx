"use client";

import { useMemo } from "react";
import { drawing, FRAME, isoVars, type DrawingKind } from "@/lib/isoArt";

// The picture on an empty screen (docs/empty-screens-plan.md): one object of solid isometric blocks on a pale plate,
// in the style of the city on arrowsterr.com. The art is in src/lib/isoArt.ts; the motion (blocks drop in, then the
// object floats) is in calm-ui.css, section 14.

export type { DrawingKind };

const COLORS = isoVars("light") as React.CSSProperties;

/** One picture. 220 px wide on a screen; 96 in a panel or list. */
export function Drawing({ kind, size = 220 }: { kind: DrawingKind; size?: number }) {
  // The art is our own markup, built from numbers in isoArt.ts, with no text from anyone in it.
  const body = useMemo(() => drawing(kind).body, [kind]);
  return (
    <svg
      width={size}
      height={(size * FRAME.h) / FRAME.w}
      viewBox={`0 0 ${FRAME.w} ${FRAME.h}`}
      aria-hidden="true"
      className="aw-drawing shrink-0"
      style={COLORS}
      dangerouslySetInnerHTML={{ __html: body }}
    />
  );
}

/**
 * An empty screen (docs/empty-screens-plan.md): the picture, a title of six words or fewer, one line, and the button
 * that makes the first one. Search tools pass examples, shown as Try chips. fill stretches it to the screen's height;
 * under a search bar it sits at its own height.
 */
export function EmptyScreen({
  drawing: kind,
  title,
  children,
  action,
  examples,
  onExample,
  fill = true,
}: {
  drawing: DrawingKind;
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
  examples?: string[];
  onExample?: (x: string) => void;
  fill?: boolean;
}) {
  return (
    <section className={`aw-empty flex flex-col items-center justify-center px-6 text-center ${fill ? "min-h-[calc(100dvh-220px)] py-12" : "py-10"}`}>
      <Drawing kind={kind} />
      <h2 className="aw-empty__title mt-6 text-[17px] font-medium tracking-[-0.01em] text-ink">{title}</h2>
      {children ? <p className="mt-1.5 max-w-sm text-[13.5px] leading-5 text-muted">{children}</p> : null}
      {action ? <div className="mt-5 flex flex-wrap items-center justify-center gap-2">{action}</div> : null}
      {examples?.length ? (
        <div className="aw-intro__try mt-5 justify-center">
          <span>Try</span>
          {examples.map((x) => (
            <button key={x} type="button" className="aw-try" onClick={() => onExample?.(x)} disabled={!onExample}>
              {x}
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
}
