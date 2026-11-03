import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { askJson } from "./claude";
import type { Chat } from "./chats";
import { askPlain, availableEngines, type Engine } from "./engines";
import { entitlement } from "./entitlements";
import { finish, rateOk, retry, type Job } from "./jobs";
import { brandTerms } from "./parse";
import { brandMatch, checkWords, cleanWordList, NOT_KNOWN, PERCEPTION_VERSION, type BrandMatch, type PerceptionSetup, type PerceptionWord, type WordHit } from "./perception";

// Perception (docs/perception.md): the word list, reading words from answers, and the weekly direct questions.

const haiku = () => process.env.EXTRACT_MODEL || "claude-haiku-5-5";
const BATCH = 12; // answers read per job run, so a long run never outlives its lease
const RIVALS = 5; // brands judged besides the tracked one: the ones the run's answers name most

// ─────────────── the word list ───────────────

const LIST_PROMPT = (b: { name: string; domain: string; category: string; topics: string[]; rivals: string[] }) => `Pick the words Arrowsterr will use to describe brands in one market. Every brand gets scored on the same words, so they must fit any brand in this market.

THE MARKET
${b.name} (${b.domain})${b.category ? `: ${b.category}` : ""}.
Topics: ${b.topics.join("; ") || "(none yet)"}.
Brands AI names next to it: ${b.rivals.join(", ") || "(none yet)"}.

Write exactly 10 single-word adjectives a buyer uses to judge this kind of product or service: 7 good and 3 bad. Plain words, no jargon, no two words meaning the same thing ("Affordable" and "Cheap" can't both be there). Give each a short definition a labeler can apply.`;

const LIST_SCHEMA = {
  type: "object",
  properties: { words: { type: "array", items: { type: "object", properties: { word: { type: "string" }, good: { type: "boolean" }, definition: { type: "string" } }, required: ["word", "good", "definition"], additionalProperties: false } } },
  required: ["words"],
  additionalProperties: false,
};

/** The brand's word list. Made once with Haiku when it's missing, then kept until someone edits it. */
export async function wordsFor(db: SupabaseClient, brandId: string): Promise<PerceptionWord[] | null> {
  const { data: b } = await db.from("brands").select("name, domain, category, topics, perception").eq("id", brandId).maybeSingle();
  if (!b) return null;
  const saved = (b.perception as PerceptionSetup | null)?.words;
  if (saved?.length) return saved;
  const { data: metrics } = await db.from("daily_metrics").select("named, mentions").eq("brand_id", brandId).eq("is_you", false).neq("named", "").gte("day", new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10)).limit(5000);
  const rivals = topNames(((metrics ?? []) as { named: string; mentions: number }[]).map((m) => [m.named, m.mentions]), 8);
  const topics = ((b.topics ?? []) as { name?: string }[]).map((t) => t.name ?? "").filter(Boolean);
  for (let i = 0; i < 2; i++) {
    const words = cleanWordList(await askJson(LIST_PROMPT({ name: b.name, domain: b.domain, category: b.category ?? "", topics, rivals }), LIST_SCHEMA, { model: haiku(), maxTokens: 1500, effort: "low" }).catch(() => null));
    if (words) {
      const setup: PerceptionSetup = { words, madeAt: new Date().toISOString() };
      await db.from("brands").update({ perception: setup }).eq("id", brandId);
      return words;
    }
  }
  return null;
}

const topNames = (pairs: [string, number][], n: number) => {
  const sum = new Map<string, number>();
  for (const [name, k] of pairs) sum.set(name, (sum.get(name) ?? 0) + k);
  return [...sum.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([name]) => name);
};

// ─────────────── reading words from one answer ───────────────

const READ_PROMPT = (words: PerceptionWord[], prompt: string, text: string, brands: string[]) => `You read one AI answer and judge how it portrays each brand listed under BRANDS TO JUDGE.

WORDS (use only these, spelled exactly):
${words.map((w) => `- ${w.word} (${w.good ? "good" : "bad"}): ${w.definition}`).join("\n")}

QUESTION ASKED: ${prompt}

ANSWER:
"""
${text.slice(0, 15000)}
"""

BRANDS TO JUDGE: ${brands.join(", ")}

For each brand, pick the words the answer clearly supports for THAT brand. Up to 5, strongest first. For each word, copy the shortest exact phrase from the answer that shows it: 3 to 25 words, copied character for character (you may leave out markdown symbols like ** or #).

Rules:
- Judge only what the answer says about that brand. "Jobber is cheaper than HubSpot" supports a good price word for Jobber and nothing for HubSpot.
- The question asked never counts. "cheaper alternatives to HubSpot" doesn't make HubSpot costly.
- Naming a brand in a list, with no comment, supports nothing.
- A hedge still counts: "can get pricey" supports the bad word for cost.
- When unsure, leave the word out. A missing word is better than a wrong one.
- If the answer says it doesn't know the brand, give it no words.
Include every brand, with "words": [] when none fit.`;

const READ_SCHEMA = {
  type: "object",
  properties: {
    brands: {
      type: "array",
      items: {
        type: "object",
        properties: { name: { type: "string" }, words: { type: "array", items: { type: "object", properties: { word: { type: "string" }, quote: { type: "string" } }, required: ["word", "quote"], additionalProperties: false } } },
        required: ["name", "words"],
        additionalProperties: false,
      },
    },
  },
  required: ["brands"],
  additionalProperties: false,
};

/** Haiku picks words with quotes, then code keeps only the ones it can prove (checkWords). */
async function readWords(words: PerceptionWord[], a: { text: string; prompt: string; source: "buyer" | "direct" }, matches: BrandMatch[], judge: string[]): Promise<Map<string, WordHit[]>> {
  const reply = await askJson<{ brands?: { name?: string; words?: unknown }[] }>(READ_PROMPT(words, a.prompt, a.text, judge), READ_SCHEMA, { model: haiku(), maxTokens: 2500, effort: "low" });
  const out = new Map<string, WordHit[]>(judge.map((n) => [n, []]));
  for (const b of reply.brands ?? []) {
    const name = judge.find((n) => n.toLowerCase() === String(b?.name ?? "").trim().toLowerCase());
    if (!name) continue;
    const { kept, dropped } = checkWords({ ...a, brand: name, brands: matches, words }, b.words);
    if (dropped.length) console.info(`Perception dropped ${dropped.length} word(s) for ${name}:`, dropped.map((d) => `${d.word}: ${d.why}`).join("; "));
    out.set(name, kept);
  }
  return out;
}

// ─────────────── job: read a finished run's answers ───────────────

type ReadPayload = { runId: string; offset?: number };

export async function perceptionRun(db: SupabaseClient, job: Job) {
  const p = job.payload as unknown as ReadPayload;
  const offset = p.offset ?? 0;
  const { data: run } = await db.from("runs").select("id, workspace_id, brand_id, at, chats").eq("id", p.runId).maybeSingle();
  if (!run) return finish(job.id);
  const { data: brand } = await db.from("brands").select("name, domain").eq("id", run.brand_id).maybeSingle();
  const words = brand ? await wordsFor(db, run.brand_id) : null;
  if (!brand || !words) {
    await db.from("runs").update({ perception_read: PERCEPTION_VERSION }).eq("id", run.id);
    return finish(job.id);
  }
  // Judge the tracked brand and the brands this run's answers name most.
  const chats = (run.chats ?? []) as Chat[];
  const own = brand.name.toLowerCase();
  const rivals = topNames(chats.flatMap((c) => (c.brands ?? []).filter((b) => b.name.toLowerCase() !== own).map((b) => [b.name, 1] as [string, number])), RIVALS);
  const matches = [brandMatch(brand.name, brandTerms(brand.name, brand.domain)), ...rivals.map((r) => brandMatch(r))];
  const { data: answers } = await db.from("answers").select("engine, prompt, text").eq("run_id", run.id).order("id").range(offset, offset + BATCH - 1);
  const list = (answers ?? []) as { engine: string; prompt: string; text: string }[];
  // A run from the browser saves its answers when it ends. Wait for them rather than marking an empty run as read.
  if (!list.length && offset === 0 && Date.now() - new Date(run.at).getTime() < 6 * 3600_000) return retry(job.id, "waiting for answers", 1800, { count: false });

  const rows: Record<string, unknown>[] = [];
  const save = async () => {
    if (!rows.length) return;
    const { error } = await db.from("perception_reads").upsert(rows.splice(0), { onConflict: "run_id,engine,prompt,named", ignoreDuplicates: true });
    if (error) throw new Error(error.message);
  };
  for (const [i, a] of list.entries()) {
    const named = matches.filter((m) => m.re.test(a.text)).map((m) => m.name);
    if (!named.length) continue;
    // Keep what this batch already read, then come back for the rest.
    if (!(await rateOk("anthropic"))) {
      await save();
      return retry(job.id, "rate limit", 15, { payload: { ...p, offset: offset + i }, count: false });
    }
    const found = await readWords(words, { text: a.text, prompt: a.prompt, source: "buyer" }, matches, named);
    for (const [name, hits] of found) rows.push({ workspace_id: run.workspace_id, brand_id: run.brand_id, run_id: run.id, source: "buyer", at: run.at, engine: a.engine, prompt: a.prompt, named: name, words: hits });
  }
  await save();
  // More answers left: come back for the next batch without using up an attempt.
  if (list.length === BATCH) return retry(job.id, "next batch", 1, { payload: { ...p, offset: offset + BATCH }, count: false });
  await db.from("runs").update({ perception_read: PERCEPTION_VERSION }).eq("id", run.id);
  await finish(job.id);
}

// ─────────────── job: the weekly direct questions ───────────────

export const DIRECT_QUESTIONS = [
  { kind: "describe" as const, ask: (b: string) => `Describe ${b} in a few words. What is it, and what is it known for?` },
  { kind: "objections" as const, ask: (b: string) => `Why might someone decide not to choose ${b}?` },
];
const DIRECT_ENGINES: Engine[] = ["ChatGPT", "Gemini", "Perplexity", "Claude", "AI Mode"];
const DIRECT_RIVALS = 3;

type ProbePayload = { brandId: string; step?: number; targets?: { name: string; domain: string }[] };

/** One brand, or one of its top rivals, per job run: each direct question on each engine. Paid plans only. */
export async function perceptionProbe(db: SupabaseClient, job: Job) {
  const p = job.payload as unknown as ProbePayload;
  const { data: brand } = await db.from("brands").select("id, workspace_id, name, domain").eq("id", p.brandId).maybeSingle();
  if (!brand) return finish(job.id);
  const e = await entitlement(brand.workspace_id);
  if (e.readOnly || e.plan === "free") return finish(job.id);
  const words = await wordsFor(db, brand.id);
  if (!words) return finish(job.id);
  let targets = p.targets;
  if (!targets) {
    const { data: metrics } = await db.from("daily_metrics").select("named, mentions").eq("brand_id", brand.id).eq("is_you", false).neq("named", "").gte("day", new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10)).limit(5000);
    const rivals = topNames(((metrics ?? []) as { named: string; mentions: number }[]).map((m) => [m.named, m.mentions]), DIRECT_RIVALS);
    targets = [{ name: brand.name, domain: brand.domain }, ...rivals.map((name) => ({ name, domain: "" }))];
  }
  const step = p.step ?? 0;
  const target = targets[step];
  if (!target) return finish(job.id);
  const engines = availableEngines().filter((en) => DIRECT_ENGINES.includes(en) && (!e.limits.engines || e.limits.engines.includes(en)));
  const label = target.domain ? `${target.name} (${target.domain})` : target.name;
  const match = target.domain ? brandMatch(target.name, brandTerms(target.name, target.domain)) : brandMatch(target.name);
  const at = new Date().toISOString();
  const rows: Record<string, unknown>[] = [];
  for (const engine of engines) {
    for (const q of DIRECT_QUESTIONS) {
      const prompt = q.ask(label);
      let text = "";
      try {
        text = (await askPlain(engine, prompt)).text;
      } catch (err) {
        console.error(`Direct question on ${engine} failed:`, err instanceof Error ? err.message : err);
        continue;
      }
      if (!text.trim()) continue;
      const unknown = NOT_KNOWN.test(text);
      const hits = unknown ? [] : ((await readWords(words, { text, prompt, source: "direct" }, [match], [target.name]).catch(() => null))?.get(target.name) ?? []);
      rows.push({ workspace_id: brand.workspace_id, brand_id: brand.id, source: "direct", kind: q.kind, at, engine, prompt, named: target.name, words: hits, unknown, answer: text.slice(0, 20000) });
    }
  }
  if (rows.length) {
    const { error } = await db.from("perception_reads").insert(rows);
    if (error) throw new Error(error.message);
  }
  if (step + 1 < targets.length) return retry(job.id, "next brand", 1, { payload: { ...p, targets, step: step + 1 }, count: false });
  await finish(job.id);
}
