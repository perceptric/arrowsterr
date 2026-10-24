// What the scan screen, the free result and the white-label report all read.

import { pool, rows, row } from "./db.ts";
import type { LatLng, ScanConfig } from "./geo.ts";
import type { Listing, OrganicItem } from "./match.ts";
import type { Summary } from "./metrics.ts";
import { scanPins, type ScanRow } from "./scans.ts";

export type ViewPin = {
  idx: number;
  row: number;
  col: number;
  lat: number;
  lng: number;
  maps: number | null;
  pack: number | null;
  organic: number | null;
  mapsDone: boolean;
  organicDone: boolean;
  failed: boolean;
  rechecked: boolean;
  firstRank: number | null;
  prev?: number | null;
  mapsTop: Listing[];
  packTop: Listing[];
  organicTop: OrganicItem[];
};

export type ViewScan = {
  id: string;
  keyword: string;
  status: ScanRow["status"];
  target: ScanRow["target"] & LatLng;
  config: ScanConfig;
  summary: Summary | null;
  pinsTotal: number;
  demo: boolean;
  shareToken: string | null;
  businessId: string | null;
  scheduleId: string | null;
  createdAt: string;
  finishedAt: string | null;
  error: string | null;
  prev: { id: string; createdAt: string; summary: Summary | null } | null;
  history: { id: string; createdAt: string; avg: number | null; top3: number; pins: number }[];
};

export async function loadView(scan: ScanRow, opts: { withPrevPins?: boolean } = {}): Promise<{ scan: ViewScan; pins: ViewPin[] }> {
  const p = pool();
  const pins = await scanPins(p, scan.id);
  const prev = scan.prev_scan_id ? await row<{ id: string; created_at: Date; summary: Summary | null }>("select id, created_at, summary from scans where id = $1", [scan.prev_scan_id]) : null;
  const prevRanks = new Map<number, number | null>();
  if (prev && opts.withPrevPins !== false) {
    for (const r of await rows<{ idx: number; maps_rank: number | null }>("select idx, maps_rank from pins where scan_id = $1 and maps_state = 'done'", [prev.id])) prevRanks.set(r.idx, r.maps_rank);
  }
  const history = scan.business_id
    ? await rows<{ id: string; created_at: Date; summary: Summary | null }>(
        `select id, created_at, summary from scans where business_id = $1 and lower(keyword) = lower($2) and config = $3::jsonb and status in ('done', 'partial')
         and created_at <= $4 order by created_at desc limit 24`,
        [scan.business_id, scan.keyword, JSON.stringify(scan.config), scan.created_at],
      )
    : [];
  return {
    scan: {
      id: scan.id,
      keyword: scan.keyword,
      status: scan.status,
      target: scan.target,
      config: scan.config,
      summary: scan.summary,
      pinsTotal: scan.pins_total,
      demo: scan.demo,
      shareToken: scan.share_token,
      businessId: scan.business_id,
      scheduleId: scan.schedule_id,
      createdAt: new Date(scan.created_at).toISOString(),
      finishedAt: scan.finished_at ? new Date(scan.finished_at).toISOString() : null,
      error: scan.error,
      prev: prev ? { id: prev.id, createdAt: prev.created_at.toISOString(), summary: prev.summary } : null,
      history: history
        .reverse()
        .map((h) => ({ id: h.id, createdAt: h.created_at.toISOString(), avg: h.summary?.maps.avg_all ?? null, top3: h.summary?.maps.top3 ?? 0, pins: h.summary?.pins ?? 0 })),
    },
    pins: pins.map((x) => ({
      idx: x.idx,
      row: x.row_i,
      col: x.col_i,
      lat: x.lat,
      lng: x.lng,
      maps: x.maps_rank,
      pack: x.pack_rank,
      organic: x.organic_rank,
      mapsDone: x.maps_state === "done",
      organicDone: x.organic_state === "done",
      failed: x.maps_state === "failed",
      rechecked: x.maps_rechecked,
      firstRank: x.maps_first_rank,
      ...(prevRanks.has(x.idx) ? { prev: prevRanks.get(x.idx)! } : {}),
      mapsTop: x.maps_top ?? [],
      packTop: x.pack_top ?? [],
      organicTop: x.organic_top ?? [],
    })),
  };
}

export async function scanById(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  return row<ScanRow>("select * from scans where id = $1", [id]);
}

export async function scanByToken(token: string) {
  if (!/^[A-Za-z0-9_-]{10,64}$/.test(token)) return null;
  return row<ScanRow>("select * from scans where share_token = $1", [token]);
}
