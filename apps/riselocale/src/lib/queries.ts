import "server-only";
import { rows, row } from "./db";
import type { ScanRow } from "./scans";

export type Business = {
  id: string;
  name: string;
  address: string;
  domain: string;
  category: string;
  cid: string;
  place_id: string;
  lat: number;
  lng: number;
  rating: number | null;
  reviews: number | null;
  archived: boolean;
  created_at: Date;
};
export type ScanListRow = ScanRow & { business_name: string | null };
export type ScheduleRow = { id: string; business_id: string; keyword: string; config: ScanRow["config"]; frequency: string; next_run_at: Date; active: boolean; report_to: string[]; business_name: string };
export type AlertRow = { id: string; kind: string; message: string; scan_id: string | null; business_name: string | null; read_at: Date | null; created_at: Date };

export function recentScans(workspaceId: string, kind: "all" | "once" | "recurring", opts: { businessId?: string; limit?: number } = {}) {
  return rows<ScanListRow>(
    `select s.*, b.name as business_name from scans s left join businesses b on b.id = s.business_id
     where s.workspace_id = $1 and ($3::uuid is null or s.business_id = $3)
     ${kind === "once" ? "and s.schedule_id is null" : kind === "recurring" ? "and s.schedule_id is not null" : ""}
     order by s.created_at desc limit $2`,
    [workspaceId, opts.limit ?? 50, opts.businessId ?? null],
  );
}

export function businesses(workspaceId: string, archived = false) {
  return rows<Business & { scans: number; last_scan: Date | null }>(
    `select b.*, (select count(*)::int from scans s where s.business_id = b.id) as scans, (select max(created_at) from scans s where s.business_id = b.id) as last_scan
     from businesses b where b.workspace_id = $1 and b.archived = $2 order by b.created_at desc`,
    [workspaceId, archived],
  );
}

export function business(workspaceId: string, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return Promise.resolve(null);
  return row<Business>("select * from businesses where id = $1 and workspace_id = $2", [id, workspaceId]);
}

export function schedules(workspaceId: string, businessId?: string) {
  return rows<ScheduleRow>(
    `select sc.*, b.name as business_name from schedules sc join businesses b on b.id = sc.business_id
     where sc.workspace_id = $1 and ($2::uuid is null or sc.business_id = $2) order by sc.created_at desc`,
    [workspaceId, businessId ?? null],
  );
}

export function alerts(workspaceId: string, limit = 100) {
  return rows<AlertRow>(
    `select a.id, a.kind, a.message, a.scan_id, b.name as business_name, a.read_at, a.created_at
     from alerts a left join businesses b on b.id = a.business_id where a.workspace_id = $1 order by a.created_at desc limit $2`,
    [workspaceId, limit],
  );
}

export async function unreadAlerts(workspaceId: string) {
  return (await row<{ n: number }>("select count(*)::int as n from alerts where workspace_id = $1 and read_at is null", [workspaceId]))?.n ?? 0;
}
