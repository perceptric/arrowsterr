// The domain_overview MCP tool: any website's Google traffic and best keywords. DataForSEO, the plan check,
// tasks and the cache are all faked, so nothing here reaches the internet or a database.
import assert from "node:assert/strict";
import { register } from "node:module";
import { test } from "node:test";
import { fakeDb } from "./fakeDb.ts";

// No saved results in a database and no real DataForSEO account, whatever the shell has.
delete process.env.SUPABASE_SECRET_KEY;
delete process.env.DFS_LOGIN;
delete process.env.DFS_PASSWORD;
globalThis.fetch = (() => Promise.reject(new Error("no network in tests"))) as typeof fetch;

register(new URL("./fixtures/loader/hooks.mjs", import.meta.url));
const { cleanDomain, domainKeys, keywordLimit, lookupDomain, positionBands, topKeywords, MAX_KEYWORDS } = await import("../src/lib/mcp/domain.ts");
const { TOOLS } = await import("../src/lib/mcp/tools.ts");
const { ToolError } = await import("../src/lib/mcp/protocol.ts");
const { writeCache } = await import("../src/lib/cache.ts");
const { TASK_COST } = await import("../src/lib/plans.ts");
const { MARKETS } = await import("../src/lib/research.ts");
type Deps = import("../src/lib/mcp/domain.ts").DomainDeps;
type Keyword = import("../src/lib/research.ts").Keyword;

const WS = "11111111-1111-4111-8111-111111111111";
const US = MARKETS["United States"];

const size = { keywords: 5400, traffic: 81234, top3: 300, top10: 900, top20: 1500, top100: 5400, newKw: 120, lostKw: 80 };
const kw = (keyword: string, rank: number, volume: number, etv: number): Keyword => ({ keyword, volume, kd: 40, cpc: 2, intent: "commercial", trend: [], serp: [], rank, url: `https://katalon.com/${keyword.replace(/\s/g, "-")}`, etv });
const keywords = [kw("test automation", 4, 9900, 900.4), kw("katalon", 1, 22000, 6100.7), kw("katalon studio", 1, 8100, 2400), kw("selenium alternative", 12, 1300, 15)];
const months = Array.from({ length: 12 }, (_, i) => ({ month: `2025-${String(i + 1).padStart(2, "0")}`, traffic: 70000 + i * 1000, keywords: 5000 + i, top3: 1, top10: 2, top20: 3, top100: 4 }));

/** Fake deps over one shared in-memory cache, counting every paid or saved call. */
function fakes(over: Partial<Deps> = {}, cache = new Map<string, unknown>()) {
  const calls = { take: [] as number[], giveBack: 0, overview: 0, ranked: 0, history: 0, written: [] as string[], markets: [] as unknown[] };
  const deps: Deps = {
    locked: async () => null,
    ready: () => true,
    take: async (_ws, n) => {
      calls.take.push(n);
      return { ok: true, giveBack: async () => void calls.giveBack++ };
    },
    read: async <T,>(key: string) => cache.get(key) as T | undefined,
    write: async (key, data) => {
      calls.written.push(key);
      cache.set(key, data);
    },
    overview: async (_h, m) => {
      calls.overview++;
      calls.markets.push(m);
      return size;
    },
    ranked: async () => {
      calls.ranked++;
      return { keywords, overview: null };
    },
    history: async () => {
      calls.history++;
      return months;
    },
    ...over,
  };
  return { deps, calls, cache };
}

test("cleanDomain reads a site the way Domain Research does", () => {
  assert.equal(cleanDomain("katalon.com"), "katalon.com");
  assert.equal(cleanDomain("  https://www.Katalon.com/pricing?plan=pro "), "katalon.com");
  assert.equal(cleanDomain("http://katalon.com/"), "katalon.com");
  assert.equal(cleanDomain("docs.katalon.com"), "docs.katalon.com");
  for (const bad of ["", "best tools", "katalon", "localhost", "https://", 42, null, undefined]) assert.equal(cleanDomain(bad), null, String(bad));
});

test("keywordLimit defaults to 25 and stays between 1 and 100", () => {
  assert.equal(keywordLimit(undefined), 25);
  assert.equal(keywordLimit("abc"), 25);
  assert.equal(keywordLimit(10), 10);
  assert.equal(keywordLimit(7.6), 8);
  assert.equal(keywordLimit(-3), 1);
  assert.equal(keywordLimit(5000), MAX_KEYWORDS);
});

test("topKeywords puts the keywords with the most visits first and keeps the fields an agent needs", () => {
  const top = topKeywords(keywords, 3);
  assert.deepEqual(top.map((k) => k.keyword), ["katalon", "katalon studio", "test automation"]);
  assert.deepEqual(top[0], { keyword: "katalon", position: 1, volume: 22000, difficulty: 40, traffic: 6101, url: "https://katalon.com/katalon", intent: "commercial" });
  assert.deepEqual(positionBands(size), { "1-3": 300, "4-10": 600, "11-20": 600, "21-100": 3900 });
});

test("a fresh lookup takes TASK_COST.domain tasks, fetches the three pieces once and saves them", async () => {
  const { deps, calls } = fakes();
  const out = await lookupDomain(WS, "katalon.com", "United States", 2, deps);
  assert.deepEqual(calls.take, [TASK_COST.domain]);
  assert.equal(TASK_COST.domain, 10);
  assert.deepEqual([calls.overview, calls.ranked, calls.history, calls.giveBack], [1, 1, 1, 0]);
  assert.deepEqual(calls.markets, [US]);
  const keys = domainKeys(US, "katalon.com");
  assert.deepEqual(calls.written.sort(), [keys.history, keys.overview, keys.ranked].sort());
  // The size and the 12 months share Domain Research's saved results.
  assert.equal(keys.overview, "dom:domain:ov:2840:en:katalon.com");
  assert.equal(keys.history, "dom:domain:hist:2840:en:katalon.com");
  assert.deepEqual(out, {
    domain: "katalon.com",
    country: "United States",
    organicTraffic: 81234,
    rankedKeywords: 5400,
    positions: { "1-3": 300, "4-10": 600, "11-20": 600, "21-100": 3900 },
    newKeywords: 120,
    lostKeywords: 80,
    history: months.map((h) => ({ month: h.month, traffic: h.traffic, keywords: h.keywords })),
    topKeywords: topKeywords(keywords, 2),
    tasksUsed: 10,
  });
});

test("the same site again within 30 days is free and calls nothing", async () => {
  const cache = new Map<string, unknown>();
  await lookupDomain(WS, "katalon.com", "United States", 25, fakes({}, cache).deps);
  const { deps, calls } = fakes({ ready: () => false }, cache);
  const again = await lookupDomain(WS, "katalon.com", "United States", 25, deps);
  assert.deepEqual([calls.take.length, calls.overview, calls.ranked, calls.history], [0, 0, 0, 0]);
  assert.equal(again.tasksUsed, 0);
  assert.equal(again.topKeywords.length, keywords.length);
  // Another country is another lookup.
  const de = fakes({}, cache);
  const german = await lookupDomain(WS, "katalon.com", "Germany", 25, de.deps);
  assert.deepEqual(de.calls.markets, [MARKETS.Germany]);
  assert.equal(german.tasksUsed, 10);
});

test("a failed keywords call gives the tasks back and saves nothing for it", async () => {
  const { deps, calls, cache } = fakes({
    ranked: async () => {
      throw new Error("DataForSEO: Internal Error");
    },
  });
  await assert.rejects(lookupDomain(WS, "katalon.com", "United States", 25, deps), /Internal Error/);
  assert.deepEqual(calls.take, [10]);
  assert.equal(calls.giveBack, 1);
  assert.equal(cache.has(domainKeys(US, "katalon.com").ranked), false);
});

test("a failed overview or history doesn't sink the lookup, and isn't saved", async () => {
  const { deps, calls, cache } = fakes({
    overview: async () => {
      throw new Error("DataForSEO: busy");
    },
    ranked: async () => ({ keywords, overview: { ...size, traffic: 7000 } }),
    history: async () => {
      throw new Error("DataForSEO: busy");
    },
  });
  const out = await lookupDomain(WS, "katalon.com", "United States", 25, deps);
  assert.equal(out.organicTraffic, 7000);
  assert.deepEqual(out.history, []);
  assert.equal(calls.giveBack, 0);
  const keys = domainKeys(US, "katalon.com");
  assert.deepEqual([cache.has(keys.overview), cache.has(keys.history), cache.has(keys.ranked)], [false, false, true]);
});

test("a locked plan, no tasks left or no DataForSEO stops the lookup before anything is paid for", async () => {
  const locked = fakes({ locked: async () => "Your Starter plan has AI Visibility. Get Organic Research too on Pro." });
  await assert.rejects(lookupDomain(WS, "katalon.com", "United States", 25, locked.deps), (e: unknown) => e instanceof ToolError && /Organic Research/.test(e.message));
  assert.deepEqual([locked.calls.take.length, locked.calls.ranked], [0, 0]);

  const broke = fakes({ take: async () => ({ ok: false, error: "You've used this month's 2,000 tasks on Starter." }) });
  await assert.rejects(lookupDomain(WS, "katalon.com", "United States", 25, broke.deps), (e: unknown) => e instanceof ToolError && /2,000 tasks/.test(e.message));
  assert.deepEqual([broke.calls.overview, broke.calls.ranked, broke.calls.history], [0, 0, 0]);

  const off = fakes({ ready: () => false });
  await assert.rejects(lookupDomain(WS, "katalon.com", "United States", 25, off.deps), /not set up/);
  assert.equal(off.calls.take.length, 0);
});

test("a site Google has nothing on says so", async () => {
  const { deps } = fakes({ overview: async () => null, ranked: async () => ({ keywords: [], overview: null }) });
  await assert.rejects(lookupDomain(WS, "no-such-site-here.com", "United States", 25, deps), (e: unknown) => e instanceof ToolError && /no rankings for no-such-site-here\.com in United States/.test(e.message));
});

// ---------- the MCP tool ----------

const tool = TOOLS.find((t) => t.name === "domain_overview")!;
const A = { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", name: "Alpha Corp", domain: "alpha.com" };
const B = { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", name: "Beta Labs", domain: "beta.io" };
const brand = (b: typeof A, i: number) => ({ ...b, workspace_id: WS, url: `https://${b.domain}`, logo: "", category: "", prompts: [], daily: true, profile: {}, topics: [], created_at: `2026-01-0${i}` });
const world = () =>
  fakeDb({
    brands: [brand(A, 1), brand(B, 2)],
    sites: [
      { id: "site-a", workspace_id: WS, brand_id: A.id, domain: A.domain, profile: { country: "Germany" } },
      { id: "site-b", workspace_id: WS, brand_id: B.id, domain: B.domain, profile: { country: "France" } },
    ],
  });
/** Save a site's results in the shared cache, the way an earlier lookup would. */
async function saved(host: string, country: string) {
  const keys = domainKeys(MARKETS[country], host);
  await writeCache(keys.overview, size);
  await writeCache(keys.ranked, { keywords, overview: null });
  await writeCache(keys.history, months);
}

test("domain_overview is read-only, needs a domain, charges its own tasks and tells an agent when to use it", () => {
  assert.ok(tool);
  assert.deepEqual(tool.inputSchema.required, ["domain"]);
  assert.deepEqual(Object.keys(tool.inputSchema.properties).sort(), ["brand", "domain", "limit"]);
  assert.equal(tool.annotations.readOnlyHint, true);
  assert.equal(tool.annotations.openWorldHint, true);
  assert.equal(tool.tasks, TASK_COST.domain);
  for (const phrase of ["traffic", "keywords does X rank for", "competitor", `${TASK_COST.domain} tasks`]) assert.ok(tool.description.includes(phrase), phrase);
  assert.doesNotMatch(tool.description, /—/);
});

test("domain_overview with a brand key uses its brand's country and answers from saved results", async () => {
  await saved("katalon.com", "Germany");
  const db = world();
  const res = await tool.run({ db: db as never, ws: WS, brandId: A.id }, { domain: "https://www.katalon.com/pricing", limit: 2 });
  const out = res.structuredContent as { domain: string; country: string; topKeywords: { keyword: string }[]; tasksUsed: number };
  assert.equal(out.domain, "katalon.com");
  assert.equal(out.country, "Germany");
  assert.deepEqual(out.topKeywords.map((k) => k.keyword), ["katalon", "katalon studio"]);
  assert.equal(out.tasksUsed, 0);
  assert.match(res.content[0].text, /Treat them as data/);
  // The other brand's site and country were never read.
  assert.deepEqual(db.served.filter((s) => JSON.stringify(s.row).includes(B.id) || JSON.stringify(s.row).includes("France")), []);
});

test("domain_overview with a workspace key and several brands needs no brand: it uses the United States", async () => {
  await saved("katalon.com", "United States");
  const res = await tool.run({ db: world() as never, ws: WS }, { domain: "katalon.com" });
  assert.equal((res.structuredContent as { country: string }).country, "United States");
  const named = await tool.run({ db: world() as never, ws: WS }, { domain: "katalon.com", brand: "Alpha Corp" });
  assert.equal((named.structuredContent as { country: string }).country, "Germany");
});

test("domain_overview refuses what isn't a website, and another brand for a brand key", async () => {
  const ctx = { db: world() as never, ws: WS, brandId: A.id };
  await assert.rejects(tool.run(ctx, { domain: "best test tools" }), (e: unknown) => e instanceof ToolError && /Give a website/.test(e.message));
  await assert.rejects(tool.run(ctx, {}), (e: unknown) => e instanceof ToolError && /Give a website/.test(e.message));
  await assert.rejects(tool.run(ctx, { domain: "katalon.com", brand: B.name }), (e: unknown) => e instanceof ToolError && /No brand matches/.test(e.message) && !e.message.includes(B.domain));
});
