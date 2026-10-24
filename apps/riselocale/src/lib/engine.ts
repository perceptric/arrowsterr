// The worker. One tick: start due schedules, reset monthly credits, post new searches, collect
// finished ones and close scans. Ticks never overlap: each holds a Postgres advisory lock.

import type pg from "pg";
import { needsRecheck, alertsFor } from "./compare.ts";
import { appUrl, sendEmail } from "./email.ts";
import { zoomFor } from "./geo.ts";
import { findRank, organicRank } from "./match.ts";
import { summarize, type Summary } from "./metrics.ts";
import { MAX_ATTEMPTS, STALE_MS, type Kind, type Provider, type TaskSpec } from "./provider.ts";
import { createScan, NoCredits, nextRun, scanPins, toResults, type ScanRow } from "./scans.ts";
import type { Queryable } from "./db.ts";

const LOCK = 7_203_119;
/** Wait this long after posting before the first check, and between checks of one search. */
export const timing = { firstPollMs: 20_000, pollEveryMs: 15_000 };

type OpenPin = {
  id: string;
  scan_id: string;
  idx: number;
  lat: number;
  lng: number;
  maps_state: string;
  organic_state: string;
  maps_task: string | null;
  organic_task: string | null;
  maps_posted_at: Date | null;
  organic_posted_at: Date | null;
  maps_attempts: number;
  organic_attempts: number;
  maps_rechecked: boolean;
  keyword: string;
  target: ScanRow["target"];
  config: ScanRow["config"];
  priority: number;
  prev_scan_id: string | null;
};

const PIN_COLS = `p.id, p.scan_id, p.idx, p.lat, p.lng, p.maps_state, p.organic_state, p.maps_task, p.organic_task, p.maps_posted_at, p.organic_posted_at,
  p.maps_attempts, p.organic_attempts, p.maps_rechecked, s.keyword, s.target, s.config, s.priority, s.prev_scan_id`;

export async function tick(p: pg.Pool, provider: Provider, now = new Date(), opts: { firstPollMs?: number; pollEveryMs?: number } = {}) {
  const lockClient = await p.connect();
  try {
    const { rows } = await lockClient.query<{ ok: boolean }>("select pg_try_advisory_lock($1) as ok", [LOCK]);
    if (!rows[0].ok) return { skipped: true };
    try {
      const started = await runSchedules(p, provider, now);
      await p.query("update workspaces set credits = monthly_credits, credits_reset_at = credits_reset_at + interval '1 month' where credits_reset_at <= $1", [now]);
      await p.query(
        `update pins set maps_state = case when maps_state in ('new', 'posted') then 'failed' else maps_state end,
         organic_state = case when organic_state in ('new', 'posted') then 'failed' else organic_state end,
         error = coalesce(error, 'The search timed out.')
         where scan_id in (select id from scans where status in ('queued', 'running') and created_at < $1::timestamptz - interval '3 hours')
         and (maps_state in ('new', 'posted') or organic_state in ('new', 'posted'))`,
        [now],
      );
      const posted = (await postNew(p, provider, "maps")) + (await postNew(p, provider, "organic"));
      const collected = await collect(p, provider, now, { ...timing, ...opts });
      const closed = await finalize(p, now);
      return { skipped: false, started, posted, collected, closed };
    } finally {
      await lockClient.query("select pg_advisory_unlock($1)", [LOCK]);
    }
  } finally {
    lockClient.release();
  }
}

async function runSchedules(p: pg.Pool, provider: Provider, now: Date) {
  type Due = { id: string; workspace_id: string; business_id: string; keyword: string; config: ScanRow["config"]; frequency: "daily" | "weekly" | "monthly"; next_run_at: Date; name: string; domain: string; cid: string; place_id: string; lat: number; lng: number };
  const due = (
    await p.query<Due>(
      `select sc.id, sc.workspace_id, sc.business_id, sc.keyword, sc.config, sc.frequency, sc.next_run_at, b.name, b.domain, b.cid, b.place_id, b.lat, b.lng
       from schedules sc join businesses b on b.id = sc.business_id
       where sc.active and not b.archived and sc.next_run_at <= $1 order by sc.next_run_at limit 20`,
      [now],
    )
  ).rows;
  let started = 0;
  for (const d of due) {
    const c = await p.connect();
    try {
      await c.query("begin");
      const claimed = await c.query("update schedules set next_run_at = $2 where id = $1 and next_run_at <= $3 returning id", [d.id, nextRun(d.next_run_at, d.frequency, now), now]);
      if (claimed.rowCount) {
        await c.query("savepoint s");
        try {
          await createScan(c, {
            workspaceId: d.workspace_id,
            businessId: d.business_id,
            scheduleId: d.id,
            keyword: d.keyword,
            target: { name: d.name, domain: d.domain, cid: d.cid, place_id: d.place_id, lat: d.lat, lng: d.lng },
            config: d.config,
            priority: 1,
            demo: provider.name === "demo",
          });
          started++;
        } catch (e) {
          await c.query("rollback to savepoint s");
          const message = e instanceof NoCredits ? `A scheduled scan for "${d.keyword}" didn't run. ${e.message}` : `A scheduled scan for "${d.keyword}" didn't run: ${(e as Error).message}`;
          await c.query("insert into alerts (workspace_id, business_id, kind, message) values ($1, $2, 'schedule_skipped', $3)", [d.workspace_id, d.business_id, message]);
        }
      }
      await c.query("commit");
    } catch (e) {
      await c.query("rollback").catch(() => {});
      throw e;
    } finally {
      c.release();
    }
  }
  return started;
}

function spec(pin: OpenPin, kind: Kind): TaskSpec {
  const t = pin.target;
  return {
    tag: `${pin.id}:${kind}`,
    keyword: pin.keyword,
    lat: pin.lat,
    lng: pin.lng,
    zoom: zoomFor(pin.config.spacing_m),
    priority: pin.priority === 2 ? 2 : 1,
    target: { name: t.name, domain: t.domain, cid: t.cid, lat: t.lat, lng: t.lng },
  };
}

async function postNew(p: pg.Pool, provider: Provider, kind: Kind) {
  const pins = (
    await p.query<OpenPin>(
      `select ${PIN_COLS} from pins p join scans s on s.id = p.scan_id
       where p.${kind}_state = 'new' and s.status in ('queued', 'running') order by s.priority desc, s.created_at, p.idx limit 500`,
    )
  ).rows;
  if (!pins.length) return 0;
  let posted;
  try {
    posted = await provider.post(kind, pins.map((pin) => spec(pin, kind)));
  } catch (e) {
    // The whole request failed (network, login). Keep the pins and try again next tick; the
    // timeout in tick() ends scans that never get through.
    await p.query("update pins set error = $2 where id = any($1::bigint[])", [pins.map((x) => x.id), (e as Error).message]);
    return 0;
  }
  const ok = pins.flatMap((pin, i) => ("id" in posted[i] ? [{ id: pin.id, task: (posted[i] as { id: string }).id }] : []));
  const bad = pins.flatMap((pin, i) => ("error" in posted[i] ? [{ id: pin.id, error: (posted[i] as { error: string }).error }] : []));
  if (ok.length) {
    await p.query(
      `update pins set ${kind}_task = t.task, ${kind}_state = 'posted', ${kind}_posted_at = now(), ${kind}_attempts = ${kind}_attempts + 1, polled_at = null
       from unnest($1::bigint[], $2::text[]) as t(id, task) where pins.id = t.id`,
      [ok.map((x) => x.id), ok.map((x) => x.task)],
    );
    await p.query("update scans set status = 'running' where status = 'queued' and id = any($1::uuid[])", [[...new Set(pins.map((x) => x.scan_id))]]);
  }
  for (const b of bad) {
    await p.query(
      `update pins set ${kind}_attempts = ${kind}_attempts + 1, error = $2, ${kind}_state = case when ${kind}_attempts + 1 >= $3 then 'failed' else 'new' end where id = $1`,
      [b.id, b.error, MAX_ATTEMPTS],
    );
  }
  return ok.length;
}

async function collect(p: pg.Pool, provider: Provider, now: Date, t: { firstPollMs: number; pollEveryMs: number }) {
  const pins = (
    await p.query<OpenPin & { kind: Kind }>(
      `select * from (
         select ${PIN_COLS}, 'maps' as kind, p.maps_posted_at as posted_at from pins p join scans s on s.id = p.scan_id where p.maps_state = 'posted'
         union all
         select ${PIN_COLS}, 'organic' as kind, p.organic_posted_at as posted_at from pins p join scans s on s.id = p.scan_id where p.organic_state = 'posted'
       ) x
       where x.posted_at <= $1::timestamptz - make_interval(secs => $2::float8 / 1000)
       order by x.posted_at limit 400`,
      [now, t.firstPollMs],
    )
  ).rows;
  const polledRecently = new Set(
    (
      await p.query<{ id: string }>("select id from pins where id = any($1::bigint[]) and polled_at > $2::timestamptz - make_interval(secs => $3::float8 / 1000)", [
        pins.map((x) => x.id),
        now,
        t.pollEveryMs,
      ])
    ).rows.map((r) => r.id),
  );
  const todo = pins.filter((x) => !polledRecently.has(x.id));
  let collected = 0;
  const prevRanks = new Map<string, Map<number, number | null>>();
  async function prevRank(scanId: string | null, idx: number) {
    if (!scanId) return undefined;
    if (!prevRanks.has(scanId)) {
      const r = await p.query<{ idx: number; maps_rank: number | null }>("select idx, maps_rank from pins where scan_id = $1 and maps_state = 'done'", [scanId]);
      prevRanks.set(scanId, new Map(r.rows.map((x) => [x.idx, x.maps_rank])));
    }
    const m = prevRanks.get(scanId)!;
    return m.has(idx) ? m.get(idx)! : undefined;
  }

  const queue = [...todo];
  async function work() {
    for (let pin = queue.shift(); pin; pin = queue.shift()) {
      const kind = pin.kind;
      const task = kind === "maps" ? pin.maps_task : pin.organic_task;
      const postedAt = kind === "maps" ? pin.maps_posted_at : pin.organic_posted_at;
      const attempts = kind === "maps" ? pin.maps_attempts : pin.organic_attempts;
      let res;
      try {
        res = await provider.get(kind, task!);
      } catch (e) {
        await p.query("update pins set polled_at = $2, error = $3 where id = $1", [pin.id, now, (e as Error).message]);
        continue;
      }
      if (res.state === "waiting") {
        const stale = postedAt && now.getTime() - postedAt.getTime() > STALE_MS;
        if (stale) await retry(p, pin.id, kind, attempts, "The search took too long.");
        else await p.query("update pins set polled_at = $2 where id = $1", [pin.id, now]);
        continue;
      }
      if (res.state === "failed") {
        await retry(p, pin.id, kind, attempts, res.error);
        continue;
      }
      collected++;
      if (kind === "maps") {
        const rank = findRank(res.maps, pin.target);
        if (!pin.maps_rechecked && needsRecheck(await prevRank(pin.prev_scan_id, pin.idx), rank)) {
          // A big jump since the last scan: search this pin again and keep the second answer.
          await p.query("update pins set maps_first_rank = $2, maps_rechecked = true, maps_state = 'new', polled_at = null where id = $1", [pin.id, rank]);
          continue;
        }
        await p.query("update pins set maps_rank = $2, maps_top = $3, maps_state = 'done', polled_at = $4, error = null where id = $1", [pin.id, rank, JSON.stringify(res.maps ?? []), now]);
      } else {
        await p.query("update pins set pack_rank = $2, organic_rank = $3, pack_top = $4, organic_top = $5, organic_state = 'done', polled_at = $6, error = null where id = $1", [
          pin.id,
          findRank(res.pack, pin.target),
          organicRank(res.organic, pin.target.domain),
          JSON.stringify(res.pack ?? []),
          JSON.stringify(res.organic ?? []),
          now,
        ]);
      }
    }
  }
  await Promise.all(Array.from({ length: 8 }, work));
  return collected;
}

async function retry(p: Queryable, pinId: string, kind: Kind, attempts: number, error: string) {
  const state = attempts >= MAX_ATTEMPTS ? "failed" : "new";
  await p.query(`update pins set ${kind}_state = $2, error = $3, polled_at = null where id = $1`, [pinId, state, error]);
}

async function finalize(p: pg.Pool, now: Date) {
  const ready = (
    await p.query<ScanRow>(
      `select s.* from scans s where s.status in ('queued', 'running')
       and not exists (select 1 from pins x where x.scan_id = s.id and (x.maps_state in ('new', 'posted') or x.organic_state in ('new', 'posted')))
       limit 50`,
    )
  ).rows;
  for (const scan of ready) {
    const pins = await scanPins(p, scan.id);
    const summary = summarize(toResults(pins), scan.target);
    const failedMaps = pins.filter((x) => x.maps_state === "failed").length;
    const failedAny = pins.some((x) => x.maps_state === "failed" || x.organic_state === "failed");
    const status = failedMaps === pins.length ? "failed" : failedAny ? "partial" : "done";
    const refund = scan.workspace_id ? Math.min(failedMaps, scan.credits_charged) : 0;
    const closed = await p.query(
      `update scans set status = $2, summary = $3, finished_at = $4, credits_charged = credits_charged - $5,
       error = case when $2 = 'failed' then (select error from pins where scan_id = $1 and error is not null limit 1) else null end
       where id = $1 and status in ('queued', 'running') returning id`,
      [scan.id, status, JSON.stringify(summary), now, refund],
    );
    if (!closed.rowCount) continue;
    if (refund) await p.query("update workspaces set credits = credits + $2 where id = $1", [scan.workspace_id, refund]);
    if (scan.workspace_id && status !== "failed") await afterScan(p, scan, summary);
  }
  return ready.length;
}

/** Alerts for a recurring scan, and the scheduled report email. */
async function afterScan(p: pg.Pool, scan: ScanRow, summary: Summary) {
  const prev = scan.prev_scan_id ? (await p.query<{ summary: Summary | null }>("select summary from scans where id = $1", [scan.prev_scan_id])).rows[0]?.summary ?? null : null;
  const drafts = scan.schedule_id ? alertsFor(scan.keyword, prev, summary) : [];
  const ws = (await p.query<{ report_name: string; alert_emails: boolean }>("select report_name, alert_emails from workspaces where id = $1", [scan.workspace_id])).rows[0];
  for (const a of drafts) {
    await p.query("insert into alerts (workspace_id, business_id, scan_id, kind, message) values ($1, $2, $3, $4, $5)", [scan.workspace_id, scan.business_id, scan.id, a.kind, a.message]);
  }
  try {
    if (drafts.length && ws?.alert_emails) {
      const to = (
        await p.query<{ email: string }>("select u.email from members m join users u on u.id = m.user_id where m.workspace_id = $1 and m.role in ('owner', 'admin')", [scan.workspace_id])
      ).rows.map((r) => r.email);
      await sendEmail(to, `Rank alert: ${scan.target.name}`, [`${scan.target.name}, "${scan.keyword}":`, ...drafts.map((d) => d.message)], { href: `${appUrl()}/app/scans/${scan.id}`, label: "Open the scan" }, undefined, `alert-${scan.id}`);
    }
    if (scan.schedule_id) {
      const sched = (await p.query<{ report_to: string[] }>("select report_to from schedules where id = $1", [scan.schedule_id])).rows[0];
      if (sched?.report_to.length) {
        await sendEmail(
          sched.report_to,
          `${scan.target.name}: "${scan.keyword}" ranking report`,
          [`Average Maps rank ${summary.maps.avg_all ?? "-"}, top 3 at ${summary.maps.top3} of ${summary.pins} pins.`],
          { href: `${appUrl()}/r/${scan.share_token}`, label: "View the report" },
          ws?.report_name || undefined,
          `report-${scan.id}`,
        );
      }
    }
  } catch (e) {
    await p.query("insert into alerts (workspace_id, business_id, scan_id, kind, message) values ($1, $2, $3, 'email_failed', $4)", [scan.workspace_id, scan.business_id, scan.id, `An email for this scan didn't send: ${(e as Error).message}`]);
  }
}
