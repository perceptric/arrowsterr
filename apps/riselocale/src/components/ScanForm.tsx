"use client";

import { useMemo, useState, useTransition } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { startScan } from "@/app/actions";
import { gridPoints, areaPoints, spacingForArea, MILE, MAX_SIZE, MIN_SIZE, type LatLng, type ScanConfig } from "@/lib/geo";

const MapView = dynamic(() => import("./MapView"), { ssr: false, loading: () => <div className="map" /> });

type Biz = { id: string; name: string; lat: number; lng: number };
type Freq = "once" | "daily" | "weekly" | "monthly";

export default function ScanForm({ businesses, initialBusiness, credits, start }: { businesses: Biz[]; initialBusiness: string | null; credits: number; start?: { keyword: string; config: ScanConfig } }) {
  const router = useRouter();
  const [bizId, setBizId] = useState(initialBusiness ?? businesses[0]?.id ?? "");
  const biz = businesses.find((b) => b.id === bizId) ?? null;
  const [shape, setShape] = useState<"grid" | "area">(start?.config.shape ?? "grid");
  const [size, setSize] = useState(start?.config.shape === "grid" ? start.config.size : 7);
  const [miles, setMiles] = useState(start ? Math.ceil((start.config.spacing_m / MILE) * 100) / 100 : 0.5);
  const [center, setCenter] = useState<LatLng | null>(start?.config.shape === "grid" ? start.config.center : biz ? { lat: biz.lat, lng: biz.lng } : null);
  const [area, setArea] = useState<LatLng[]>(start?.config.shape === "area" ? start.config.area : []);
  const [keyword, setKeyword] = useState(start?.keyword ?? "");
  const [freq, setFreq] = useState<Freq>("once");
  const [reportTo, setReportTo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const spacing = Math.round(miles * MILE);
  const keywords = keyword.split(/\n|,/).map((k) => k.trim()).filter(Boolean);
  const preview = useMemo(() => {
    try {
      if (shape === "grid") return center ? { pins: gridPoints(center, size, spacing), error: null } : { pins: [], error: "Pick a center on the map." };
      if (area.length < 3) return { pins: [], error: "Click the map to draw the service area (3 points or more)." };
      return { pins: areaPoints(area, spacing), error: null };
    } catch (e) {
      return { pins: [], error: (e as Error).message };
    }
  }, [shape, center, size, spacing, area]);

  const needed = preview.pins.length * Math.max(keywords.length, 1);

  function pickBiz(id: string) {
    setBizId(id);
    const b = businesses.find((x) => x.id === id);
    if (b) setCenter({ lat: b.lat, lng: b.lng });
  }

  function submit() {
    setError(null);
    if (!biz) return setError("Pick a business first.");
    if (!keywords.length) return setError("Enter a keyword.");
    if (preview.error) return setError(preview.error);
    const config: ScanConfig = shape === "grid" ? { shape, size, spacing_m: spacing, center: center! } : { shape, spacing_m: spacing, area };
    startTransition(async () => {
      const res = await startScan({ businessId: biz.id, keyword, config, frequency: freq, reportTo });
      if (res.error) setError(res.error);
      else if (res.id) router.push(`/app/scans/${res.id}`);
    });
  }

  if (!businesses.length) {
    return (
      <div className="panel empty">
        <h2>Add a business first</h2>
        <p className="small muted">Scans track where one business ranks.</p>
        <a className="rl-btn rl-btn--primary" href="/app/businesses/new">
          Add a business
        </a>
      </div>
    );
  }

  return (
    <div className="form-grid">
      <div className="form">
        <div className="rl-field">
          <label>Business</label>
          <ul className="results">
            {businesses.slice(0, 8).map((b) => (
              <li key={b.id}>
                <button type="button" aria-pressed={b.id === bizId} onClick={() => pickBiz(b.id)}>
                  {b.name}
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="rl-field">
          <label htmlFor="kw">Keywords</label>
          <textarea id="kw" className="rl-input" value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder={"pizza delivery near me\nbest pizza downtown"} />
          <span className="hint">One per line, up to 10. Each keyword is its own scan.</span>
        </div>

        <div className="rl-field">
          <label>Area</label>
          <div className="tabs" role="group" aria-label="Scan shape">
            <button type="button" aria-pressed={shape === "grid"} onClick={() => setShape("grid")}>
              Grid
            </button>
            <button type="button" aria-pressed={shape === "area"} onClick={() => setShape("area")}>
              Service area
            </button>
          </div>
        </div>

        {shape === "grid" && (
          <div className="rl-field">
            <label htmlFor="size">
              Grid size <span className="mono">{size}×{size}</span>
            </label>
            <input id="size" type="range" min={MIN_SIZE} max={MAX_SIZE} step={2} value={size} onChange={(e) => setSize(Number(e.target.value))} />
            <span className="hint">Drag the blue dot or click the map to move the center.</span>
          </div>
        )}
        {shape === "area" && (
          <div className="actions">
            <button type="button" className="rl-btn rl-btn--secondary rl-btn--sm" onClick={() => setArea([])} disabled={!area.length}>
              Clear area
            </button>
            <button type="button" className="rl-btn rl-btn--secondary rl-btn--sm" onClick={() => area.length >= 3 && setMiles(Math.ceil((spacingForArea(area) / MILE) * 100) / 100)} disabled={area.length < 3}>
              Fit to 441 pins
            </button>
            <span className="hint">Click to add points. Drag a point to move it, double-click to remove it.</span>
          </div>
        )}

        <div className="rl-field">
          <label htmlFor="sp">Distance between pins (miles)</label>
          <input id="sp" className="rl-input" type="number" min={0.07} max={9.9} step={0.05} value={miles} onChange={(e) => setMiles(Number(e.target.value))} />
        </div>

        <div className="rl-field">
          <label>Run</label>
          <div className="tabs" role="group" aria-label="How often">
            {(["once", "daily", "weekly", "monthly"] as Freq[]).map((f) => (
              <button key={f} type="button" aria-pressed={freq === f} onClick={() => setFreq(f)}>
                {f === "once" ? "Once" : f[0].toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
          {freq !== "once" && <span className="hint">Runs now, then {freq}. You get an alert when ranks drop.</span>}
        </div>

        {freq !== "once" && (
          <div className="rl-field">
            <label htmlFor="rt">Email the report to</label>
            <input id="rt" className="rl-input" value={reportTo} onChange={(e) => setReportTo(e.target.value)} placeholder="client@business.com" />
            <span className="hint">Optional. They get your white-label report after each run.</span>
          </div>
        )}

        <div className="panel panel-body small" style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
          <span>
            {preview.pins.length} pins{keywords.length > 1 ? ` × ${keywords.length} keywords` : ""}
          </span>
          <span className="mono">
            {needed} of {credits} credits
          </span>
        </div>
        {(error || preview.error) && <p className="error">{error ?? preview.error}</p>}
        <div>
          <button type="button" className="rl-btn rl-btn--primary" onClick={submit} disabled={pending || !!preview.error || needed > credits}>
            {pending ? "Starting…" : freq === "once" ? "Run scan" : "Run and schedule"}
          </button>
        </div>
      </div>

      <MapView
        center={center ?? (biz ? { lat: biz.lat, lng: biz.lng } : { lat: 41.8781, lng: -87.6298 })}
        business={biz ? { lat: biz.lat, lng: biz.lng } : null}
        mode={shape === "grid" ? "center" : "draw"}
        preview={preview.pins}
        area={shape === "area" ? area : undefined}
        onCenterChange={setCenter}
        onAreaChange={setArea}
        label="Scan area"
      />
    </div>
  );
}
