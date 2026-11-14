// Draft and Write, Phase 1 (docs/draft-and-write-build.md): write the brief with fact notes and section cards on the
// 20 recorded topics, and check the done-when: every card has a job, points and only real fact ids, and every note's
// quote is on its page. Runs the app's own runBrief with the notes call, on the recorded research.
// Phase 3: each planned picker or calculator then gets its spec call (one retry with the reason), is built by code
// and run through validateModule.
// Needs ANTHROPIC_API_KEY. Prints one RESULT line per topic and a SUMMARY line. About $3 for all 20 (check).
//   node scripts/writer-notes.mjs [slug ...]
import Anthropic from "@anthropic-ai/sdk";
import { jsonrepair } from "jsonrepair";
import { BRIEF_SCHEMA, pickSources, runBrief } from "../src/lib/writerBrief.ts";
import { cardProblems, NOTES_SCHEMA } from "../src/lib/articleNotes.ts";
import { buildTemplate, isTemplate, specPrompt, specSchema } from "../src/lib/interactiveTemplates.ts";
import { validateModule } from "../src/lib/writerModules.ts";
import { loose } from "../src/lib/writerPersona.ts";
import { isGrammarError, schemaPrompt } from "../src/lib/jsonReply.ts";
import { replyText, requestBody, thinkingFix } from "../src/lib/claudeRequest.ts";
import { contextOf, loadFixture, packOf, topics } from "../tests/writerFixtures.ts";

const MODEL = process.env.WRITER_MODEL?.trim() || process.env.CLAUDE_MODEL || "claude-sonnet-5-5";
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const usage = { calls: 0, input: 0, cacheRead: 0, cacheWrite: 0, output: 0 };
let off = "between_tools";

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
      const status = e?.status ?? 0;
      if (tries >= 4 || (status && status < 500 && status !== 429 && status !== 408)) throw e;
      await new Promise((r) => setTimeout(r, 2000 * 2 ** tries));
    }
  }
}
const parse = (text) => {
  const t = text.replace(/```(?:json)?/g, "");
  const raw = t.slice(t.indexOf("{"), t.lastIndexOf("}") + 1);
  try {
    return JSON.parse(raw);
  } catch {
    return JSON.parse(jsonrepair(raw));
  }
};
async function askJson(prompt, schema, opts) {
  try {
    return parse(await ask(prompt, { ...opts, schema }));
  } catch (e) {
    if (!isGrammarError(e)) throw e;
    return parse(await ask(schemaPrompt(prompt, schema), opts));
  }
}

const only = process.argv.slice(2);
const totals = { topics: 0, passed: 0, notes: 0, dropped: 0, cards: 0, gaps: 0, cardsWithFacts: 0, problems: 0, missingQuotes: 0, failed: 0 };
for (const t of topics()) {
  if (only.length && !only.includes(t.slug)) continue;
  const before = { ...usage };
  try {
    const f = loadFixture(t.slug);
    const pack = packOf(f);
    const ctx = contextOf(f);
    let row = { id: "b1", workspace_id: "w", brand_id: null, site_id: "s", item_id: "i", keyword: f.keyword, research_run_id: "recorded", status: "generating", step: "writing", brief: null, notes: "", note: null, version: 1, error: null };
    const store = { brief: async () => row, update: async (_id, patch) => void (row = { ...row, ...patch }) };
    const deps = {
      startResearch: async () => "recorded",
      runStatus: async () => ({ status: "done", error: null }),
      research: async () => pack,
      context: async () => ctx,
      write: (prefix, prompt, schema = BRIEF_SCHEMA) => askJson(prompt, schema, { prefix, maxTokens: 20000 }),
      notes: (prefix, prompt) => askJson(prompt, NOTES_SCHEMA, { prefix, maxTokens: 8000 }),
      model: MODEL,
    };
    const out = await runBrief(store, deps, "b1");
    if (out.state !== "done" || !row.brief) throw new Error(out.error ?? row.error ?? "no brief");
    const b = row.brief;
    const sources = pickSources(pack.pages);
    const notes = b.notes ?? [];
    const cards = b.cards ?? [];
    // Every note's quote must be on the page it names (the same check cleanNotes makes, run again on what was saved).
    const missing = notes.filter((n) => !sources[n.source - 1] || !loose(sources[n.source - 1].body).includes(loose(n.quote))).map((n) => n.id);
    const problems = cards.length ? cardProblems(cards, { notes, keyword: f.keyword, h1: b.h1 }) : ["no cards"];
    const core = problems.filter((p) => /no job|no points|isn't a note|no cards/.test(p));
    const pass = core.length === 0 && missing.length === 0;
    // Phase 3: the templates, from the brief's cards (the draft's sections aren't written here).
    const templates = [];
    for (const m of b.modules.filter((x) => isTemplate(x.type))) {
      const card = cards.find((c) => c.h2.toLowerCase() === m.placement.toLowerCase());
      const picks = (b.examples ?? []).map((e) => e.name);
      const about = Object.fromEntries((b.examples ?? []).map((e) => [e.name, e.opener]));
      const headings = [b.h1, ...b.outline.map((o) => o.h2)];
      let error = null;
      let built = null;
      for (let tries = 0; tries < 2 && !built; tries++) {
        const raw = await askJson(specPrompt(m.type, m, { keyword: f.keyword, brand: ctx.brand.name, section: card ? `${card.h2}\n${card.points.join("\n")}` : "", notes, picks, headings }, error), specSchema(m.type), { prefix: `${row.keyword}`, maxTokens: 3000 });
        const t = buildTemplate(m.type, raw, { notes, picks, about, headings, sources: b.research.sources });
        const v = t.ok ? validateModule(t.html) : t;
        if (t.ok && v.ok) built = { tries: tries + 1, bytes: t.html.length, height: Number(t.html.match(/data-aw-h="(\d+)"/)?.[1]), text: t.text.map((x) => x.text || x.items.join(" | ")).join(" ").slice(0, 300) };
        else error = v.ok ? "" : v.error;
      }
      templates.push({ type: m.type, title: m.title, ...(built ?? { dropped: error }) });
    }
    totals.templates = (totals.templates ?? 0) + templates.length;
    totals.templatesBuilt = (totals.templatesBuilt ?? 0) + templates.filter((t) => !t.dropped).length;
    totals.templatesFirstTry = (totals.templatesFirstTry ?? 0) + templates.filter((t) => t.tries === 1).length;
    const spent = Object.fromEntries(Object.entries(usage).map(([k, v]) => [k, v - before[k]]));
    Object.assign(totals, {
      topics: totals.topics + 1,
      passed: totals.passed + (pass ? 1 : 0),
      notes: totals.notes + notes.length,
      dropped: totals.dropped + (b.notesDropped ?? 0),
      cards: totals.cards + cards.length,
      gaps: totals.gaps + cards.reduce((n, c) => n + c.gaps.length, 0),
      cardsWithFacts: totals.cardsWithFacts + cards.filter((c) => c.facts.length).length,
      problems: totals.problems + core.length,
      missingQuotes: totals.missingQuotes + missing.length,
    });
    console.log(`RESULT ${JSON.stringify({ slug: t.slug, pass, notes: notes.length, dropped: b.notesDropped ?? 0, cards: cards.length, withFacts: cards.filter((c) => c.facts.length).length, gaps: cards.flatMap((c) => c.gaps).slice(0, 4), job: b.job, pov: b.pov, leadingWord: b.leadingWord, shape: b.shape?.picked, problems, missing, templates, modules: b.modules.map((m) => m.type), usage: spent })}`);
  } catch (e) {
    totals.failed++;
    console.log(`RESULT ${JSON.stringify({ slug: t.slug, error: String(e?.message ?? e).slice(0, 300) })}`);
  }
}
const cost = (usage.input * 2 + usage.cacheRead * 0.2 + usage.cacheWrite * 2.5 + usage.output * 10) / 1e6;
console.log(`SUMMARY ${JSON.stringify({ ...totals, usage, cost: Math.round(cost * 100) / 100, perTopic: Math.round((cost / Math.max(1, totals.topics)) * 1000) / 1000 })}`);
console.log("STEP done");
