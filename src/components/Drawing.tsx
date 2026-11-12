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

/** An empty screen: the picture, a short title, one line and the button that makes the first one. */
export function EmptyScreen({ drawing: kind, title, children, action }: { drawing: DrawingKind; title: string; children?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="aw-empty flex min-h-[calc(100dvh-220px)] flex-col items-center justify-center px-6 py-12 text-center">
      <Drawing kind={kind} />
      <h2 className="aw-empty__title mt-6 text-[17px] font-medium tracking-[-0.01em] text-ink">{title}</h2>
      {children ? <p className="mt-1.5 max-w-sm text-[13.5px] leading-5 text-muted">{children}</p> : null}
      {action ? <div className="mt-5 flex flex-wrap items-center justify-center gap-2">{action}</div> : null}
    </section>
  );
}
