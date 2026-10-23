// Frozen copies of the Prompts and Competitors pages for a share link (docs/reports.md, section 32.7).
// Pure: the page passes its view (and the answer texts for Prompts); /r/[token] draws them with PromptsDoc and CompetitorsDoc.
import type { Run } from "./chats.ts";
import { answered, brandStats, promptDetail, promptRows, rankOf, topicRows, type Filter } from "./metrics.ts";
import type { CompetitorsSnapshot, PromptDetailSnap, PromptsSnapshot } from "./reportTypes.ts";

/** What a share needs from the page: the same view the page draws (View in view.ts, PdfView in pdf/pages.ts). */
export type ShareView = {
  brand: { name: string; domain: string; logo?: string | null };
  current: Run[];
  filter: Filter;
  topics: { name: string; prompts: string[] }[];
  engines: string[];
  days: number;
};
export type AnswerText = { prompt: string; engine: string; text: string };

/** The most brands a Competitors share holds, like the page (CompetitorsPage.tsx, MAX_BRANDS). */
export const SHARE_MAX_BRANDS = 50;
/** The largest snapshot the share route accepts. */
export const SHARE_MAX_BYTES = 3_000_000;

const brandOf = (b: ShareView["brand"]) => ({ name: b.name, domain: b.domain, ...(b.logo ? { logo: b.logo } : {}) });

/** The answers to fetch for a Prompts share start a day before the period's first run. undefined when there are none. */
export function answersSince(view: Pick<ShareView, "current">): string | undefined {
  const first = view.current.map((r) => r.at).sort()[0];
  return first ? new Date(Date.parse(first) - 864e5).toISOString() : undefined;
}

/** The Competitive analysis table: you, plus as many competitors as the plan tracks, as the page lists them. */
export function competitorsSnapshot(view: ShareView, limit?: number, now = Date.now()): CompetitorsSnapshot {
  const stats = brandStats(answered(view.current, view.filter), { name: view.brand.name, domain: view.brand.domain });
  const others = stats.filter((s) => !s.isYou);
  const top = stats.filter((s) => s.isYou || others.indexOf(s) < (limit ?? SHARE_MAX_BRANDS)).slice(0, SHARE_MAX_BRANDS);
  return {
    kind: "competitors",
    brand: brandOf(view.brand),
    days: view.days,
    at: new Date(now).toISOString(),
    rows: top.map((s) => ({ name: s.name, domain: s.domain, isYou: s.isYou, visibility: s.visibility, position: s.position, mentions: s.mentions })),
  };
}

/** The Prompts page: scores, topics by AI, and every prompt with each AI's latest answer for its deep dive. answers: newest first. */
export function promptsSnapshot(view: ShareView, answers: AnswerText[], now = Date.now()): PromptsSnapshot {
  const { brand, current, filter, topics, engines } = view;
  const you = { name: brand.name, domain: brand.domain };
  const chats = answered(current, filter);
  const stats = brandStats(chats, you);
  const me = stats.find((s) => s.isYou);
  const rank = rankOf(stats, "visibility");
  const rows = promptRows(current, topics, engines, brand.name, filter, brand.domain);
  const textOf = (prompt: string, engine: string) => answers.find((a) => a.prompt === prompt && a.engine === engine)?.text ?? "";
  const detail = (prompt: string): PromptDetailSnap[] =>
    promptDetail(current, prompt, engines, you, filter)
      .engines.filter((e) => e.answered)
      .map((e) => ({ engine: e.engine, at: e.at, rank: e.rank, sentiment: e.sentiment, brands: e.brands.slice(0, 15), sources: e.sources.slice(0, 10), text: textOf(prompt, e.engine).slice(0, 8000) }));
  return {
    kind: "prompts",
    brand: brandOf(brand),
    days: view.days,
    at: new Date(now).toISOString(),
    engines,
    scores: chats.length && me ? { visibility: me.visibility, sentiment: me.sentiment, position: me.position, rank: rank?.rank ?? null, of: rank?.of ?? null } : null,
    topics: topicRows(chats, topics, engines, brand.name).map((t) => ({
      name: t.topic,
      visibility: t.visibility,
      byEngine: t.byEngine,
      prompts: rows
        .filter((r) => r.topic === t.topic)
        .map((r) => ({ prompt: r.prompt, visibility: r.visibility, at: r.latestAt, ranks: Object.fromEntries(r.latest.map((c) => [c.engine, c.status === "named" ? c.position : null])), detail: detail(r.prompt) })),
    })),
  };
}

const size = (x: unknown) => new TextEncoder().encode(JSON.stringify(x)).length;

/** Keep a Prompts share under the route's limit: shorten the answer texts, then drop them. The numbers always stay. */
export function fitSnapshot<T extends PromptsSnapshot | CompetitorsSnapshot>(s: T, max = SHARE_MAX_BYTES): T {
  if (s.kind !== "prompts" || size(s) <= max) return s;
  const cut = (n: number): PromptsSnapshot => ({
    ...s,
    topics: s.topics.map((t) => ({ ...t, prompts: t.prompts.map((p) => ({ ...p, detail: p.detail?.map((d) => ({ ...d, text: d.text.slice(0, n) })) })) })),
  });
  for (const n of [2000, 500, 0]) {
    const out = cut(n);
    if (n === 0 || size(out) <= max) return out as T;
  }
  return s;
}

/** Why a snapshot sent to the share route can't be saved. null when it can. */
export function shareProblem(data: unknown, max = SHARE_MAX_BYTES): string | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return "Nothing to share.";
  const d = data as { kind?: unknown; brand?: { name?: unknown }; days?: unknown; at?: unknown; topics?: unknown; rows?: unknown };
  if (d.kind !== "prompts" && d.kind !== "competitors") return "Only the Prompts and Competitors pages can be shared.";
  if (!d.brand || typeof d.brand.name !== "string" || typeof d.days !== "number" || typeof d.at !== "string") return "Nothing to share.";
  if (d.kind === "prompts" && !Array.isArray(d.topics)) return "Nothing to share.";
  if (d.kind === "competitors" && !Array.isArray(d.rows)) return "Nothing to share.";
  if (size(data) > max) return "This page is too large to share. Pick a topic or a model and try again.";
  return null;
}
