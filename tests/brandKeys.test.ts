// Brand keys (aw_brand_…) see one brand. Every MCP tool and REST route is checked here, so a new one that
// reads brands another way, or lists the whole workspace, fails this test instead of leaking a second brand.
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { register } from "node:module";
import { join } from "node:path";
import { test } from "node:test";
import { hashKey, makeKey } from "../src/lib/apiKeys.ts";
import { fakeDb } from "./fakeDb.ts";

register(new URL("./fixtures/loader/hooks.mjs", import.meta.url));
const { TOOLS } = await import("../src/lib/mcp/tools.ts");
const { ToolError } = await import("../src/lib/mcp/protocol.ts");
const { keyAuth } = await import("../src/lib/integrations.ts");
const { brandById, brandRows } = await import("../src/lib/keyScope.ts");

// No tool may reach the internet from a test.
globalThis.fetch = (() => Promise.reject(new Error("no network in tests"))) as typeof fetch;

const WS = "11111111-1111-4111-8111-111111111111";
const OTHER_WS = "22222222-2222-4222-8222-222222222222";
const A = { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", name: "Alpha Corp", domain: "alpha.com" };
const B = { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", name: "Beta Labs", domain: "beta.io" };
const C = { id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", name: "Gamma Inc", domain: "gamma.dev" };
const B_SECRET = "beta secret prompt";
const at = new Date(Date.now() - 2 * 864e5).toISOString();

const brandRow = (b: typeof A, ws: string, prompt: string) => ({
  ...b,
  workspace_id: ws,
  url: `https://${b.domain}`,
  logo: "",
  category: "",
  prompts: [prompt],
  daily: true,
  profile: {},
  topics: [{ name: "Main", prompts: [prompt] }],
  created_at: b === A ? "2026-01-01" : "2026-01-02",
});
const chat = (b: typeof A, prompt: string) => ({
  engine: "ChatGPT",
  prompt,
  text: "",
  answered: true,
  error: null,
  sources: [{ url: `https://${b.domain}/guide`, title: `${b.name} guide`, domain: b.domain }],
  brands: [{ name: b.name, position: 1, sentiment: 80, domain: b.domain }],
});

function world() {
  const seed = {
    brands: [brandRow(A, WS, "best alpha tools"), brandRow(B, WS, B_SECRET), brandRow(C, OTHER_WS, "gamma prompt")],
    sites: [
      { id: "site-a", workspace_id: WS, brand_id: A.id, domain: A.domain, name: A.name, profile: { bank: [{ id: "k-a", keyword: "alpha keyword" }] } },
      { id: "site-b", workspace_id: WS, brand_id: B.id, domain: B.domain, name: B.name, profile: { bank: [{ id: "k-b", keyword: "beta keyword" }] } },
    ],
    calendar_items: [
      { id: "item-a", site_id: "site-a", workspace_id: WS, keyword: "alpha piece", status: "planned", created_at: at },
      { id: "item-b", site_id: "site-b", workspace_id: WS, keyword: "beta piece", status: "planned", created_at: at },
    ],
    runs: [
      { id: "run-a", workspace_id: WS, brand_id: A.id, at, engines: ["ChatGPT"], chats: [chat(A, "best alpha tools")] },
      { id: "run-b", workspace_id: WS, brand_id: B.id, at, engines: ["ChatGPT"], chats: [chat(B, B_SECRET)] },
    ],
    answers: [
      { id: 1, workspace_id: WS, brand_id: A.id, at, engine: "ChatGPT", prompt: "best alpha tools", text: "Alpha Corp is great." },
      { id: 2, workspace_id: WS, brand_id: B.id, at, engine: "ChatGPT", prompt: B_SECRET, text: "Beta Labs is great." },
    ],
  };
  return fakeDb(seed);
}

// Anything that would show the caller brand B, or brand C from another workspace.
const LEAKS = [B.id, B.name, B.domain, "site-b", "item-b", "beta keyword", "beta piece", C.id, C.name, C.domain];
const leaked = (x: unknown, extra: string[] = [], skip: string[] = []) =>
  [...LEAKS, ...extra].filter((t) => !skip.includes(t) && JSON.stringify(x ?? null).toLowerCase().includes(t.toLowerCase()));
// Tools that take no brand. Each must still show a brand key only its brand (checked below); add one here only after that.
const NO_BRAND_ARG = ["list_brands"];

/** Arguments a tool needs besides the brand, filled from its schema. */
function argsFor(tool: (typeof TOOLS)[number]): Record<string, unknown> {
  const args: Record<string, unknown> = {};
  for (const [k, p] of Object.entries(tool.inputSchema.properties)) {
    if (k === "brand") continue;
    if (p.type === "array") args[k] = k === "items" ? [{ id: "item-b", keyword: "beta piece", new_keyword: "taken", status: "published" }] : ["new prompt"];
    else if (p.type === "number") args[k] = 5;
    else if (p.type === "string" && !p.enum) args[k] = k === "topic" ? "Main" : "best tools";
  }
  return args;
}

const brandKeyCtx = (db: ReturnType<typeof world>) => ({ db: db as never, ws: WS, brandId: A.id });

test("every MCP tool refuses another brand by id, name or domain when called with a brand key", async () => {
  assert.ok(TOOLS.length >= 15, "the tool list loaded");
  for (const tool of TOOLS) {
    if (!tool.inputSchema.properties.brand) {
      assert.ok(NO_BRAND_ARG.includes(tool.name), `${tool.name} takes no brand. Check what it shows a brand key, then list it in NO_BRAND_ARG.`);
      continue;
    }
    for (const probe of [B.id, B.name, B.domain, "beta", C.id, C.name, C.domain]) {
      const db = world();
      await assert.rejects(
        () => tool.run(brandKeyCtx(db), { ...argsFor(tool), brand: probe }),
        (e: unknown) => {
          assert.ok(e instanceof ToolError, `${tool.name} with "${probe}" should be a tool error, got ${e}`);
          assert.match(e.message, /No brand matches/, `${tool.name} with "${probe}"`);
          // The message repeats what was asked for, and must name nothing else.
          assert.deepEqual(leaked(e.message, [B_SECRET], [probe]), [], `${tool.name} error names another brand`);
          return true;
        },
      );
      assert.deepEqual(leaked(db.served), [], `${tool.name} with "${probe}" read another brand's rows`);
    }
  }
});

test("every MCP tool, with no brand named, works on the key's brand only and never touches another", async () => {
  for (const tool of TOOLS) {
    const db = world();
    const beforeB = JSON.stringify([db.tables.brands[1], db.tables.calendar_items[1], db.tables.sites[1]]);
    let result: unknown;
    try {
      result = await tool.run(brandKeyCtx(db), argsFor(tool));
    } catch (e) {
      result = e instanceof Error ? e.message : e;
    }
    // The items sent name brand B's piece; a tool may say it did not find it, but nothing else.
    assert.deepEqual(leaked(result, [B_SECRET], ["item-b", "beta piece"]), [], `${tool.name} answered with another brand`);
    assert.deepEqual(leaked(db.served), [], `${tool.name} read another brand's rows`);
    assert.equal(JSON.stringify([db.tables.brands[1], db.tables.calendar_items[1], db.tables.sites[1]]), beforeB, `${tool.name} changed another brand`);
  }
});

test("list_brands shows a brand key one brand, and a workspace key every brand in its workspace", async () => {
  const list = TOOLS.find((t) => t.name === "list_brands")!;
  const one = (await list.run(brandKeyCtx(world()), {})).structuredContent as { brands: { id: string }[] };
  assert.deepEqual(one.brands.map((b) => b.id), [A.id]);
  const all = (await list.run({ db: world() as never, ws: WS }, {})).structuredContent as { brands: { id: string }[] };
  assert.deepEqual(all.brands.map((b) => b.id), [A.id, B.id]);
});

test("add_prompts with a brand key still counts every brand's prompts against the plan", async () => {
  const add = TOOLS.find((t) => t.name === "add_prompts")!;
  const db = world();
  await add.run(brandKeyCtx(db), { topic: "Main", prompts: ["alpha new"] });
  assert.deepEqual(db.tables.brands[0].prompts, ["best alpha tools", "alpha new"]);
  assert.deepEqual(db.tables.brands[1].prompts, [B_SECRET]);
});

test("brandRows and brandById: a brand key sees only its brand, a workspace key only its workspace", async () => {
  const db = world();
  const key = { db: db as never, ws: WS, brandId: A.id };
  assert.deepEqual(((await brandRows(key, "id")).data as { id: string }[]).map((b) => b.id), [A.id]);
  assert.equal(await brandById(key, B.id, "id"), null);
  assert.equal(((await brandById<{ id: string }>(key, A.id, "id")) ?? { id: "" }).id, A.id);
  const ws = { db: db as never, ws: WS };
  assert.equal(((await brandById<{ id: string }>(ws, B.id, "id")) ?? { id: "" }).id, B.id);
  assert.equal(await brandById(ws, C.id, "id"), null);
  assert.equal(await brandById(ws, "", "id"), null);
});

// ---------- REST API ----------

const v1 = join(import.meta.dirname, "../src/app/api/v1");
const routes = (dir: string): string[] => readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? routes(join(dir, f)) : f === "route.ts" ? [join(dir, f)] : []));

test("every REST route that takes brand keys loads brands only through keyScope", () => {
  const files = routes(v1);
  assert.ok(files.length >= 8);
  const taking: string[] = [];
  for (const f of files) {
    const src = readFileSync(f, "utf8");
    const name = f.slice(v1.length);
    // A route that never says brandKey: true refuses brand keys in apiAuth.
    if (!/apiAuth\(request, \{[^}]*brandKey: true/.test(src)) continue;
    taking.push(name);
    assert.doesNotMatch(src, /from\("brands"\)/, `${name} reads brands without the brand key's filter. Use brandRows or brandById.`);
    assert.match(src, /brandRows\(a|brandById/, `${name} takes brand keys but never loads its brand through keyScope`);
    assert.doesNotMatch(src, /eq\("brand_id", brandId\)/, `${name} filters by the brand id it was sent, not the brand it loaded`);
  }
  assert.deepEqual(taking.sort(), ["/brands/route.ts", "/calendar/route.ts", "/competitors/route.ts", "/prompts/route.ts", "/topic-bank/route.ts", "/visibility/models/route.ts", "/visibility/route.ts"]);
});

test("MCP code reads the brands table only through keyScope", () => {
  for (const f of ["../src/lib/mcp/tools.ts", "../src/lib/mcp/server.ts"]) {
    const src = readFileSync(new URL(f, import.meta.url), "utf8");
    assert.doesNotMatch(src, /from\("brands"\)\.select/, `${f} reads brands without the brand key's filter`);
  }
});

// ---------- keys ----------

const legacyEnt = async () => ({ readOnly: false, limits: { mcp: true, alerts: true, partner: true } as never });
const notPartnerEnt = async () => ({ readOnly: false, limits: { mcp: true, alerts: true, partner: false } as never });

function keys() {
  const live = makeKey("live");
  const brand = makeKey("brand");
  const partner = makeKey("partner");
  const revoked = makeKey("brand");
  const db = fakeDb({
    api_keys: [
      { id: "k-live", workspace_id: WS, hash: live.hash, partner: false, brand_id: null },
      { id: "k-brand", workspace_id: WS, hash: brand.hash, partner: false, brand_id: A.id },
      { id: "k-partner", workspace_id: WS, hash: partner.hash, partner: true, brand_id: null },
      { id: "k-revoked", workspace_id: WS, hash: revoked.hash, partner: false, brand_id: A.id, revoked_at: at },
    ],
  });
  return { db, live: live.key, brand: brand.key, partner: partner.key, revoked: revoked.key };
}
const status = async (r: Awaited<ReturnType<typeof keyAuth>>) => ("denied" in r ? r.denied.status : 200);

test("apiAuth: a brand key works only where the route takes brand keys, and carries its brand", async () => {
  const k = keys();
  const ok = await keyAuth(k.db as never, k.brand, { mcp: true, brandKey: true }, legacyEnt);
  assert.ok(!("denied" in ok));
  assert.equal(ok.brandId, A.id);
  assert.equal(ok.ws, WS);
  assert.equal(await status(await keyAuth(k.db as never, k.brand, {}, legacyEnt)), 403);
  assert.equal(await status(await keyAuth(k.db as never, k.revoked, { brandKey: true }, legacyEnt)), 401);
  // The workspace stopped being a partner: its brand keys stop too.
  assert.equal(await status(await keyAuth(k.db as never, k.brand, { brandKey: true }, notPartnerEnt)), 403);
});

test("apiAuth: workspace keys keep working with no brand; partner keys are refused outside /api/partner", async () => {
  const k = keys();
  const live = await keyAuth(k.db as never, k.live, { brandKey: true }, legacyEnt);
  assert.ok(!("denied" in live));
  assert.equal(live.brandId, null);
  assert.equal(await status(await keyAuth(k.db as never, k.partner, { brandKey: true }, legacyEnt)), 401);
  assert.equal(await status(await keyAuth(k.db as never, "", {}, legacyEnt)), 401);
  assert.equal(await status(await keyAuth(k.db as never, "sk_live_nope", {}, legacyEnt)), 401);
});

test("apiAuth: a key whose row does not match its prefix is refused", async () => {
  // A live-looking key saved as a brand key, and the other way round.
  const live = makeKey("live");
  const brand = makeKey("brand");
  const db = fakeDb({
    api_keys: [
      { id: "x1", workspace_id: WS, hash: hashKey(live.key), partner: false, brand_id: A.id },
      { id: "x2", workspace_id: WS, hash: hashKey(brand.key), partner: false, brand_id: null },
    ],
  });
  assert.equal(await status(await keyAuth(db as never, live.key, { brandKey: true }, legacyEnt)), 401);
  assert.equal(await status(await keyAuth(db as never, brand.key, { brandKey: true }, legacyEnt)), 401);
});
