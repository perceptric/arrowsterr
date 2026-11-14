// Draft and Write, Phase 0 (docs/draft-and-write-build.md): run today's writer on the 20 recorded topics and save
// what it makes, with its score (src/lib/writerScore.ts). This is the baseline every later phase has to beat.
//
//   ANTHROPIC_API_KEY=... node scripts/writer-baseline.mjs [slug ...]     about $0.82 a topic (check)
//   node scripts/writer-baseline.mjs --fake [slug ...]                    no Claude: checks the wiring for free
//
// It runs the app's own brief and draft steps (runBrief, runDraft) with the same prompts, schemas, models and token
// limits as src/lib/writerServer.ts, on the recorded research instead of the database. Two things are left out:
// screenshots and drawn images (they need the worker), and reading each featured example's own page.
// Output: tests/fixtures/writer/baseline/<slug>.json, and summary.json with the totals. A topic already done is
// skipped, so a stopped run picks up where it left off.
import { mkdir, writeFile, access } from "node:fs/promises";
import Anthropic from "@anthropic-ai/sdk";
import { jsonrepair } from "jsonrepair";
import { BRIEF_SCHEMA, runBrief } from "../src/lib/writerBrief.ts";
import { NOTES_SCHEMA } from "../src/lib/articleNotes.ts";
import { CHECK_SCHEMA, runDraft, SECTION_SCHEMA } from "../src/lib/writerDraft.ts";
import { REVIEW_SCHEMA, STYLE_SYSTEM } from "../src/lib/writerStyle.ts";
import { MODULE_SCHEMA } from "../src/lib/writerModules.ts";
import { POLISH_SCHEMA, POLISH_SYSTEM, auditSection } from "../src/lib/writerPolish.ts";
import { isGrammarError, schemaPrompt } from "../src/lib/jsonReply.ts";
import { replyText, requestBody, thinkingFix } from "../src/lib/claudeRequest.ts";
import { scoreArticle, sumScores } from "../src/lib/writerScore.ts";
import { contextOf, loadFixture, packOf, recorded, topics } from "../tests/writerFixtures.ts";

// WRITER_OUT runs the same topics into another folder (Phase 2 writes tests/fixtures/writer/phase2), so the baseline stays.
const OUT = process.env.WRITER_OUT || "tests/fixtures/writer/baseline";
const args = process.argv.slice(2);
const FAKE = args.includes("--fake");
const only = args.filter((a) => !a.startsWith("--"));
const MODEL = process.env.WRITER_MODEL?.trim() || process.env.CLAUDE_MODEL || "claude-sonnet-5-5";
const usage = { calls: 0, input: 0, cacheRead: 0, cacheWrite: 0, output: 0 };

// ───── one Claude call, built by the app's own src/lib/claudeRequest.ts, read the way claude.ts reads it ─────
const client = FAKE ? null : new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, baseURL: process.env.WRITER_BASELINE_API || "https://api.anthropic.com" });
const tooBig = new WeakSet();
let off = "between_tools"; // how this model takes "thinking off" (src/lib/claudeRequest.ts)

function parseJson(text) {
  const t = text.replace(/```(?:json)?/g, "");
  const raw = t.slice(t.indexOf("{"), t.lastIndexOf("}") + 1);
  try {
    return JSON.parse(raw);
  } catch {
    return JSON.parse(jsonrepair(raw));
  }
}

async function ask(prompt, opts) {
  for (let tries = 0; ; tries++) {
    try {
      let msg;
      try {
        msg = await client.messages.create(requestBody(prompt, opts, MODEL, off));
      } catch (e) {
        const fix = opts.schema && e?.status === 400 ? thinkingFix(String(e?.message), off) : null;
        if (!fix) throw e;
        off = fix;
        msg = await client.messages.create(requestBody(prompt, opts, MODEL, off));
      }
      const u = msg.usage;
      usage.calls++;
      usage.input += u.input_tokens ?? 0;
      usage.cacheRead += u.cache_read_input_tokens ?? 0;
      usage.cacheWrite += u.cache_creation_input_tokens ?? 0;
      usage.output += u.output_tokens ?? 0;
      return replyText(msg);
    } catch (e) {
      // A hiccup (busy, rate limit, network, 5xx) is tried again with growing waits.
      const status = e?.status ?? 0;
      if (tries >= 4 || (status && status < 500 && status !== 429 && status !== 408) || /reply tokens/.test(String(e?.message))) throw e;
      await new Promise((r) => setTimeout(r, 2000 * 2 ** tries));
    }
  }
}

async function askJson(prompt, schema, opts) {
  if (FAKE) return fake(schema);
  if (!tooBig.has(schema)) {
    try {
      return parseJson(await ask(prompt, { ...opts, schema }));
    } catch (e) {
      if (!isGrammarError(e)) throw e;
      tooBig.add(schema);
    }
  }
  return parseJson(await ask(schemaPrompt(prompt, schema), opts));
}

// ───── --fake: a reply in the schema's shape, so the steps can run without Claude ─────
let n = 0;
function fake(schema) {
  if (!schema || typeof schema !== "object") return null;
  const type = Array.isArray(schema.type) ? schema.type[0] : schema.type;
  if (schema.enum) return schema.enum[0];
  if (type === "object" || schema.properties) {
    const out = {};
    for (const [k, v] of Object.entries(schema.properties ?? {})) out[k] = fake(v);
    return out;
  }
  if (type === "array") return [fake(schema.items), fake(schema.items)];
  if (type === "number" || type === "integer") return 1;
  if (type === "boolean") return false;
  return `Sample text ${++n} for the wiring check.`;
}

// ───── the app's deps (src/lib/writerServer.ts), on the recorded topic ─────
const exists = (p) => access(p).then(() => true, () => false);

async function run(t) {
  const file = `${OUT}/${t.slug}.json`;
  if (!FAKE && (await exists(file))) return console.log(`${t.slug}: already done`);
  const f = loadFixture(t.slug);
  const pack = packOf(f);
  const ctx = contextOf(f);
  const before = { ...usage };
  const started = Date.now();

  let brief = { id: "b1", workspace_id: "w", brand_id: null, site_id: "s", item_id: "i", keyword: f.keyword, research_run_id: null, status: "generating", step: "research", brief: null, notes: "", note: null, version: 1, error: null };
  const briefStore = { brief: async () => brief, update: async (_id, patch) => void (brief = { ...brief, ...patch }) };
  const briefDeps = {
    startResearch: async () => "recorded",
    runStatus: async () => ({ status: "done", error: null }),
    research: async () => pack,
    context: async () => ctx,
    write: (prefix, prompt, schema = BRIEF_SCHEMA) => askJson(prompt, schema, { prefix, maxTokens: 20000 }),
    ...(process.env.WRITER_NOTES ? { notes: (prefix, prompt) => askJson(prompt, NOTES_SCHEMA, { prefix, maxTokens: 8000 }) } : {}),
    model: MODEL,
  };
  for (let i = 0; i < 10; i++) {
    const out = await runBrief(briefStore, briefDeps, "b1");
    if (out.state === "failed") throw new Error(`brief: ${out.error}`);
    if (out.state === "done" && brief.status === "ready") break;
  }
  if (!brief.brief) throw new Error(`brief: not written (${brief.status}, ${brief.error ?? "no error"})`);

  let draft = { id: "d1", workspace_id: "w", brand_id: null, site_id: "s", item_id: "i", brief_id: "b1", doc_id: null, status: "generating", step: "sections", version: 1, note: null, sections: [], checked: null, check_at: null, modules: [], styled: null, images: null, period: "baseline", words: 0, error: null, ready_at: null };
  let doc = null;
  const draftStore = {
    draft: async () => draft,
    brief: async () => brief,
    update: async (_id, patch) => void (draft = { ...draft, ...patch }),
    saveDoc: async (_d, d) => ((doc = d), "doc1"),
  };
  const draftDeps = {
    context: async () => ({ ctx, pack }),
    writeSection: (prefix, prompt) => askJson(prompt, SECTION_SCHEMA, { prefix, maxTokens: 4000 }),
    check: (prefix, prompt) => askJson(prompt, CHECK_SCHEMA, { prefix, maxTokens: 3000 }),
    styleReview: (prefix, prompt) => askJson(prompt, REVIEW_SCHEMA, { system: STYLE_SYSTEM, prefix, maxTokens: 6000 }),
    styleFix: (prefix, prompt) => askJson(prompt, SECTION_SCHEMA, { system: STYLE_SYSTEM, prefix, maxTokens: 5000 }),
    ...(process.env.WRITER_OUT ? { polish: (prefix, prompt) => askJson(prompt, POLISH_SCHEMA, { system: POLISH_SYSTEM, prefix, maxTokens: 8000 }) } : {}),
    buildModule: (prefix, prompt) => askJson(prompt, MODULE_SCHEMA, { prefix, maxTokens: 12000 }),
    model: MODEL,
    budgetMs: 60 * 60_000,
  };
  for (let i = 0; i < 20 && draft.status === "generating"; i++) {
    const out = await runDraft(draftStore, draftDeps, "d1");
    if (out.state === "failed") throw new Error(`draft: ${out.error}`);
  }
  if (draft.status !== "ready") throw new Error(`draft: stopped at ${draft.step} (${draft.error ?? "no error"})`);

  const final = draft.checked?.sections ?? [];
  const score = scoreArticle(final, pack, {
    sitemap: ctx.sitemap,
    brandDomain: ctx.brand.domain,
    examples: brief.brief.examples ?? [],
    images: (brief.brief.images ?? []).length,
    modules: draft.modules.filter((m) => m?.status === "ok").length,
  });
  // No fact may change through the passes: each section as written against the same section after them.
  const written = draft.sections.filter(Boolean);
  const styledSecs = draft.styled?.sections ?? [];
  const names = [ctx.brand.name, ...(brief.brief.examples ?? []).map((e) => e.name)];
  const factChanges = written
    .map((w) => ({ w, a: styledSecs.find((x) => x.key === w.key) }))
    .filter(({ a }) => a)
    .map(({ w, a }) => ({ key: w.key, audit: auditSection(w, a, names) }))
    .filter((x) => x.audit.status === "BLOCK")
    .map((x) => ({ key: x.key, why: x.audit.reasons }));
  const spent = Object.fromEntries(Object.entries(usage).map(([k, v]) => [k, v - before[k]]));
  const result = { slug: t.slug, keyword: t.keyword, kind: t.kind, stage: t.stage, model: MODEL, at: new Date().toISOString(), seconds: Math.round((Date.now() - started) / 1000), usage: spent, score, title: doc?.title ?? null, brief: brief.brief, sections: final, cut: draft.checked?.cut ?? [], styleLeft: draft.styled?.left ?? [], proof: draft.styled?.proof ?? null, polish: draft.styled?.polish ? { applied: draft.styled.polish.applied.length, refused: draft.styled.polish.refused } : null, blocked: draft.styled?.blocked ?? [], tidied: draft.styled?.tidied ?? [], factChanges, modules: draft.modules.map((m) => ({ status: m?.status, error: m?.error ?? null })) };
  if (FAKE) {
    console.log(`${t.slug}: wiring ok, ${final.length} sections, brief ${brief.status}, draft ${draft.status}, ${spent.calls} calls`);
    return null;
  }
  await writeFile(file, JSON.stringify(result, null, 1) + "\n");
  console.log(`${t.slug}: ${score.words} words, ${score.lint} lint findings, proof ${result.proof?.verdict ?? "none"}, ${factChanges.length} fact changes, ${score.unsourced.length} of ${score.numbers} numbers unsourced, ${score.strayLinks.length} stray links, ${score.modules} modules, ${spent.calls} calls, ${result.seconds}s`);
  return result;
}

if (!FAKE && !process.env.ANTHROPIC_API_KEY) {
  console.error("Set ANTHROPIC_API_KEY, or run with --fake to check the wiring without Claude.");
  process.exit(2);
}
await mkdir(OUT, { recursive: true });
for (const t of topics().filter((x) => !only.length || only.includes(x.slug))) {
  if (!recorded(t.slug)) {
    console.log(`${t.slug}: not recorded yet, skipped`);
    continue;
  }
  try {
    await run(t);
  } catch (e) {
    console.log(`${t.slug}: failed, ${String(e?.message ?? e).slice(0, 400)}`);
    if (FAKE) process.exitCode = 1;
  }
}

if (!FAKE) {
  const { readdir, readFile } = await import("node:fs/promises");
  const done = [];
  for (const name of (await readdir(OUT)).filter((x) => x.endsWith(".json") && x !== "summary.json")) done.push(JSON.parse(await readFile(`${OUT}/${name}`, "utf8")));
  const summary = { model: MODEL, at: new Date().toISOString(), ...sumScores(done.map((d) => d.score)), byKind: Object.fromEntries(["saas", "store", "agency", "local", "publisher"].map((k) => [k, sumScores(done.filter((d) => d.kind === k).map((d) => d.score))])) };
  await writeFile(`${OUT}/summary.json`, JSON.stringify(summary, null, 1) + "\n");
  console.log(summary);
}
