// Writer Phase 2b (docs/zippie-skills-plan.md): replay the new sentence-length steps on the 20 Phase 2 articles
// (tests/fixtures/writer/phase2), and report what the lint finds before and after each step:
//   A. today's lint (one sentence splitter that knows initials and abbreviations; a short line with a link is a CTA)
//   B. after tidy, which splits a long sentence at a semicolon or before ", and you/we/it/they ..."
//   C. after the length round: each section with a short or long sentence rewritten once with lengthPrompt, kept only
//      when the fact audit passes and the lint finds no more than before
// Needs ANTHROPIC_API_KEY. Prints one RESULT line per article and a SUMMARY line. About $3 for all 20 (check).
//   node scripts/writer-2b.mjs [slug ...]
import { readFileSync, readdirSync } from "node:fs";
import Anthropic from "@anthropic-ai/sdk";
import { jsonrepair } from "jsonrepair";
import { contextPrefix } from "../src/lib/writerBrief.ts";
import { briefText, claimLines, cleanSection, SECTION_SCHEMA, sourcesFor } from "../src/lib/writerDraft.ts";
import { findingsFor, lengthPrompt, STYLE_SYSTEM } from "../src/lib/writerStyle.ts";
import { lintDraft } from "../src/lib/houseRules.ts";
import { allowedTerms } from "../src/lib/houseLint.ts";
import { tidy } from "../src/lib/tidy.ts";
import { auditSection } from "../src/lib/writerPolish.ts";
import { isGrammarError, schemaPrompt } from "../src/lib/jsonReply.ts";
import { replyText, requestBody, thinkingFix } from "../src/lib/claudeRequest.ts";
import { contextOf, loadFixture, packOf } from "../tests/writerFixtures.ts";

const DIR = new URL("../tests/fixtures/writer/phase2/", import.meta.url).pathname;
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

const count = (secs, ex, allow) => {
  const all = lintDraft(secs, ex, allow);
  return { total: all.length, sentences: all.filter((f) => f.rule === "sentences").length };
};

const only = process.argv.slice(2);
const totals = { a: 0, b: 0, c: 0, aSent: 0, bSent: 0, cSent: 0, rewrites: 0, kept: 0, refused: 0, articles: 0 };
for (const file of readdirSync(DIR).filter((f) => f.endsWith(".json") && f !== "summary.json").sort()) {
  const d = JSON.parse(readFileSync(DIR + file, "utf8"));
  if (only.length && !only.includes(d.slug)) continue;
  const before = { ...usage };
  const ex = d.brief.examples ?? [];
  const allow = allowedTerms([d.keyword, ...ex.map((e) => e.name)]);
  const names = ex.map((e) => e.name);
  const f = loadFixture(d.slug);
  const pack = packOf(f);
  const prefix = `${contextPrefix(contextOf(f), pack, sourcesFor(d.brief, pack))}\n\n${briefText(d.brief, "")}`;
  const A = d.sections;
  const B = tidy(A).sections;
  const out = [...B];
  const findings = lintDraft(out, ex, allow).filter((x) => x.rule === "sentences");
  const lines = new Map(claimLines(out).map((l) => [l.id, l.text]));
  let rewrites = 0;
  let kept = 0;
  const refused = [];
  for (let si = 0; si < out.length; si++) {
    const mine = findingsFor(findings, si);
    if (!mine.length) continue;
    const sec = out[si];
    rewrites++;
    const raw = await askJson(lengthPrompt(sec, mine.map((x) => ({ ...x, text: lines.get(x.id) ?? "" }))), SECTION_SCHEMA, { system: STYLE_SYSTEM, prefix, maxTokens: 5000 });
    const fixed = cleanSection(raw, { key: sec.key, kind: sec.key === "intro" ? "intro" : "h2", h2: sec.h2, points: [], h3: [], sources: [], cta: false });
    const audit = fixed.blocks.length ? auditSection(sec, fixed, names) : { status: "BLOCK", reasons: ["empty"] };
    if (audit.status !== "BLOCK" && lintDraft([fixed], [], allow).length <= lintDraft([sec], [], allow).length) {
      out[si] = fixed;
      kept++;
    } else refused.push({ key: sec.key, why: audit.status === "BLOCK" ? audit.reasons.join("; ") : "lint found more" });
  }
  const C = tidy(out).sections;
  const [a, b, c] = [count(A, ex, allow), count(B, ex, allow), count(C, ex, allow)];
  const spent = Object.fromEntries(Object.entries(usage).map(([k, v]) => [k, v - before[k]]));
  Object.assign(totals, { a: totals.a + a.total, b: totals.b + b.total, c: totals.c + c.total, aSent: totals.aSent + a.sentences, bSent: totals.bSent + b.sentences, cSent: totals.cSent + c.sentences, rewrites: totals.rewrites + rewrites, kept: totals.kept + kept, refused: totals.refused + refused.length, articles: totals.articles + 1 });
  console.log(`RESULT ${JSON.stringify({ slug: d.slug, lint: { a, b, c }, rewrites, kept, refused, left: lintDraft(C, ex, allow).map((x) => `${x.why}: ${lines.get(x.id)?.slice(0, 100) ?? x.id}`).slice(0, 8), usage: spent })}`);
}
const cost = (usage.input * 2 + usage.cacheRead * 0.2 + usage.cacheWrite * 2.5 + usage.output * 10) / 1e6;
console.log(`SUMMARY ${JSON.stringify({ ...totals, perArticle: { a: totals.a / totals.articles, b: totals.b / totals.articles, c: totals.c / totals.articles }, usage, cost: Math.round(cost * 100) / 100 })}`);
console.log("STEP done");
