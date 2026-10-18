// The keyword-to-content workflow: where a piece stands, what its Library documents show,
// and the insights the Keyword Deep Dive draws from data already saved. Pure functions, shared by the browser and tests.
import type { Brief, Serp } from "./briefTypes.ts";

export const WORKFLOW = [
  { id: "planned", label: "Planned" },
  { id: "brief", label: "Brief" },
  { id: "draft", label: "Draft" },
  { id: "review", label: "Review" },
  { id: "published", label: "Published" },
] as const;
export type WorkflowStep = (typeof WORKFLOW)[number]["id"];

type Piece = {
  keyword: string;
  status: "planned" | "brief" | "writing" | "review" | "published";
  brief_status: "running" | "done" | "failed" | null;
  stage: "bofu" | "mofu" | "tofu" | null;
  intent: string | null;
  difficulty: number | null;
  secondary: string[];
  action: "new" | "update";
  current_rank: number | null;
};

/**
 * Where a piece stands, from its real records: a saved brief, a saved draft, and the status a person set.
 * Review counts only once a draft exists. Published always wins.
 */
export function workflowStep(i: Pick<Piece, "status" | "brief_status">, hasDraft: boolean): WorkflowStep {
  if (i.status === "published") return "published";
  if (hasDraft) return i.status === "review" ? "review" : "draft";
  if (i.brief_status === "done") return "brief";
  return "planned";
}

/** The status a piece gets when its work moves on. Never moves a piece back, and never past Review on its own. */
export function statusAfter(current: Piece["status"], event: "brief" | "draft"): Piece["status"] {
  const order: Piece["status"][] = ["planned", "brief", "writing", "review", "published"];
  const next = event === "brief" ? "brief" : "writing";
  return order.indexOf(next) > order.indexOf(current) ? next : current;
}

export type DocState = { label: string; tone: "pending" | "warn" | "ranked" | "missed" };

/** The brief's state in the Library. */
export function briefState(i: Pick<Piece, "brief_status">): DocState {
  if (i.brief_status === "done") return { label: "Ready to edit", tone: "ranked" };
  if (i.brief_status === "running") return { label: "Generating", tone: "warn" };
  if (i.brief_status === "failed") return { label: "Failed", tone: "missed" };
  return { label: "Not generated", tone: "pending" };
}

/** The draft's state in the Library. */
export function draftState(i: Pick<Piece, "status">, draft: { words: number } | null): DocState {
  if (!draft) return { label: "Not generated", tone: "pending" };
  if (i.status === "published") return { label: "Published", tone: "ranked" };
  if (i.status === "review") return { label: "In review", tone: "warn" };
  return { label: draft.words ? "Draft" : "Empty", tone: "warn" };
}

export type Insight = { id: "intent" | "serp" | "type" | "gap" | "related"; title: string; text: string };

const INTENT: Record<string, string> = {
  commercial: "Buyers comparing options",
  transactional: "Ready to buy or sign up",
  informational: "Learning about the topic",
  navigational: "Looking for a brand or page",
};
const STAGE: Record<string, string> = { bofu: "bottom of the funnel", mofu: "middle of the funnel", tofu: "top of the funnel" };

/** How hard the keyword is, in words. */
export function competition(kd: number | null): string | null {
  if (kd === null || kd === undefined) return null;
  return kd >= 70 ? "Very high competition" : kd >= 50 ? "High competition" : kd >= 30 ? "Medium competition" : "Low competition";
}

/** The page type the keyword calls for: the brief's choice, else a rule from the words in the keyword and its stage. */
export function pageType(keyword: string, stage: Piece["stage"], brief: Brief | null): string {
  if (brief?.analysis.format) return brief.analysis.format;
  const k = keyword.toLowerCase();
  if (/\b(alternatives?|vs|versus|compare|comparison)\b/.test(k)) return "Comparison";
  if (/\b(best|top \d+|top)\b/.test(k)) return "Listicle";
  if (/\bhow (to|do)\b/.test(k)) return "How-to guide";
  if (/\b(what is|what are|meaning|definition)\b/.test(k)) return "Explainer";
  if (/\b(pricing|price|cost)\b/.test(k)) return "Pricing page";
  if (/\b(template|example|examples)\b/.test(k)) return "Template or examples page";
  return stage === "bofu" ? "Product or landing page" : stage === "mofu" ? "Guide" : "Blog post";
}

const uniq = (xs: string[]) => [...new Set(xs.map((x) => x.trim()).filter(Boolean))];

/** Optimization insights from data already saved on the piece: its numbers, its SERP analysis and its brief. Nothing is made up. */
export function insights(i: Piece, serp: Serp | null, brief: Brief | null): Insight[] {
  const out: Insight[] = [];
  const intent = i.intent?.toLowerCase() ?? "";
  if (intent || i.stage) {
    out.push({
      id: "intent",
      title: intent ? `${intent[0].toUpperCase()}${intent.slice(1)} intent` : "Search intent",
      text: [INTENT[intent], i.stage ? STAGE[i.stage] : null].filter(Boolean).join(", ") || "–",
    });
  }
  const pages = serp?.pages ?? brief?.serp.pages ?? [];
  const comp = competition(i.difficulty);
  if (comp || pages.length) {
    const top = uniq(pages.slice(0, 3).map((p) => p.domain.replace(/^www\./, "")));
    out.push({ id: "serp", title: "Competitive SERP", text: [comp, top.length ? `top sites: ${top.join(", ")}` : null].filter(Boolean).join(", ") });
  }
  out.push({ id: "type", title: "Recommended page type", text: pageType(i.keyword, i.stage, brief) });
  const gaps = brief?.analysis.gaps ?? [];
  if (gaps.length) out.push({ id: "gap", title: "Content gap", text: gaps.slice(0, 2).join(". ") });
  const related = uniq([...i.secondary, ...(serp?.related ?? brief?.serp.related ?? [])]).slice(0, 4);
  if (related.length) out.push({ id: "related", title: "Related keywords", text: related.join(", ") });
  return out;
}

/** SEO recommendations from the same data. At most six, the most specific first. */
export function recommendations(i: Piece, serp: Serp | null, brief: Brief | null): string[] {
  const s = serp ?? brief?.serp ?? null;
  const k = i.keyword.toLowerCase();
  const out: string[] = [];
  if (i.action === "update" && i.current_rank) out.push(`Update the page that ranks #${i.current_rank} instead of starting a new one.`);
  out.push(`Use "${i.keyword}" in the title tag, meta description and H1.`);
  const read = (s?.pages ?? []).filter((p) => p.read && p.words > 0);
  if (read.length >= 3) {
    const avg = Math.round(read.reduce((n, p) => n + p.words, 0) / read.length / 100) * 100;
    if (avg > 0) out.push(`Aim for about ${avg.toLocaleString("en-US")} words, like the top pages.`);
  }
  if (/\b(alternatives?|vs|versus|compare|comparison|best)\b/.test(k)) out.push("Add a comparison table.");
  if (s?.questions.length) out.push(`Add an FAQ. Start with: ${s.questions[0]}`);
  if (s?.aiOverview.shown) out.push("Google shows an AI Overview here. Answer the question in the first 2 sentences.");
  if (s?.features.some((f) => /snippet/i.test(f))) out.push("Answer the keyword in 40 to 60 words near the top to win the featured snippet.");
  for (const tip of brief?.brief.aiTips ?? []) out.push(tip);
  out.push("Link to related pages on your site.");
  return uniq(out).slice(0, 6);
}

/** Keep only the tags a draft uses. Scripts, styles, classes and event handlers go. */
export function cleanDraftHtml(raw: string): string {
  const t = raw.replace(/```(?:html)?/g, "");
  const start = t.search(/<(h1|h2|p|ul|ol|table)\b/i);
  return (start >= 0 ? t.slice(start) : t)
    .replace(/<(script|style|iframe|object|embed)[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<(script|style|iframe|object|embed)[^>]*\/?>/gi, "")
    .replace(/\s(on\w+|class|style|id)="[^"]*"/gi, "")
    .replace(/href="\s*javascript:[^"]*"/gi, 'href="#"')
    .trim();
}
