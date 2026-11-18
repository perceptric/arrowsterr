// The partner API (/api/partner/...) against an in-memory database: who may call it, and what each call does.
import assert from "node:assert/strict";
import { register } from "node:module";
import { test } from "node:test";
import { makeKey } from "../src/lib/apiKeys.ts";
import { fakeDb } from "./fakeDb.ts";

register(new URL("./fixtures/loader/hooks.mjs", import.meta.url));
const api = await import("../src/lib/partnerApi.ts");
const { keyAuth } = await import("../src/lib/integrations.ts");

globalThis.fetch = (() => Promise.reject(new Error("no network in tests"))) as typeof fetch;

const WS = "11111111-1111-4111-8111-111111111111"; // the partner (Morning Telos)
const WS2 = "22222222-2222-4222-8222-222222222222"; // another partner
const WS3 = "33333333-3333-4333-8333-333333333333"; // not a partner
const APP_BRAND = "dddddddd-dddd-4ddd-8ddd-dddddddddddd"; // made in the app, in the partner's workspace

const ent = async (ws: string) => ({ readOnly: false, limits: { partner: ws !== WS3, mcp: true, alerts: true } as never });

function setup() {
  const k = { p: makeKey("partner"), p2: makeKey("partner"), other: makeKey("partner"), notPartner: makeKey("partner"), rate: makeKey("partner"), live: makeKey("live"), oldBrand: makeKey("brand"), revoked: makeKey("partner") };
  const db = fakeDb({
    api_keys: [
      { id: "kp", workspace_id: WS, hash: k.p.hash, partner: true, brand_id: null },
      { id: "kp2", workspace_id: WS, hash: k.p2.hash, partner: true, brand_id: null },
      { id: "krate", workspace_id: WS, hash: k.rate.hash, partner: true, brand_id: null },
      { id: "kother", workspace_id: WS2, hash: k.other.hash, partner: true, brand_id: null },
      { id: "knot", workspace_id: WS3, hash: k.notPartner.hash, partner: true, brand_id: null },
      { id: "klive", workspace_id: WS, hash: k.live.hash, partner: false, brand_id: null },
      { id: "kold", workspace_id: WS, hash: k.oldBrand.hash, partner: false, brand_id: APP_BRAND },
      { id: "krev", workspace_id: WS, hash: k.revoked.hash, partner: true, brand_id: null, revoked_at: "2026-01-01T00:00:00Z" },
    ],
    brands: [{ id: APP_BRAND, workspace_id: WS, name: "Own Co", domain: "own.co", url: "https://own.co", prompts: [], external_id: null, created_by_key: null }],
  });
  const keys = Object.fromEntries(Object.entries(k).map(([n, v]) => [n, v.key])) as Record<keyof typeof k, string>;
  return { db, keys };
}
type World = ReturnType<typeof setup>;

const req = (key: string | null, method = "GET") => new Request("https://app.arrowsterr.com/api/partner/brands", { method, headers: key ? { authorization: `Bearer ${key}` } : {} });
const call = (w: World, key: string | null, run: (p: Parameters<Parameters<typeof api.partnerRoute>[1]>[0]) => Promise<Response>) => api.partnerRoute(req(key), run, { db: w.db as never, entitlement: ent });
const create = (w: World, key: string, body: unknown) => call(w, key, (p) => api.createBrand(p, body));
const body = async (r: Response) => (r.status === 204 ? null : ((await r.json()) as Record<string, unknown>));
const NEW = { name: "Acme Bakery", domain: "https://www.acmebakery.com/menu", external_id: "mt-ws-1" };

/** Every error is { error: { code, message } }, in plain words with no em dash. */
async function isError(r: Response, status: number, code?: string) {
  assert.equal(r.status, status);
  const b = (await r.json()) as { error: { code: string; message: string } };
  assert.equal(typeof b.error.code, "string");
  assert.equal(typeof b.error.message, "string");
  assert.ok(b.error.message.length > 0);
  assert.doesNotMatch(b.error.message, /—/);
  if (code) assert.equal(b.error.code, code);
  return b.error;
}

test("partner auth: no key, a live key, a brand key, a revoked key and a non-partner workspace are refused", async () => {
  const w = setup();
  const run = async () => Response.json({ ok: true });
  await isError(await call(w, null, run), 401, "missing_key");
  await isError(await call(w, w.keys.live, run), 401, "wrong_key");
  await isError(await call(w, w.keys.oldBrand, run), 401, "wrong_key");
  await isError(await call(w, "aw_partner_made_up", run), 401, "invalid_key");
  await isError(await call(w, w.keys.revoked, run), 401, "invalid_key");
  await isError(await call(w, w.keys.notPartner, run), 403, "not_partner");
  assert.equal((await call(w, w.keys.p, run)).status, 200);
});

test("partner auth: a partner key works only on /api/partner", async () => {
  const w = setup();
  const r = await keyAuth(w.db as never, w.keys.p, { mcp: true, brandKey: true }, ent);
  assert.ok("denied" in r && r.denied.status === 401);
});

test("create brand: 201 with the brand, then 200 with the same brand for the same external_id", async () => {
  const w = setup();
  const first = await create(w, w.keys.p, NEW);
  assert.equal(first.status, 201);
  const made = (await body(first))!;
  assert.deepEqual(Object.keys(made).sort(), ["domain", "external_id", "id", "name"]);
  assert.equal(made.name, "Acme Bakery");
  assert.equal(made.domain, "acmebakery.com");
  assert.equal(made.external_id, "mt-ws-1");
  const again = await create(w, w.keys.p, { ...NEW, name: "Acme Bakery Two" });
  assert.equal(again.status, 200);
  assert.deepEqual(await body(again), made);
  // A second partner key in the same workspace sees the same brand (keys can be rotated).
  const viaOtherKey = await create(w, w.keys.p2, NEW);
  assert.equal(viaOtherKey.status, 200);
  assert.equal((await body(viaOtherKey))!.id, made.id);
  const rows = w.db.tables.brands.filter((b) => b.external_id === "mt-ws-1");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].workspace_id, WS);
  assert.equal(rows[0].created_by_key, "kp");
  assert.equal(rows[0].url, "https://www.acmebakery.com");
  assert.match(String(rows[0].logo), /acmebakery\.com/);
  assert.deepEqual(rows[0].prompts, []);
  // Its Content Plan site is made too, like onboarding.
  assert.ok(w.db.tables.sites?.some((s) => s.brand_id === made.id));
});

test("create brand: the same external_id in another partner's workspace is a different brand", async () => {
  const w = setup();
  const a = (await body(await create(w, w.keys.p, NEW)))!;
  const b = await create(w, w.keys.other, NEW);
  assert.equal(b.status, 201);
  assert.notEqual((await body(b))!.id, a.id);
});

test("create brand: a race on the same external_id answers with the brand the first call made", async () => {
  const w = setup();
  const [x, y] = await Promise.all([create(w, w.keys.p, NEW), create(w, w.keys.p, NEW)]);
  const ids = [(await body(x))!.id, (await body(y))!.id];
  assert.equal(ids[0], ids[1]);
  assert.deepEqual([x.status, y.status].sort(), [200, 201]);
});

test("create brand: bad input is 422, a domain already in the workspace is 409", async () => {
  const w = setup();
  await isError(await create(w, w.keys.p, null), 422, "invalid");
  await isError(await create(w, w.keys.p, { ...NEW, name: " " }), 422, "invalid");
  await isError(await create(w, w.keys.p, { ...NEW, domain: "not a domain" }), 422, "invalid");
  await isError(await create(w, w.keys.p, { ...NEW, domain: "localhost" }), 422, "invalid");
  await isError(await create(w, w.keys.p, { ...NEW, external_id: "" }), 422, "invalid");
  await isError(await create(w, w.keys.p, { ...NEW, external_id: "x".repeat(201) }), 422, "invalid");
  await isError(await create(w, w.keys.p, { name: "Copy", domain: "own.co", external_id: "mt-ws-2" }), 409, "domain_taken");
});

test("brands made in the app, or in another workspace, are off limits", async () => {
  const w = setup();
  const theirs = (await body(await create(w, w.keys.other, NEW)))!.id as string;
  for (const run of [api.getBrand, api.removeBrand, api.makeBrandKey, api.revokeBrandKeys] as const) {
    await isError(await call(w, w.keys.p, (p) => run(p, APP_BRAND)), 403, "not_your_brand");
    await isError(await call(w, w.keys.p, (p) => run(p, theirs)), 404, "not_found");
    await isError(await call(w, w.keys.p, (p) => run(p, "not-a-uuid")), 404, "not_found");
    await isError(await call(w, w.keys.p, (p) => run(p, "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee")), 404, "not_found");
  }
  await isError(await call(w, w.keys.p, (p) => api.brandUsage(p, APP_BRAND, null)), 403, "not_your_brand");
  await isError(await call(w, w.keys.p, (p) => api.brandUsage(p, theirs, null)), 404, "not_found");
  assert.ok(w.db.tables.brands.some((b) => b.id === APP_BRAND), "the app's brand is still there");
  assert.ok(w.db.tables.brands.some((b) => b.id === theirs), "the other partner's brand is still there");
});

test("get brand: its fields and status", async () => {
  const w = setup();
  const id = (await body(await create(w, w.keys.p, NEW)))!.id as string;
  const got = (await body(await call(w, w.keys.p, (p) => api.getBrand(p, id))))!;
  assert.deepEqual(got, { id, name: "Acme Bakery", domain: "acmebakery.com", external_id: "mt-ws-1", status: "no_prompts", prompts: 0, last_checked_at: null });
});

test("brand keys: made once, see only their brand, and stop when revoked", async () => {
  const w = setup();
  const id = (await body(await create(w, w.keys.p, NEW)))!.id as string;
  const made = await call(w, w.keys.p, (p) => api.makeBrandKey(p, id));
  assert.equal(made.status, 201);
  const { key, prefix } = (await body(made)) as { key: string; prefix: string };
  assert.match(key, /^aw_brand_/);
  assert.equal(prefix, key.slice(0, 15));
  const row = w.db.tables.api_keys.find((k) => k.brand_id === id)!;
  assert.equal(row.workspace_id, WS);
  assert.equal(row.partner, false);
  assert.notEqual(row.hash, key);
  assert.ok(!JSON.stringify(w.db.tables).includes(key), "the key itself is never saved");
  const auth = await keyAuth(w.db as never, key, { mcp: true, brandKey: true }, ent);
  assert.ok(!("denied" in auth) && auth.brandId === id && auth.ws === WS);

  assert.equal((await call(w, w.keys.p, (p) => api.revokeBrandKeys(p, id))).status, 204);
  const after = await keyAuth(w.db as never, key, { mcp: true, brandKey: true }, ent);
  assert.ok("denied" in after && after.denied.status === 401);
  // A new key works again after the old ones were revoked.
  const fresh = (await body(await call(w, w.keys.p, (p) => api.makeBrandKey(p, id)))) as { key: string };
  assert.ok(!("denied" in (await keyAuth(w.db as never, fresh.key, { mcp: true, brandKey: true }, ent))));
});

test("brand keys: a brand can have 20 at once", async () => {
  const w = setup();
  const id = (await body(await create(w, w.keys.p, NEW)))!.id as string;
  for (let i = 0; i < 20; i++) assert.equal((await call(w, w.keys.p2, (p) => api.makeBrandKey(p, id))).status, 201);
  await isError(await call(w, w.keys.p2, (p) => api.makeBrandKey(p, id)), 409, "too_many_keys");
});

test("delete brand: 204, the brand is gone and every one of its keys is revoked", async () => {
  const w = setup();
  const id = (await body(await create(w, w.keys.p, NEW)))!.id as string;
  const keys = [];
  for (let i = 0; i < 2; i++) keys.push(((await body(await call(w, w.keys.p, (p) => api.makeBrandKey(p, id)))) as { key: string }).key);
  const del = await call(w, w.keys.p, (p) => api.removeBrand(p, id));
  assert.equal(del.status, 204);
  assert.equal(await del.text(), "");
  assert.ok(!w.db.tables.brands.some((b) => b.id === id));
  for (const r of w.db.tables.api_keys.filter((k) => k.brand_id === id)) assert.ok(r.revoked_at, "brand key revoked");
  for (const k of keys) {
    const r = await keyAuth(w.db as never, k, { mcp: true, brandKey: true }, ent);
    assert.ok("denied" in r && r.denied.status === 401);
  }
  await isError(await call(w, w.keys.p, (p) => api.getBrand(p, id)), 404, "not_found");
  // The same customer can be made again.
  assert.equal((await create(w, w.keys.p, NEW)).status, 201);
});

test("usage: tasks, checks and answers in one month", async () => {
  const w = setup();
  const id = (await body(await create(w, w.keys.p, NEW)))!.id as string;
  w.db.tables.brand_usage = [
    { brand_id: id, workspace_id: WS, period: "2026-10", tasks: 42 },
    { brand_id: id, workspace_id: WS, period: "2026-11", tasks: 7 },
  ];
  w.db.tables.runs = [
    { id: "r1", brand_id: id, at: "2026-10-03T08:00:00.000Z" },
    { id: "r2", brand_id: id, at: "2026-10-31T23:59:00.000Z" },
    { id: "r3", brand_id: id, at: "2026-11-01T00:00:00.000Z" },
    { id: "r4", brand_id: APP_BRAND, at: "2026-10-05T00:00:00.000Z" },
  ];
  w.db.tables.answers = [
    { id: 1, brand_id: id, at: "2026-10-03T08:00:00.000Z" },
    { id: 2, brand_id: id, at: "2026-10-03T08:00:01.000Z" },
    { id: 3, brand_id: APP_BRAND, at: "2026-10-03T08:00:00.000Z" },
  ];
  const oct = (await body(await call(w, w.keys.p, (p) => api.brandUsage(p, id, "2026-10"))))!;
  assert.deepEqual(oct, { brand_id: id, external_id: "mt-ws-1", month: "2026-10", tasks: 42, checks: 2, answers: 2, prompts: 0 });
  const dec = (await body(await call(w, w.keys.p, (p) => api.brandUsage(p, id, "2026-12"))))!;
  assert.equal(dec.tasks, 0);
  assert.equal(dec.checks, 0);
  const now = (await body(await call(w, w.keys.p, (p) => api.brandUsage(p, id, null))))!;
  assert.equal(now.month, new Date().toISOString().slice(0, 7));
  for (const bad of ["2026-13", "2026-1", "26-10", "october"]) await isError(await call(w, w.keys.p, (p) => api.brandUsage(p, id, bad)), 422, "invalid");
});

test("monthRange: a month's first day and the next month's, in UTC", () => {
  assert.deepEqual(api.monthRange("2026-12"), { from: "2026-12-01T00:00:00.000Z", to: "2027-01-01T00:00:00.000Z" });
  assert.equal(api.monthRange("2026-00"), null);
});

test("rate limit: a partner key gets 429 after its calls for the minute", async () => {
  const w = setup();
  const run = async () => Response.json({ ok: true });
  for (let i = 0; i < api.MAX_CALLS; i++) assert.equal((await call(w, w.keys.rate, run)).status, 200);
  const r = await call(w, w.keys.rate, run);
  await isError(r, 429, "rate_limited");
  assert.equal(r.headers.get("retry-after"), "60");
  // Each key has its own limit.
  assert.equal((await call(w, w.keys.p, run)).status, 200);
});

test("something unexpected is a 503 the partner can retry, never a raw error", async () => {
  const w = setup();
  const e = await isError(
    await call(w, w.keys.p, async () => {
      throw new Error("relation brands does not exist");
    }),
    503,
    "unavailable",
  );
  assert.doesNotMatch(e.message, /relation/);
});
