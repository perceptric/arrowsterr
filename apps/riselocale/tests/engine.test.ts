// The worker against a real Postgres (TEST_DATABASE_URL), with a scripted provider that can be flaky.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { tick } from "../src/lib/engine.ts";
import { createScan, NoCredits, scanPins } from "../src/lib/scans.ts";
import type { Fetched, Kind, Provider, TaskSpec } from "../src/lib/provider.ts";
import type { Listing } from "../src/lib/match.ts";
import type { ScanConfig } from "../src/lib/geo.ts";

const url = process.env.TEST_DATABASE_URL;
const skip = url ? false : "Set TEST_DATABASE_URL to run the worker tests.";
let db: pg.Pool;
const fast = { firstPollMs: 0, pollEveryMs: 0 };

const L = (rank: number, o: Partial<Listing> = {}): Listing => ({ rank, title: `Biz ${rank}`, domain: "", cid: `c${rank}`, place_id: "", rating: 4, reviews: 10, category: "", address: "", lat: null, lng: null, ...o });
const target = { name: "Joe's Pizza", domain: "joes.com", cid: "JOE", place_id: "", lat: 41.88, lng: -87.63 };
const config: ScanConfig = { shape: "grid", size: 3, spacing_m: 1000, center: { lat: 41.88, lng: -87.63 } };

/** Maps list with the business at `rank` (null: not listed). */
function mapsWith(rank: number | null): Listing[] {
  return Array.from({ length: 20 }, (_, i) => (rank === i + 1 ? L(i + 1, { title: "Joe's Pizza", cid: "JOE" }) : L(i + 1)));
}

/** A provider whose answers come from a function of (kind, pin idx, how many times this pin was posted). */
function scripted(answer: (kind: Kind, idx: number, n: number) => Fetched | "post-error"): Provider & { posts: number } {
  const counts = new Map<string, number>();
  const idxOf = new Map<string, number>();
  const self = {
    name: "demo" as const,
    posts: 0,
    async post(kind: Kind, specs: TaskSpec[]) {
      const ids = await db.query<{ id: string; idx: number }>("select id, idx from pins where id = any($1::bigint[])", [specs.map((s) => s.tag.split(":")[0])]);
      for (const r of ids.rows) idxOf.set(r.id, r.idx);
      return specs.map((s) => {
        const n = (counts.get(s.tag) ?? 0) + 1;
        counts.set(s.tag, n);
        self.posts++;
        const pinId = s.tag.split(":")[0];
        if (answer(kind, idxOf.get(pinId)!, n) === "post-error") return { error: "Invalid Field" };
        return { id: `${s.tag}#${n}` };
      });
    },
    async get(kind: Kind, id: string): Promise<Fetched> {
      const [tag, n] = id.split("#");
      const a = answer(kind, idxOf.get(tag.split(":")[0])!, Number(n));
      return a === "post-error" ? { state: "failed", error: "x" } : a;
    },
    async search() {
      return [];
    },
  };
  return self;
}

const organicDone = (): Fetched => ({ state: "done", pack: [L(1, { cid: "JOE", title: "Joe's Pizza" })], organic: [{ rank: 2, domain: "joes.com", url: "", title: "" }] });

async function runUntilDone(p: Provider, scanId: string, max = 12) {
  for (let i = 0; i < max; i++) {
    await tick(db, p, new Date(), fast);
    const s = (await db.query("select status from scans where id = $1", [scanId])).rows[0];
    if (!["queued", "running"].includes(s.status)) return s.status as string;
  }
  throw new Error("scan did not finish");
}

let ws: string;
let biz: string;

before(async () => {
  if (!url) return;
  db = new pg.Pool({ connectionString: url });
  await db.query("truncate users, workspaces, businesses, schedules, scans, pins, alerts, sessions, members cascade");
  ws = (await db.query("insert into workspaces (name, credits, monthly_credits) values ('Test', 30, 10000) returning id")).rows[0].id;
  biz = (await db.query("insert into businesses (workspace_id, name, domain, cid, lat, lng) values ($1, $2, $3, $4, $5, $6) returning id", [ws, target.name, target.domain, target.cid, target.lat, target.lng])).rows[0].id;
});
after(async () => db && db.end());

async function newScan(scheduleId: string | null = null) {
  const c = await db.connect();
  try {
    await c.query("begin");
    const id = await createScan(c, { workspaceId: ws, businessId: biz, scheduleId, keyword: "pizza near me", target, config, priority: 1, demo: true });
    await c.query("commit");
    return id;
  } catch (e) {
    await c.query("rollback");
    throw e;
  } finally {
    c.release();
  }
}

test("a scan charges credits, runs every pin and summarizes", { skip }, async () => {
  const p = scripted((kind) => (kind === "maps" ? { state: "done", maps: mapsWith(3) } : organicDone()));
  const id = await newScan();
  assert.equal((await db.query("select credits from workspaces where id = $1", [ws])).rows[0].credits, 21);
  assert.equal(await runUntilDone(p, id), "done");
  const s = (await db.query("select summary from scans where id = $1", [id])).rows[0].summary;
  assert.equal(s.maps.avg_all, 3);
  assert.equal(s.maps.top3, 9);
  assert.equal(s.pack.in_pack, 9);
  assert.equal(s.organic.avg_found, 2);
});

test("a flaky jump is searched again and the second answer is kept", { skip }, async () => {
  // Pin 4 answers 15 the first time (a bad read), then 4. Pin 0 truly drops to 15 both times.
  const p = scripted((kind, idx, n) => {
    if (kind === "organic") return organicDone();
    if (idx === 4) return { state: "done", maps: mapsWith(n === 1 ? 15 : 4) };
    if (idx === 0) return { state: "done", maps: mapsWith(15) };
    return { state: "done", maps: mapsWith(3) };
  });
  const id = await newScan();
  assert.ok((await db.query("select prev_scan_id from scans where id = $1", [id])).rows[0].prev_scan_id, "compared with the last scan");
  assert.equal(await runUntilDone(p, id), "done");
  const pins = await scanPins(db, id);
  assert.deepEqual([pins[4].maps_first_rank, pins[4].maps_rank, pins[4].maps_rechecked], [15, 4, true]);
  assert.deepEqual([pins[0].maps_first_rank, pins[0].maps_rank, pins[0].maps_rechecked], [15, 15, true]);
  assert.deepEqual([pins[1].maps_rank, pins[1].maps_rechecked], [3, false]);
  assert.equal(p.posts, 9 + 2 + 9, "9 maps + 2 rechecks + 9 organic");
});

test("a search that keeps failing ends as a failed pin, a partial scan and a refund", { skip }, async () => {
  const before = (await db.query("select credits from workspaces where id = $1", [ws])).rows[0].credits;
  const p = scripted((kind, idx) => (kind === "maps" && idx === 8 ? "post-error" : kind === "maps" ? { state: "done", maps: mapsWith(3) } : organicDone()));
  const id = await newScan();
  assert.equal(await runUntilDone(p, id), "partial");
  const pins = await scanPins(db, id);
  assert.equal(pins[8].maps_state, "failed");
  assert.equal((await db.query("select credits from workspaces where id = $1", [ws])).rows[0].credits, before - 9 + 1);
  const s = (await db.query("select summary from scans where id = $1", [id])).rows[0].summary;
  assert.equal(s.maps.done, 8, "the failed pin is left out of the averages");
});

test("a scan with too few credits is refused and charges nothing", { skip }, async () => {
  await db.query("update workspaces set credits = 5 where id = $1", [ws]);
  await assert.rejects(newScan(), NoCredits);
  assert.equal((await db.query("select credits from workspaces where id = $1", [ws])).rows[0].credits, 5);
  await db.query("update workspaces set credits = 100 where id = $1", [ws]);
});

test("a due schedule starts a scan once and a drop raises alerts", { skip }, async () => {
  const sched = (await db.query("insert into schedules (workspace_id, business_id, keyword, config, frequency, next_run_at) values ($1, $2, 'pizza near me', $3, 'daily', now() - interval '1 minute') returning id", [ws, biz, JSON.stringify(config)])).rows[0].id;
  const good = scripted((kind) => (kind === "maps" ? { state: "done", maps: mapsWith(2) } : organicDone()));
  await tick(db, good, new Date(), fast);
  await tick(db, good, new Date(), fast);
  const first = await db.query("select id, status from scans where schedule_id = $1", [sched]);
  assert.equal(first.rowCount, 1, "one scan per due run");
  const next = (await db.query("select next_run_at from schedules where id = $1", [sched])).rows[0].next_run_at as Date;
  assert.ok(next.getTime() > Date.now());
  for (let i = 0; i < 6; i++) await tick(db, good, new Date(), fast);
  // Run again now, worse everywhere and out of the pack (both reads agree, so the rechecks keep it).
  await db.query("update schedules set next_run_at = now() - interval '1 second' where id = $1", [sched]);
  const bad = scripted((kind) => (kind === "maps" ? { state: "done", maps: mapsWith(12) } : { state: "done", pack: [], organic: [] }));
  for (let i = 0; i < 10; i++) await tick(db, bad, new Date(), fast);
  const scans = await db.query("select status from scans where schedule_id = $1 order by created_at", [sched]);
  assert.deepEqual(scans.rows.map((r) => r.status), ["done", "done"]);
  const kinds = (await db.query("select kind from alerts where workspace_id = $1 and scan_id is not null order by kind", [ws])).rows.map((r) => r.kind);
  assert.deepEqual(kinds, ["avg_drop", "pack_lost", "top3_lost"]);
});

test("two ticks at once never both run", { skip }, async () => {
  const p = scripted((kind) => (kind === "maps" ? { state: "done", maps: mapsWith(1) } : organicDone()));
  await newScan();
  const [a, b] = await Promise.all([tick(db, p, new Date(), fast), tick(db, p, new Date(), fast)]);
  assert.ok(a.skipped !== b.skipped, "one tick skipped");
});
