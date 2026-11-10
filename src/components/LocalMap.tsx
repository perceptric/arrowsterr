"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Map as MlMap, Marker } from "maplibre-gl";
import { grid, GRID, type Shape } from "@/lib/local";

// The rank grid on a real street map (MapLibre with OpenFreeMap's free tiles, docs/local-research.md). Each dot is a
// grid point coloured by the picked business's rank there. When the map can't load (no WebGL, tiles blocked), the
// page shows its drawn grid instead.

const STYLE = "https://tiles.openfreemap.org/styles/positron";
export const MAP_COLORS = { top3: "#1F9D55", top10: "#F2A20C", top20: "#E8590C" };

export function rankFill(r: number | null | undefined): { bg: string; fg: string; border: string } {
  if (r === undefined) return { bg: "#FFFFFF", fg: "#9A9A9A", border: "#C8C8C8" };
  if (r === null) return { bg: "#E5484D", fg: "#FFFFFF", border: "#FFFFFF" };
  if (r <= 3) return { bg: MAP_COLORS.top3, fg: "#FFFFFF", border: "#FFFFFF" };
  if (r <= 10) return { bg: MAP_COLORS.top10, fg: "#FFFFFF", border: "#FFFFFF" };
  return { bg: MAP_COLORS.top20, fg: "#FFFFFF", border: "#FFFFFF" };
}

export type MapDot = { label: string; bg: string; fg: string; border: string; dashed?: boolean; aria: string };

/** A rank as a dot: the number in the colour of its band. */
export function rankDot(r: number | null | undefined): MapDot {
  const f = rankFill(r);
  return { label: r === undefined ? "?" : r === null ? "20+" : String(r), ...f, dashed: r === undefined, aria: r === undefined ? "No answer" : r === null ? "Not in the top 20" : `Rank ${r}` };
}

/**
 * The grid on the map. `lat`, `lng` is the grid's centre; `pin` is where the business is (they differ when the centre was
 * moved, for a service-area business). With `onPick`, a click on the map picks a new centre.
 */
export function LocalMap({ lat, lng, spacing, size = GRID, shape = "square", pin, dots, sel, onSel, onFail, onPick }: { lat: number; lng: number; spacing: number; size?: number; shape?: Shape; pin?: { lat: number; lng: number }; dots: MapDot[]; sel: number; onSel: (i: number) => void; onFail: () => void; onPick?: (p: { lat: number; lng: number }) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<MlMap | null>(null);
  const markers = useRef<Marker[]>([]);
  const [ready, setReady] = useState(false);
  const pinAt = useMemo(() => (pin ? { lat: pin.lat, lng: pin.lng } : null), [pin?.lat, pin?.lng]); // eslint-disable-line react-hooks/exhaustive-deps
  const onSelRef = useRef(onSel);
  const onPickRef = useRef(onPick);
  useEffect(() => {
    onSelRef.current = onSel;
    onPickRef.current = onPick;
  }, [onSel, onPick]);

  // The map itself: made once per business and spacing, fitted to the grid.
  useEffect(() => {
    let gone = false;
    (async () => {
      try {
        const ml = (await import("maplibre-gl")).default;
        if (gone || !box.current) return;
        const pts = grid(lat, lng, spacing, size);
        const lats = pts.map((p) => p.lat);
        const lngs = pts.map((p) => p.lng);
        const m = new ml.Map({
          container: box.current,
          style: STYLE,
          bounds: [
            [Math.min(...lngs), Math.min(...lats)],
            [Math.max(...lngs), Math.max(...lats)],
          ],
          fitBoundsOptions: { padding: 36 },
          attributionControl: { compact: true },
          cooperativeGestures: true,
        });
        m.addControl(new ml.NavigationControl({ showCompass: false }), "bottom-right");
        m.on("error", (e) => {
          // A missing tile is fine; a style that never loads is not.
          if (!m.isStyleLoaded() && /style/i.test(String(e.error?.message ?? ""))) onFail();
        });
        m.on("load", () => !gone && setReady(true));
        m.on("click", (e) => onPickRef.current?.({ lat: e.lngLat.lat, lng: e.lngLat.lng }));
        map.current = m;
      } catch {
        if (!gone) onFail();
      }
    })();
    return () => {
      gone = true;
      markers.current.forEach((x) => x.remove());
      markers.current = [];
      map.current?.remove();
      map.current = null;
      setReady(false);
    };
  }, [lat, lng, spacing, size, onFail]);

  // The dots: redrawn when the picked business or the picked point changes.
  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    let gone = false;
    (async () => {
      const ml = (await import("maplibre-gl")).default;
      if (gone) return;
      markers.current.forEach((x) => x.remove());
      const pts = grid(lat, lng, spacing, size, shape);
      // Bigger grids get smaller dots so they don't overlap.
      const px = size >= 13 ? 20 : size >= 9 ? 25 : 30;
      markers.current = pts.map((p) => {
        const f = dots[p.i] ?? rankDot(undefined);
        const el = document.createElement("button");
        el.type = "button";
        el.className = "lr-dot";
        el.setAttribute("aria-label", f.aria);
        el.textContent = f.label;
        Object.assign(el.style, {
          background: f.bg,
          color: f.fg,
          borderColor: p.i === sel ? "#111111" : f.border,
          borderWidth: p.i === sel ? "3px" : "2px",
          borderStyle: f.dashed ? "dashed" : "solid",
          width: `${px}px`,
          height: `${px}px`,
          fontSize: px < 30 ? "9.5px" : "",
        });
        el.addEventListener("click", (e) => {
          e.stopPropagation();
          onSelRef.current(p.i);
        });
        return new ml.Marker({ element: el }).setLngLat([p.lng, p.lat]).addTo(m);
      });
      const pin = document.createElement("span");
      pin.className = "lr-pin";
      pin.setAttribute("aria-hidden", "true");
      const at = pinAt ?? { lat, lng };
      markers.current.push(new ml.Marker({ element: pin, offset: [0, -24] }).setLngLat([at.lng, at.lat]).addTo(m));
    })();
    return () => {
      gone = true;
    };
  }, [ready, dots, sel, lat, lng, spacing, size, shape, pinAt]);

  return <div ref={box} className={`lr-map h-[560px] w-full overflow-hidden rounded-[12px] bg-[var(--aw-surface-2)] ${onPick ? "cursor-crosshair [&_canvas]:cursor-crosshair!" : ""}`} role="region" aria-label={onPick ? "Click the map to put the grid's centre there" : "Rank grid on the map"} />;
}
