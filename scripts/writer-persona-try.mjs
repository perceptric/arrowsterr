// Try the writer persona (docs/zippie-skills-plan.md, section 4) on real brands, outside the app: read each site the
// way onboarding does, make the same Claude call, and report how many proof lines survived the quote check and
// whether the sample paragraph passes the house rules. Needs ANTHROPIC_API_KEY. Run with the app's dependencies:
//   node scripts/writer-persona-try.mjs perceptric.com ahrefs.com
// Prints one JSON line per brand (RESULT ...) so it can run in a one-off container and report through its logs.
import { createRequire } from "node:module";
import Anthropic from "@anthropic-ai/sdk";
import { jsonrepair } from "jsonrepair";
import { createJiti } from "jiti";

const require = createRequire(import.meta.url);
const root = new URL("..", import.meta.url).pathname;
const jiti = createJiti(import.meta.url, { alias: { "server-only": require.resolve("./empty.cjs"), "@": `${root}src` } });
const { readPersonaSources } = await jiti.import(`${root}src/lib/writerPersonaRead.ts`);
const P = await jiti.import(`${root}src/lib/writerPersona.ts`);
const { requestBody, replyText, thinkingFix } = await jiti.import(`${root}src/lib/claudeRequest.ts`);
const { isGrammarError, schemaPrompt } = await jiti.import(`${root}src/lib/jsonReply.ts`);

const MODEL = process.env.CLAUDE_MODEL || "claude-sonnet-5-5";
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const usage = { input: 0, output: 0 };
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
      usage.input += msg.usage.input_tokens ?? 0;
      usage.output += msg.usage.output_tokens ?? 0;
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

for (const domain of process.argv.slice(2)) {
  const t = Date.now();
  try {
    const { sources, posts } = await readPersonaSources(domain);
    const stats = P.voiceStats(posts);
    const before = { ...usage };
    const raw = await askJson(P.personaPrompt({ name: domain.split(".")[0], domain }, sources, stats), P.PERSONA_SCHEMA, { maxTokens: 4000 });
    const persona = P.cleanPersona(raw, sources);
    const problems = P.sampleProblems(persona.sample, sources);
    let fixed = null;
    if (problems.length) {
      const text = (await ask(P.fixSamplePrompt(persona, problems), { maxTokens: 800 })).trim();
      fixed = { text, problems: P.sampleProblems(text, sources) };
    }
    const result = {
      domain,
      seconds: Math.round((Date.now() - t) / 1000),
      sources: sources.map((s) => `${s.kind} ${s.url}`),
      posts: stats.posts,
      proofProposed: Array.isArray(raw.proof) ? raw.proof.length : 0,
      proofKept: persona.proof.length,
      proofDropped: (raw.proof ?? []).filter((p) => !persona.proof.some((k) => k.claim === String(p.claim).trim())).map((p) => p.quote),
      sampleProblems: problems,
      fixed,
      tokens: { input: usage.input - before.input, output: usage.output - before.output },
      persona,
    };
    console.log(`RESULT ${JSON.stringify(result)}`);
  } catch (e) {
    console.log(`RESULT ${JSON.stringify({ domain, error: e instanceof Error ? e.message : String(e) })}`);
  }
}
console.log(`DONE ${JSON.stringify(usage)}`);
