// How an article stands against the prompts a brand tracks (the AI answers tab in Drafts). Two plain checks, no AI:
//   which tracked prompts are about the article's topic (they share its main words), and how much of each prompt the
//   article covers (the share of the prompt's main words found in the text). Beside each prompt, the latest run says
//   which AI engines cited the brand's site or named the brand for it. Pure, shared by the browser and tests.
import type { Chat } from "./chats.ts";

const STOP = new Set(
  "a an and are as at be best by can do does for from get good how i in is it its me my of on or our should that the their them there these this to us vs versus was what when where which who why will with you your top most more much many any about into than then also".split(
    " ",
  ),
);

/** The main words of a text: lowercase, no stop words, plurals folded ("scores" → "score"). */
export function terms(text: string): string[] {
  const out = new Set<string>();
  for (const raw of text.toLowerCase().match(/[a-z0-9][a-z0-9'-]*/g) ?? []) {
    const b = raw.replace(/'s$/, "");
    const w = b.length < 4 ? b : /ies$/.test(b) ? `${b.slice(0, -3)}y` : /sses$/.test(b) ? b.slice(0, -2) : /(ss|us|is)$/.test(b) ? b : b.replace(/s$/, "");
    if (w.length > 1 && !STOP.has(w)) out.add(w);
  }
  return [...out];
}

/** How closely a prompt is about the topic: the share of the prompt's main words that are in the topic's. */
export function relevance(prompt: string, topic: string): number {
  const p = terms(prompt);
  if (!p.length) return 0;
  const t = new Set(terms(topic));
  return p.filter((w) => t.has(w)).length / p.length;
}

export type Coverage = { found: string[]; missing: string[]; state: "answered" | "partly" | "missing" };

/** How much of a prompt the article covers: the prompt's main words that appear in its text. */
export function coverage(prompt: string, articleText: string): Coverage {
  const p = terms(prompt);
  const t = new Set(terms(articleText));
  const found = p.filter((w) => t.has(w));
  const missing = p.filter((w) => !t.has(w));
  const share = p.length ? found.length / p.length : 0;
  return { found, missing, state: share >= 0.85 ? "answered" : share >= 0.5 ? "partly" : "missing" };
}

export type Citation = { engine: string; cited: boolean; named: boolean };

const hostOf = (d: string) =>
  d
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/[/?#].*$/, "");

/** For one prompt, each engine in the latest run that asked it: did the answer cite the brand's site, or name it. */
export function citations(runs: { at: string; chats: Chat[] }[], prompt: string, brand: { name: string; domain: string }): { at: string | null; engines: Citation[] } {
  const key = prompt.trim().toLowerCase();
  const host = hostOf(brand.domain);
  const name = brand.name.trim().toLowerCase();
  for (let i = runs.length - 1; i >= 0; i--) {
    const chats = runs[i].chats.filter((c) => c.prompt.trim().toLowerCase() === key && !c.error);
    if (!chats.length) continue;
    const engines = chats.map((c) => ({
      engine: c.engine,
      cited: Boolean(host) && c.sources.some((s) => {
        const h = hostOf(s.domain || s.url);
        return h === host || h.endsWith(`.${host}`);
      }),
      named: Boolean(name) && c.brands.some((b) => b.name.trim().toLowerCase() === name),
    }));
    return { at: runs[i].at, engines };
  }
  return { at: null, engines: [] };
}

/** The tracked prompts about this article, closest first. */
export function promptsFor(prompts: string[], topic: string, min = 0.5): { prompt: string; score: number }[] {
  return prompts
    .map((prompt) => ({ prompt, score: relevance(prompt, topic) }))
    .filter((p) => p.score >= min)
    .sort((a, b) => b.score - a.score);
}
