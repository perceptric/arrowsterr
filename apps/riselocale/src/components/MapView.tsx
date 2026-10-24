"use client";

import { useEffect, useRef } from "react";
import type * as Leaflet from "leaflet";
import type { LatLng } from "@/lib/geo";

export type MapPin = { idx: number; lat: number; lng: number; label: string; cls: string; title?: string };

type Props = {
  center: LatLng;
  business?: LatLng | null;
  pins?: MapPin[];
  selected?: number | null;
  onPinClick?: (idx: number) => void;
  preview?: LatLng[];
  mode?: "view" | "center" | "draw";
  area?: LatLng[];
  onAreaChange?: (pts: LatLng[]) => void;
  onCenterChange?: (p: LatLng) => void;
  className?: string;
  label?: string;
  /** Meters between pins, so dense grids draw as dots until zoomed in. */
  spacingM?: number;
};

const TILE = process.env.NEXT_PUBLIC_TILE_URL || "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const ATTRIBUTION = process.env.NEXT_PUBLIC_TILE_ATTRIBUTION || "&copy; OpenStreetMap contributors";

export default function MapView(props: Props) {
  const el = useRef<HTMLDivElement>(null);
  const L = useRef<typeof Leaflet | null>(null);
  const map = useRef<Leaflet.Map | null>(null);
  const layers = useRef<{ pins?: Leaflet.LayerGroup; extra?: Leaflet.LayerGroup }>({});
  const latest = useRef(props);
  latest.current = props;
  const fitted = useRef(false);

  useEffect(() => {
    let dead = false;
    (async () => {
      const leaflet = (await import("leaflet")).default;
      if (dead || !el.current || map.current) return;
      L.current = leaflet;
      const m = leaflet.map(el.current, { zoomControl: true, attributionControl: true, scrollWheelZoom: false }).setView([props.center.lat, props.center.lng], 13);
      leaflet.tileLayer(TILE, { attribution: ATTRIBUTION, maxZoom: 19 }).addTo(m);
      layers.current.pins = leaflet.layerGroup().addTo(m);
      layers.current.extra = leaflet.layerGroup().addTo(m);
      m.on("click", (e: Leaflet.LeafletMouseEvent) => {
        const p = latest.current;
        const pt = { lat: +e.latlng.lat.toFixed(7), lng: +e.latlng.lng.toFixed(7) };
        if (p.mode === "center") p.onCenterChange?.(pt);
        if (p.mode === "draw") p.onAreaChange?.([...(p.area ?? []), pt]);
      });
      m.on("zoomend", () => draw());
      m.on("focus", () => m.scrollWheelZoom.enable());
      m.on("blur", () => m.scrollWheelZoom.disable());
      map.current = m;
      draw();
    })();
    return () => {
      dead = true;
      map.current?.remove();
      map.current = null;
    };
    // The map is made once; the draw effect below follows prop changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function draw() {
    const leaflet = L.current;
    const m = map.current;
    const { pins: pinLayer, extra } = layers.current;
    if (!leaflet || !m || !pinLayer || !extra) return;
    const p = latest.current;
    pinLayer.clearLayers();
    extra.clearLayers();
    const brand = getComputedStyle(document.documentElement).getPropertyValue("--brand-base").trim() || "#3358ff";

    if (p.area?.length) {
      if (p.area.length >= 3) leaflet.polygon(p.area.map((a) => [a.lat, a.lng] as [number, number]), { color: brand, weight: 2, fillOpacity: 0.08 }).addTo(extra);
      else leaflet.polyline(p.area.map((a) => [a.lat, a.lng] as [number, number]), { color: brand, weight: 2, dashArray: "4 4" }).addTo(extra);
      if (p.mode === "draw") {
        p.area.forEach((a, i) => {
          const v = leaflet.marker([a.lat, a.lng], { draggable: true, icon: leaflet.divIcon({ className: "", html: '<div class="vertex-icon"></div>', iconSize: [12, 12], iconAnchor: [6, 6] }), title: "Drag to move. Double-click to remove." }).addTo(extra);
          v.on("dragend", () => {
            const ll = v.getLatLng();
            const next = [...(latest.current.area ?? [])];
            next[i] = { lat: +ll.lat.toFixed(7), lng: +ll.lng.toFixed(7) };
            latest.current.onAreaChange?.(next);
          });
          v.on("dblclick", (e) => {
            leaflet.DomEvent.stop(e);
            latest.current.onAreaChange?.((latest.current.area ?? []).filter((_, j) => j !== i));
          });
        });
      }
    }

    for (const d of p.preview ?? []) {
      leaflet.marker([d.lat, d.lng], { interactive: false, icon: leaflet.divIcon({ className: "", html: '<div class="preview-dot"></div>', iconSize: [8, 8], iconAnchor: [4, 4] }) }).addTo(extra);
    }

    const bizPoint = p.mode === "center" ? p.center : p.business;
    if (bizPoint) {
      const bm = leaflet.marker([bizPoint.lat, bizPoint.lng], {
        draggable: p.mode === "center",
        // On a results map the business sits under the pins so the center pin stays clickable.
        interactive: p.mode === "center",
        zIndexOffset: p.mode === "center" ? 1000 : -1000,
        icon: leaflet.divIcon({ className: "", html: '<div class="biz-icon"></div>', iconSize: [18, 18], iconAnchor: [9, 9] }),
        title: p.mode === "center" ? "Drag to move the grid center" : "Business location",
      }).addTo(extra);
      if (p.mode === "center") bm.on("dragend", () => {
        const ll = bm.getLatLng();
        latest.current.onCenterChange?.({ lat: +ll.lat.toFixed(7), lng: +ll.lng.toFixed(7) });
      });
    }

    // Pixels between neighboring pins at this zoom. Under 30, labels would overlap: draw dots.
    const mpp = (40_075_016.686 * Math.cos((p.center.lat * Math.PI) / 180)) / 2 ** (m.getZoom() + 8);
    const dense = p.spacingM ? p.spacingM / mpp < 30 : false;
    const size = dense ? 12 : 28;
    for (const pin of p.pins ?? []) {
      const sel = p.selected === pin.idx ? " sel" : "";
      const mk = leaflet.marker([pin.lat, pin.lng], {
        keyboard: true,
        title: pin.title ?? pin.label,
        icon: leaflet.divIcon({ className: "", html: `<div class="pin-icon ${pin.cls}${sel}${dense ? " dot" : ""}">${dense ? "" : pin.label}</div>`, iconSize: [size, size], iconAnchor: [size / 2, size / 2] }),
      }).addTo(pinLayer);
      mk.on("click", () => latest.current.onPinClick?.(pin.idx));
    }

    if (!fitted.current) {
      const pts: [number, number][] = [...(p.pins ?? []), ...(p.preview ?? []), ...(p.area ?? [])].map((x) => [x.lat, x.lng]);
      if (pts.length > 1) {
        m.fitBounds(leaflet.latLngBounds(pts), { padding: [32, 32], maxZoom: 16 });
        fitted.current = true;
      }
    }
  }

  useEffect(() => {
    // A new grid (size, spacing or shape) refits the view once.
    fitted.current = false;
  }, [props.preview?.length, props.pins?.length]);

  useEffect(() => {
    draw();
  });

  return <div ref={el} className={`map ${props.className ?? ""}`} role="region" aria-label={props.label ?? "Map"} tabIndex={0} />;
}
