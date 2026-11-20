// Partner connect links (POST /api/partner/brands/:id/connect/start and its callback): a partner's customer connects
// their own Cloudflare from the partner's app, and comes back to the partner with no Arrowsterr page in between.
// Composio, the clock and the settings are faked, so nothing here reaches the internet or a database.
import assert from "node:assert/strict";
import { register } from "node:module";
import { test } from "node:test";
import { makeKey } from "../src/lib/apiKeys.ts";
import { fakeDb } from "./fakeDb.ts";

delete process.env.COMPOSIO_API_KEY;
globalThis.fetch = (() => Promise.reject(new Error("no network in tests"))) as typeof fetch;

register(new URL("./fixtures/loader/hooks.mjs", import.meta.url));
const api = await import("../src/lib/partnerApi.ts");
const c = await import("../src/lib/partnerConnect.ts");
type Deps = import("../src/lib/partnerConnect.ts").ConnectDeps;
type Owner = import("../src/lib/composio.ts").AppOwner;

const WS = "11111111-1111-4111-8111-111111111111"; // the partner
const WS2 = "22222222-2222-4222-8222-222222222222"; // another partner
const MINE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"; // made by the partner API in WS
const APP = "dddddddd-dddd-4ddd-8ddd-dddddddddddd"; // made in the app, in WS
const THEIRS = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee"; // another partner's brand
const RETURN = "https://chat.morningtelos.com/apps/done?ws=42";
const ORIGIN = "https://app.arrowsterr.com";

const ent = async () => ({ readOnly: false, limits: { partner: true, mcp: true, alerts: true } as never });
const brand = (id: string, ws: string, key: string | null) => ({ id, workspace_id: ws, name: "Acme Bakery", domain: `${id.slice(0, 4)}.com`, url: "", prompts: [], external_id: key ? `ext-${id}` : null, created_by_key: key });

function setup(over: Partial<Deps> = {}) {
  const key = makeKey("partner");
  const db = fakeDb({
    api_keys: [{ id: "kp", workspace_id: WS, hash: key.hash, partner: true, brand_id: null }],
    brands: [brand(MINE, WS, "kp"), brand(APP, WS, null), brand(THEIRS, WS2, "kother")],
    partner_connect_states: [],
  });
  let clock = Date.parse("2026-11-20T10:00:00Z");
  const links: { owner: Owner; slug: string; callback: string }[] = [];
  const live = new Set<string>(); // owners with a working Cloudflare connection
  const deps: Deps = {
    db: db as never,
    ready: () => true,
    link: async (owner, slug, callback) => {
      links.push({ owner, slug, callback });
      return `https://connect.composio.dev/link/ln_123?for=${slug}`;
    },
    connected: async (owner, slug) => slug === "cloudflare" && typeof owner !== "string" && live.has(owner.brand),
    hosts: () => ["chat.morningtelos.com"],
    origin: () => ORIGIN,
    now: () => clock,
    ...over,
  };
  const start = (id: string, body: unknown) =>
    api.partnerRoute(new Request(`${ORIGIN}/api/partner/brands/${id}/connect/start`, { method: "POST", headers: { authorization: `Bearer ${key.key}` } }), (p) => c.startConnect(p, id, body, deps), { db: db as never, entitlement: ent });
  /** The state the last link carries, from the callback address we gave the provider. */
  const lastState = () => links.at(-1)!.callback.slice(`${ORIGIN}${c.CALLBACK_PATH}/`.length);
  const back = (state: string, query = "") => c.finishConnect(state, new URLSearchParams(query), deps);
  return { db, deps, links, live, start, lastState, back, tick: (ms: number) => void (clock += ms) };
}

const json = async (r: Response) => (await r.json()) as Record<string, unknown>;
const code = async (r: Response) => ((await json(r)).error as { code: string }).code;
/** Where a callback sent the customer, as its query. */
function landed(r: Response) {
  assert.equal(r.status, 302);
  const u = new URL(r.headers.get("location")!);
  assert.equal(`${u.origin}${u.pathname}`, "https://chat.morningtelos.com/apps/done");
  assert.equal(u.searchParams.get("ws"), "42", "the partner's own query is kept");
  return Object.fromEntries([...u.searchParams].filter(([k]) => k !== "ws"));
}

test("integrations: Cloudflare when Composio is set up, nothing when it isn't", () => {
  assert.deepEqual(c.usableIntegrations(true), [{ id: "cloudflare", name: "Cloudflare" }]);
  assert.deepEqual(c.usableIntegrations(false), []);
});

test("PARTNER_RETURN_HOSTS is a comma-separated list of exact hosts", () => {
  assert.deepEqual(c.returnHosts(" chat.morningtelos.com, App.Example.com ,,"), ["chat.morningtelos.com", "app.example.com"]);
  assert.deepEqual(c.returnHosts(""), []);
});

test("allowedReturn: https on a listed host only", () => {
  const hosts = ["chat.morningtelos.com"];
  assert.ok(c.allowedReturn(RETURN, hosts));
  for (const bad of ["http://chat.morningtelos.com/x", "https://evil.com/x", "https://chat.morningtelos.com.evil.com/", "https://evil.com/?chat.morningtelos.com", "https://user:pw@chat.morningtelos.com/", "javascript:alert(1)", "/apps/done", "", 42, null, `https://chat.morningtelos.com/${"a".repeat(2001)}`]) {
    assert.equal(c.allowedReturn(bad, hosts), null, String(bad));
  }
  assert.equal(c.allowedReturn(RETURN, []), null, "no hosts set means no return_url works");
});

test("start: a link for the brand's own Composio user, with a state saved only as a hash, for 30 minutes", async () => {
  const w = setup();
  const r = await w.start(MINE, { integration: "cloudflare", return_url: RETURN });
  assert.equal(r.status, 200);
  assert.deepEqual(await json(r), { url: "https://connect.composio.dev/link/ln_123?for=cloudflare" });
  assert.deepEqual(w.links[0].owner, { brand: MINE });
  assert.equal(w.links[0].slug, "cloudflare");
  const state = w.lastState();
  assert.match(state, /^[A-Za-z0-9_-]{43}$/);
  const [row] = w.db.tables.partner_connect_states;
  assert.equal(row.state_hash, c.hashState(state));
  assert.ok(!JSON.stringify(row).includes(state), "the state itself is never saved");
  assert.deepEqual([row.workspace_id, row.brand_id, row.key_id, row.integration, row.return_url, row.used_at], [WS, MINE, "kp", "cloudflare", RETURN, undefined]);
  assert.equal(Date.parse(String(row.expires_at)) - Date.parse("2026-11-20T10:00:00Z"), 30 * 60_000);
});

test("start refuses an unknown integration, and every integration when Composio is not set up", async () => {
  const w = setup();
  for (const integration of ["google_search_console", "wordpress", "", undefined]) {
    const r = await w.start(MINE, { integration, return_url: RETURN });
    assert.equal(r.status, 422);
    assert.equal(await code(r), "unknown_integration");
  }
  const off = setup({ ready: () => false });
  const r = await off.start(MINE, { integration: "cloudflare", return_url: RETURN });
  assert.equal(await code(r), "unknown_integration");
  assert.equal(w.links.length + off.links.length, 0);
});

test("start refuses a return_url on a host that isn't allowed", async () => {
  const w = setup();
  for (const return_url of ["https://evil.com/done", "http://chat.morningtelos.com/done", "chat.morningtelos.com/done", undefined]) {
    const r = await w.start(MINE, { integration: "cloudflare", return_url });
    assert.equal(r.status, 422);
    assert.equal(await code(r), "bad_return_url");
  }
  assert.equal(w.db.tables.partner_connect_states.length, 0);
});

test("start refuses another partner's brand, a brand made in the app and a made-up id", async () => {
  const w = setup();
  const body = { integration: "cloudflare", return_url: RETURN };
  assert.equal((await w.start(THEIRS, body)).status, 404);
  const app = await w.start(APP, body);
  assert.equal(app.status, 403);
  assert.equal(await code(app), "not_your_brand");
  assert.equal((await w.start("not-a-uuid", body)).status, 404);
  assert.equal(w.links.length, 0);
});

test("callback: connected sends the customer back with aw_status=connected, and the link then stops working", async () => {
  const w = setup();
  await w.start(MINE, { integration: "cloudflare", return_url: RETURN });
  const state = w.lastState();
  w.live.add(MINE);
  const first = await w.back(state, "status=success&connected_account_id=ca_1");
  assert.deepEqual(landed(first), { aw_status: "connected", integration: "cloudflare" });
  assert.equal(first.headers.get("cache-control"), "no-store");
  assert.ok(w.db.tables.partner_connect_states[0].used_at);
  // Single use: the same link again is an error, even though the app is connected.
  assert.deepEqual(landed(await w.back(state, "status=success")), { aw_status: "error", integration: "cloudflare", reason: "used" });
});

test("callback: an expired link, a refusal, a missing connection, a deleted brand and a provider failure", async () => {
  const run = async (prep: (w: ReturnType<typeof setup>) => void, query = "status=success", over: Partial<Deps> = {}) => {
    const w = setup(over);
    await w.start(MINE, { integration: "cloudflare", return_url: RETURN });
    w.live.add(MINE);
    prep(w);
    return landed(await w.back(w.lastState(), query)).reason;
  };
  assert.equal(await run((w) => w.tick(30 * 60_000 + 1)), "expired");
  assert.equal(await run((w) => w.tick(29 * 60_000)), undefined, "still fine just before 30 minutes");
  assert.equal(await run(() => {}, "status=failed"), "denied");
  assert.equal(await run((w) => w.live.clear()), "not_connected");
  assert.equal(await run((w) => void (w.db.tables.brands = w.db.tables.brands.filter((b) => b.id !== MINE))), "brand_gone");
  assert.equal(await run((w) => void (w.db.tables.brands.find((b) => b.id === MINE)!.created_by_key = null)), "brand_gone");
  assert.equal(await run(() => {}, "", { connected: async () => Promise.reject(new Error("Composio is down")) }), "provider_error");
});

test("callback: a state we never made, or a broken one, is a plain 400 with no page and no name", async () => {
  const w = setup();
  for (const state of ["", "short", "a".repeat(43), "../../etc/passwd", "x".repeat(200)]) {
    const r = await w.back(state);
    assert.equal(r.status, 400);
    assert.equal(r.headers.get("location"), null);
    assert.match(r.headers.get("content-type") ?? "", /^text\/plain/);
    assert.doesNotMatch(await r.text(), /arrowsterr|<html/i);
  }
});

test("a state is bound to its brand: a link for one brand never connects another", async () => {
  const w = setup();
  // Two brands of the same partner, and a link for each.
  const OTHER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  w.db.tables.brands.push(brand(OTHER, WS, "kp"));
  await w.start(MINE, { integration: "cloudflare", return_url: RETURN });
  const forMine = w.lastState();
  await w.start(OTHER, { integration: "cloudflare", return_url: RETURN });
  assert.deepEqual(w.links.map((l) => l.owner), [{ brand: MINE }, { brand: OTHER }]);
  // Only OTHER connected: MINE's link says so, whatever the provider claims.
  w.live.add(OTHER);
  assert.deepEqual(landed(await w.back(forMine, "status=success")), { aw_status: "error", integration: "cloudflare", reason: "not_connected" });
});

test("outcomeUrl keeps the partner's address and replaces our own keys", () => {
  assert.equal(c.outcomeUrl("https://chat.morningtelos.com/done?aw_status=x&reason=y&a=1", "cloudflare", null), "https://chat.morningtelos.com/done?aw_status=connected&a=1&integration=cloudflare");
  assert.equal(c.outcomeUrl("https://chat.morningtelos.com/done", "cloudflare", "expired"), "https://chat.morningtelos.com/done?aw_status=error&integration=cloudflare&reason=expired");
});

test("old links are cleared when a new one is made", async () => {
  const w = setup();
  w.db.tables.partner_connect_states.push({ state_hash: "old", workspace_id: WS, brand_id: MINE, integration: "cloudflare", return_url: RETURN, expires_at: "2026-11-01T00:00:00Z", used_at: null });
  await w.start(MINE, { integration: "cloudflare", return_url: RETURN });
  assert.deepEqual(w.db.tables.partner_connect_states.map((r) => r.state_hash === "old"), [false]);
});
