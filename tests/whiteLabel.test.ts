// A partner (Morning Telos) sells Arrowsterr inside its own product. Its customers' AI agents use brand keys, and
// must never see Arrowsterr: not on the MCP server (names, links, "open the app", plan names, upgrades), and not in
// email. Every tool runs here with a brand key, so a new tool or message that names us fails this test.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { register } from "node:module";
import { mock, test } from "node:test";
import { makeKey } from "../src/lib/apiKeys.ts";
import { fakeDb } from "./fakeDb.ts";

// No database, no DataForSEO, no Composio, whatever the shell has. Email is faked below.
for (const k of ["SUPABASE_SECRET_KEY", "DFS_LOGIN", "DFS_PASSWORD", "COMPOSIO_API_KEY", "APP_URL"]) delete process.env[k];
const sent: { url: string; body: string }[] = [];
globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
  if (String(url).startsWith("https://api.resend.com/")) {
    sent.push({ url: String(url), body: String(init?.body ?? "") });
    return Response.json({ id: "email-1" });
  }
  throw new Error("no network in tests");
}) as typeof fetch;

register(new URL("./fixtures/loader/hooks.mjs", import.meta.url));
const { TOOLS } = await import("../src/lib/mcp/tools.ts");
const { handleOne } = await import("../src/lib/mcp/server.ts");
const { PlanError, ToolError, planError } = await import("../src/lib/mcp/protocol.ts");
const { BRANDED, brandKeyError, isBranded, NEUTRAL_FAILURE, NEUTRAL_PLAN } = await import("../src/lib/mcp/whiteLabel.ts");
const { lookupDomain } = await import("../src/lib/mcp/domain.ts");
const { keyAuth } = await import("../src/lib/integrations.ts");
const { writeCache } = await import("../src/lib/cache.ts");
const { marketOf } = await import("../src/lib/research.ts");
const { isPartnerBrand } = await import("../src/lib/partnerBrand.ts");
const notify = await import("../src/lib/notify.ts");

const WS = "11111111-1111-4111-8111-111111111111"; // the partner's workspace
const A = { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", name: "Acme Bakery", domain: "acmebakery.com" }; // a partner brand
const B = { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", name: "Own Co", domain: "own.co" }; // made in the app
const at = new Date(Date.now() - 2 * 864e5).toISOString();

const brandRow = (b: typeof A, prompts: string[], key: string | null) => ({
  ...b,
  workspace_id: WS,
  url: `https://${b.domain}`,
  logo: "",
  category: "",
  prompts,
  daily: true,
  profile: {},
  topics: [{ name: "Main", prompts }],
  created_by_key: key,
  created_at: b === A ? "2026-01-01" : "2026-01-02",
});
const chat = (prompt: string) => ({
  engine: "ChatGPT",
  prompt,
  text: "",
  answered: true,
  error: null,
  sources: [{ url: `https://${A.domain}/menu`, title: "Menu", domain: A.domain }],
  brands: [
    { name: A.name, position: 1, sentiment: 80, domain: A.domain },
    { name: "Crumb Co", position: 2, sentiment: 60, domain: "crumb.co" },
  ],
});

/** The partner's workspace. answers: false leaves the brand with no AI answers yet, so tools say why. */
function world(o: { answers?: boolean; prompts?: string[] } = {}) {
  const prompts = o.prompts ?? ["best bakery near me"];
  const withAnswers = o.answers !== false;
  return fakeDb({
    brands: [brandRow(A, prompts, "kp"), brandRow(B, [], null)],
    sites: [{ id: "site-a", workspace_id: WS, brand_id: A.id, domain: A.domain, name: A.name, profile: { bank: [{ id: "k-a", keyword: "sourdough bread" }] } }],
    calendar_items: [{ id: "item-a", site_id: "site-a", workspace_id: WS, keyword: "sourdough guide", status: "planned", created_at: at }],
    runs: withAnswers ? [{ id: "run-a", workspace_id: WS, brand_id: A.id, at, engines: ["ChatGPT"], chats: [chat(prompts[0])] }] : [],
    answers: withAnswers ? [{ id: 1, workspace_id: WS, brand_id: A.id, at, engine: "ChatGPT", prompt: prompts[0], text: "Acme Bakery is great." }] : [],
    cms_connections: [],
  });
}

const brandKey = (db: ReturnType<typeof world>) => ({ db: db as never, ws: WS, brandId: A.id });
const wsKey = (db: ReturnType<typeof world>) => ({ db: db as never, ws: WS, brandId: null });

/** Arguments a tool needs, filled from its schema. */
function argsFor(tool: (typeof TOOLS)[number]): Record<string, unknown> {
  const args: Record<string, unknown> = {};
  for (const [k, p] of Object.entries(tool.inputSchema.properties)) {
    if (k === "brand") continue;
    if (p.type === "array") args[k] = k === "items" ? [{ keyword: "rye bread", id: "item-a", status: "writing" }] : ["new prompt"];
    else if (p.type === "number") args[k] = 5;
    else if (p.type === "string" && !p.enum) args[k] = k === "topic" ? "Main" : k === "domain" ? "crumb.co" : k === "prompt" ? "bakery" : "bread";
  }
  return args;
}

let id = 0;
const rpc = (ctx: Parameters<typeof handleOne>[0], method: string, params: Record<string, unknown> = {}) => handleOne(ctx, { jsonrpc: "2.0", id: ++id, method, params });
const callTool = async (ctx: Parameters<typeof handleOne>[0], name: string, args: Record<string, unknown>) => {
  const reply = await rpc(ctx, "tools/call", { name, arguments: args });
  return reply!.result as { content: { text: string }[]; isError?: boolean; structuredContent?: unknown };
};
/** Every piece of our own wording that BRANDED catches in a reply. */
const branded = (x: unknown) => {
  const text = JSON.stringify(x ?? null);
  return [...text.matchAll(new RegExp(BRANDED.source, "gi"))].map((m) => m[0]);
};

test("BRANDED catches our name, our app's links and our plan words, and not plain data words", () => {
  for (const s of ["Arrowsterr", "https://app.arrowsterr.com/prompts", "Connect it in Settings → Integrations", "Ask Zippie", "run a check in the app.", "Remove some or upgrade.", "Buy a task pack", "boost to Pro now", "Your Starter plan has", "Get Organic Research too on Pro.", "the Sources page"]) {
    assert.ok(isBranded(s), s);
  }
  for (const s of ["AI visibility", "SEO data", "No AI answers for Acme Bakery in the last 30 days yet.", "Visibility over time", "best crm for small agencies", "product"]) assert.ok(!isBranded(s), s);
});

test("every MCP tool, called with a brand key, answers and fails in neutral words", async () => {
  assert.ok(TOOLS.length >= 15, "the tool list loaded");
  for (const answers of [true, false]) {
    for (const tool of TOOLS) {
      const result = await callTool(brandKey(world({ answers })), tool.name, argsFor(tool));
      assert.deepEqual(branded(result), [], `${tool.name} (${answers ? "with" : "without"} answers) named Arrowsterr: ${result.content[0]?.text}`);
    }
  }
});

test("a brand key's initialize and tools/list name nothing of ours; a workspace key keeps Arrowsterr's", async () => {
  const init = (await rpc(brandKey(world()), "initialize", { protocolVersion: "2025-06-18" }))!.result as { serverInfo: Record<string, unknown>; instructions: string };
  assert.deepEqual(branded(init), []);
  assert.equal(init.serverInfo.websiteUrl, undefined);
  const list = (await rpc(brandKey(world()), "tools/list"))!.result as { tools: { name: string; description: string }[] };
  assert.equal(list.tools.length, TOOLS.length);
  for (const t of list.tools) assert.deepEqual(branded(t), [], `${t.name} description`);
  const prompts = (await rpc(brandKey(world()), "prompts/list"))!.result;
  assert.deepEqual(branded(prompts), []);

  // Normal Arrowsterr users see what they saw before.
  const own = (await rpc(wsKey(world()), "initialize", {}))!.result as { serverInfo: { title: string }; instructions: string };
  assert.equal(own.serverInfo.title, "Arrowsterr");
  assert.match(own.instructions, /^Arrowsterr tracks/);
  const ownList = (await rpc(wsKey(world()), "tools/list"))!.result as { tools: { name: string; description: string }[] };
  assert.match(ownList.tools.find((t) => t.name === "get_ai_crawlers")!.description, /Arrowsterr Connector/);
});

test("a tool whose description names us has a brand key version, and only those do", () => {
  for (const t of TOOLS) {
    if (isBranded(t.description)) assert.ok(t.brandKeyDescription && !isBranded(t.brandKeyDescription), `${t.name} needs a neutral brandKeyDescription`);
    else assert.equal(t.brandKeyDescription, undefined, `${t.name} has a brandKeyDescription it doesn't need`);
  }
});

test("get_ai_crawlers with no data: a brand key is told to connect Cloudflare; a workspace key keeps the app's hint", async () => {
  const mine = await callTool(brandKey(world()), "get_ai_crawlers", {});
  assert.equal(mine.isError, true);
  assert.equal(mine.content[0].text, "No AI crawler data for Acme Bakery yet. Connect the site's Cloudflare account first.");
  const own = await callTool(wsKey(world()), "get_ai_crawlers", { brand: A.name });
  assert.match(own.content[0].text, /Settings → Integrations/);
});

test("keyword_research with a brand key: saved results come back clean, and a server problem is one neutral line", async () => {
  const m = marketOf(undefined);
  await writeCache(`kr2:ideas:${m.location}:${m.language}:sourdough`, [{ keyword: "sourdough starter recipe", volume: 9900, kd: 30, cpc: 1.2, intent: "informational", trend: [] }]);
  const hit = await callTool(brandKey(world()), "keyword_research", { keyword: "sourdough" });
  assert.equal(hit.isError, undefined);
  assert.deepEqual((hit.structuredContent as { keywords: { keyword: string }[] }).keywords.map((k) => k.keyword), ["sourdough starter recipe"]);
  // "starter" in Google's keywords is data, not our plan: only our own text is held to BRANDED.
  assert.ok(!isBranded(hit.content[0].text.replace(/sourdough starter recipe/g, "")));

  const miss = await callTool(brandKey(world()), "keyword_research", { keyword: "rye loaf" });
  assert.equal(miss.isError, true);
  assert.equal(miss.content[0].text, NEUTRAL_FAILURE);
  const own = await callTool(wsKey(world()), "keyword_research", { keyword: "rye loaf", brand: A.name });
  assert.equal(own.content[0].text, "Something went wrong: Keyword data is not set up on the server.");
});

test("domain_overview with a brand key: a site no one looked up fails in neutral words", async () => {
  const r = await callTool(brandKey(world()), "domain_overview", { domain: "crumb.co" });
  assert.equal(r.isError, true);
  assert.deepEqual(branded(r), []);
  assert.equal(r.content[0].text, NEUTRAL_FAILURE);
});

test("domain_overview's plan errors are PlanErrors, so a brand key gets the plain line instead of the plan's", async () => {
  const deps = {
    locked: async () => null as string | null,
    ready: () => true,
    take: async () => ({ ok: true as const, giveBack: async () => {} }),
    read: async () => undefined,
    write: async () => {},
    overview: async () => null,
    ranked: async () => ({ keywords: [], overview: null }),
    history: async () => [],
  };
  const cases = [
    { deps: { ...deps, locked: async () => "Your Starter plan has AI Visibility. Get Organic Research too on Pro." }, kind: "locked" },
    { deps: { ...deps, take: async () => ({ ok: false as const, error: "You've used this month's 2,000 tasks on Starter. Buy a task pack to keep going." }) }, kind: "limit" },
    { deps: { ...deps, take: async () => ({ ok: false as const, error: "Your free trial has ended. Pick a plan to keep going.", readOnly: true }) }, kind: "read_only" },
  ] as const;
  for (const c of cases) {
    const e = await lookupDomain(WS, "crumb.co", "United States", 25, c.deps).catch((x: unknown) => x);
    assert.ok(e instanceof PlanError, c.kind);
    assert.equal(e.kind, c.kind);
    assert.ok(isBranded(e.message) || c.kind === "read_only", "a workspace key still gets the plan's own words");
    assert.equal(brandKeyError(e), NEUTRAL_PLAN[c.kind]);
  }
});

test("add_prompts at the prompt limit: a brand key hears the limit, never 'upgrade'; a workspace key is unchanged", async () => {
  const full = Array.from({ length: 50 }, (_, i) => `prompt ${i}`);
  const mine = await callTool(brandKey(world({ prompts: full })), "add_prompts", { topic: "Main", prompts: ["one more"] });
  assert.equal(mine.isError, true);
  assert.equal(mine.content[0].text, "No more prompts fit. This account's prompt limit is reached.");
  const own = await callTool(wsKey(world({ prompts: full })), "add_prompts", { brand: A.name, topic: "Main", prompts: ["one more"] });
  assert.match(own.content[0].text, /upgrade/);
});

test("brandKeyError: plan errors get their plain line, branded or unexpected errors one neutral line, the rest pass", async () => {
  assert.equal(brandKeyError(new PlanError("The plan tracks 50 prompts. Remove some or upgrade.", "limit")), NEUTRAL_PLAN.limit);
  assert.equal(brandKeyError(new PlanError("x", "limit", "Custom line.")), "Custom line.");
  assert.equal(brandKeyError(new ToolError("Say which prompt.")), "Say which prompt.");
  assert.equal(brandKeyError(new ToolError("Open it in the Arrowsterr app.")), NEUTRAL_FAILURE);
  assert.equal(brandKeyError(new Error("relation brands does not exist")), NEUTRAL_FAILURE);
  for (const line of [...Object.values(NEUTRAL_PLAN), NEUTRAL_FAILURE]) {
    assert.ok(!isBranded(line), line);
    assert.doesNotMatch(line, /—/);
  }
  const ro = await planError(Response.json({ error: "This workspace is read-only until billing is sorted out.", readOnly: true }, { status: 402 }));
  assert.equal(ro.kind, "read_only");
  const tasks = await planError(Response.json({ error: "You've used this month's 2,000 tasks on Pro.", limit: true }, { status: 429 }));
  assert.equal(tasks.kind, "limit");
});

test("apiAuth's refusals for a brand key name no plan; a workspace key's still do", async () => {
  const brand = makeKey("brand");
  const live = makeKey("live");
  const db = fakeDb({
    api_keys: [
      { id: "kb", workspace_id: WS, hash: brand.hash, partner: false, brand_id: A.id },
      { id: "kl", workspace_id: WS, hash: live.hash, partner: false, brand_id: null },
    ],
  });
  const noMcp = async () => ({ readOnly: false, limits: { mcp: false, alerts: false, partner: true } as never });
  const readOnly = async () => ({ readOnly: true, limits: { mcp: true, alerts: true, partner: true } as never });
  const text = async (r: Awaited<ReturnType<typeof keyAuth>>) => ("denied" in r ? ((await r.denied.json()) as { error: string }).error : "");
  for (const ent of [noMcp, readOnly]) {
    const msg = await text(await keyAuth(db as never, brand.key, { mcp: true, brandKey: true }, ent));
    assert.ok(msg && !isBranded(msg), msg);
  }
  assert.match(await text(await keyAuth(db as never, live.key, { mcp: true, brandKey: true }, noMcp)), /Starter/);
});

test("the MCP endpoint never sends a brand key's agent to Arrowsterr's sign-in", () => {
  const src = readFileSync(new URL("../src/lib/mcp/server.ts", import.meta.url), "utf8");
  assert.match(src, /status === 401 && keyKind\(keyOf\(request\)\) !== "brand"/);
});

// ---------- email ----------

process.env.RESEND_API_KEY = "re_test_only";
const alert = { you: 20, before: 40, overtaken: null, engines: [{ engine: "ChatGPT", now: 20, was: 40 }], prevDay: "2026-11-17" };
const people = [{ workspace_id: WS, user_id: "u1", email: "staff@partner.example", role: "owner" }];

test("isPartnerBrand: a brand the partner API made", () => {
  assert.equal(isPartnerBrand({ created_by_key: "kp" }), true);
  for (const b of [{ created_by_key: null }, {}, null, undefined]) assert.equal(isPartnerBrand(b), false);
});

test("visibility alert emails skip partner brands and still go out for brands made in the app", async () => {
  sent.length = 0;
  const db = fakeDb({ brands: [brandRow(A, [], "kp"), brandRow(B, [], null)], workspace_members: people, notification_prefs: [], email_log: [], runs: [] });
  assert.equal(await notify.emailAlert(db as never, WS, A, "2026-11-18", alert), 0);
  assert.equal(sent.length, 0, "no email for the partner's customer's brand");
  assert.equal(db.tables.email_log.length, 0, "nothing claimed for it either");
  assert.equal(await notify.emailAlert(db as never, WS, B, "2026-11-18", alert), 1);
  assert.equal(sent.length, 1);
  assert.match(sent[0].body, /Own Co/);
});

test("the weekly summary leaves partner brands out, and skips a workspace that has only those", async () => {
  // Monday 10am UTC, when the summary goes out.
  mock.timers.enable({ apis: ["Date"], now: Date.parse("2026-11-16T10:00:00Z") });
  try {
    sent.length = 0;
    const WS2 = "22222222-2222-4222-8222-222222222222";
    const day = (d: string, brand: string, ws: string) => [
      { brand_id: brand, workspace_id: ws, day: d, engine: "ChatGPT", named: "", is_you: false, answers: 10, mentions: 0 },
      { brand_id: brand, workspace_id: ws, day: d, engine: "ChatGPT", named: "Brand", is_you: true, answers: 10, mentions: 4 },
    ];
    const C = { id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", name: "Second Partner Co", domain: "second.co" };
    const db = fakeDb({
      workspaces: [
        { id: WS, name: "Partner", timezone: "UTC" },
        { id: WS2, name: "Partner only", timezone: "UTC" },
      ],
      brands: [brandRow(A, [], "kp"), brandRow(B, [], null), { ...brandRow(C, [], "kp2"), workspace_id: WS2 }],
      workspace_members: [...people, { workspace_id: WS2, user_id: "u2", email: "other@partner.example", role: "owner" }],
      notification_prefs: [],
      email_log: [],
      runs: [],
      daily_metrics: [...day("2026-11-12", A.id, WS), ...day("2026-11-12", B.id, WS), ...day("2026-11-12", C.id, WS2)],
    });
    const out = await notify.sendWeekly(db as never);
    assert.equal(out.sent, 1);
    assert.equal(sent.length, 1);
    assert.match(sent[0].body, /Own Co/);
    assert.doesNotMatch(sent[0].body, /Acme Bakery|Second Partner Co/);
  } finally {
    mock.timers.reset();
  }
});

test("partner brands have no login: the partner API never adds members, invites or users", () => {
  const src = readFileSync(new URL("../src/lib/partnerApi.ts", import.meta.url), "utf8") + readFileSync(new URL("../src/lib/partnerConnect.ts", import.meta.url), "utf8");
  assert.doesNotMatch(src, /workspace_members|invites|auth\.admin|sendEmail|sendBuilt|emailTips|emailJob/);
});

test("getting-started tips and scheduled report emails check for partner brands before they send", () => {
  const nurture = readFileSync(new URL("../src/lib/nurture.ts", import.meta.url), "utf8");
  assert.match(nurture, /filter\(\(b\) => !isPartnerBrand\(b\)\)/);
  const schedules = readFileSync(new URL("../src/lib/scheduleServer.ts", import.meta.url), "utf8");
  const send = schedules.slice(schedules.indexOf("export async function reportSend"));
  const guard = send.indexOf("isPartnerBrand(");
  assert.ok(guard > 0 && guard < send.indexOf("await email(db"), "reportSend checks the brand before it emails");
});
