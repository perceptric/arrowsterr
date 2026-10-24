// Creating scans. A scan charges 1 credit per pin up front; the worker refunds pins that fail.

import { randomBytes } from "node:crypto";
import type { Queryable } from "./db.ts";
import { pinsFor, type LatLng, type ScanConfig } from "./geo.ts";
import type { Target } from "./match.ts";
import type { Summary } from "./metrics.ts";

export type ScanTarget = Target & LatLng;

export type ScanRow = {
  id: string;
  workspace_id: string | null;
  business_id: string | null;
  schedule_id: string | null;
  prev_scan_id: string | null;
  keyword: string;
  target: ScanTarget;
  config: ScanConfig;
  status: "queued" | "running" | "done" | "partial" | "failed";
  priority: number;
  pins_total: number;
  credits_charged: number;
  summary: Summary | null;
  share_token: string | null;
  demo: boolean;
  error: string | null;
  created_at: Date;
  finished_at: Date | null;
};

export class NoCredits extends Error {
  needed: number;
  left: number;
  constructor(needed: number, left: number) {
    super(`This scan needs ${needed} credits and the workspace has ${left}.`);
    this.needed = needed;
    this.left = left;
  }
}

export const newToken = () => randomBytes(18).toString("base64url");

export type NewScan = {
  workspaceId: string | null;
  businessId: string | null;
  scheduleId?: string | null;
  keyword: string;
  target: ScanTarget;
  config: ScanConfig;
  priority: 1 | 2;
  demo: boolean;
  freeEmail?: string;
  freeIp?: string;
};

/** Insert a scan and its pins. Run inside a transaction: the credit charge and the pins go together. */
export async function createScan(c: Queryable, s: NewScan): Promise<string> {
  const keyword = s.keyword.trim().replace(/\s+/g, " ");
  if (keyword.length < 2 || keyword.length > 120) throw new Error("Enter a keyword between 2 and 120 characters.");
  const pins = pinsFor(s.config);
  let charged = 0;
  if (s.workspaceId) {
    const res = await c.query<{ credits: number }>("update workspaces set credits = credits - $2 where id = $1 and credits >= $2 returning credits", [s.workspaceId, pins.length]);
    if (!res.rows.length) {
      const left = (await c.query<{ credits: number }>("select credits from workspaces where id = $1", [s.workspaceId])).rows[0]?.credits ?? 0;
      throw new NoCredits(pins.length, left);
    }
    charged = pins.length;
  }
  const prev =
    s.workspaceId && s.businessId
      ? (
          await c.query<{ id: string }>(
            `select id from scans where workspace_id = $1 and business_id = $2 and lower(keyword) = lower($3) and config = $4::jsonb
             and status in ('done', 'partial') order by created_at desc limit 1`,
            [s.workspaceId, s.businessId, keyword, JSON.stringify(s.config)],
          )
        ).rows[0]?.id ?? null
      : null;
  const scan = await c.query<{ id: string }>(
    `insert into scans (workspace_id, business_id, schedule_id, prev_scan_id, keyword, target, config, priority, pins_total, credits_charged, share_token, demo, free_email, free_ip)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) returning id`,
    [s.workspaceId, s.businessId, s.scheduleId ?? null, prev, keyword, JSON.stringify(s.target), JSON.stringify(s.config), s.priority, pins.length, charged, newToken(), s.demo, s.freeEmail ?? null, s.freeIp ?? null],
  );
  const id = scan.rows[0].id;
  await c.query(
    `insert into pins (scan_id, idx, row_i, col_i, lat, lng)
     select $1, i - 1, r, k, la, ln from unnest($2::int[], $3::int[], $4::float8[], $5::float8[]) with ordinality as t(r, k, la, ln, i)`,
    [id, pins.map((p) => p.row), pins.map((p) => p.col), pins.map((p) => p.lat), pins.map((p) => p.lng)],
  );
  return id;
}

export type PinRow = {
  id: string;
  idx: number;
  row_i: number;
  col_i: number;
  lat: number;
  lng: number;
  maps_state: string;
  organic_state: string;
  maps_rank: number | null;
  maps_first_rank: number | null;
  maps_rechecked: boolean;
  pack_rank: number | null;
  organic_rank: number | null;
  maps_top: import("./match.ts").Listing[] | null;
  pack_top: import("./match.ts").Listing[] | null;
  organic_top: import("./match.ts").OrganicItem[] | null;
};

export async function scanPins(c: Queryable, scanId: string): Promise<PinRow[]> {
  return (
    await c.query<PinRow>(
      `select id, idx, row_i, col_i, lat, lng, maps_state, organic_state, maps_rank, maps_first_rank, maps_rechecked, pack_rank, organic_rank, maps_top, pack_top, organic_top
       from pins where scan_id = $1 order by idx`,
      [scanId],
    )
  ).rows;
}

export const toResults = (pins: PinRow[]) =>
  pins.map((p) => ({
    idx: p.idx,
    maps_rank: p.maps_rank,
    pack_rank: p.pack_rank,
    organic_rank: p.organic_rank,
    maps_top: p.maps_top,
    maps_done: p.maps_state === "done",
    organic_done: p.organic_state === "done",
  }));

/** Advance a schedule's next run past now, keeping its time of day. */
export function nextRun(from: Date, frequency: "daily" | "weekly" | "monthly", now: Date): Date {
  const d = new Date(from);
  do {
    if (frequency === "daily") d.setUTCDate(d.getUTCDate() + 1);
    else if (frequency === "weekly") d.setUTCDate(d.getUTCDate() + 7);
    else d.setUTCMonth(d.getUTCMonth() + 1);
  } while (d <= now);
  return d;
}
