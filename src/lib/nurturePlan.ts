// Which getting-started email a new workspace gets next, if any. Pure, so tests can walk every path.
// The sender (src/lib/nurture.ts) loads the state; the words live in src/lib/emails.ts. Plan: docs/emails.md.
//
// Day  Email       Sends when
// 0    welcome     15 minutes after the workspace is made
// 1    nobrand     still no brand
// 2    firstlook   the first answers are in
// 3    prompts     fewer than 10 prompts
// 4    (trial3)    the existing "3 days left" email (src/lib/nudges.ts)
// 5    plan        on the trial and no Content Plan yet
// 7+   trialover   the trial just ended and the workspace is on Free
// 14   upgrade     on Free and seen in the last 7 days
// 14   help        on Free and not seen in the last 7 days
// 21+  winback     not seen for 21 days, at most once every 90 days
//
// At most one of these a day, never on a day another app email went out, and only 9:00 to 18:00 in the workspace's
// time zone (the welcome goes out right away). Paying workspaces only get the setup emails.

import type { PlanId } from "./plans.ts";

export const NURTURE_STEPS = ["welcome", "nobrand", "firstlook", "prompts", "plan", "trialover", "upgrade", "help", "winback"] as const;
export type NurtureStep = (typeof NURTURE_STEPS)[number];

export type NurtureState = {
  /** Hours since the workspace was made. */
  ageHours: number;
  /** The plan in force now: a trial that ended counts as Free. */
  plan: PlanId;
  /** The plan column, which still says trial after a trial ends. */
  storedPlan: PlanId;
  /** Hours since the trial ended, or null when there's no ended trial. */
  trialEndedHours: number | null;
  brands: number;
  prompts: number;
  hasAnswers: boolean;
  contentPlans: number;
  /** Days since the person was last seen in the app, or null when never recorded. */
  idleDays: number | null;
  /** The hour now in the workspace's time zone, 0 to 23. */
  localHour: number;
  /** Steps already sent (winback only counts when sent in the last 90 days). */
  sent: ReadonlySet<string>;
  /** Another app email (a nurture step or trial3) went out to this workspace in the last 20 hours. */
  sentRecently: boolean;
};

const PAYING = new Set<PlanId>(["foundation", "scale", "agency", "enterprise", "thrive", "legacy"]);

export function pickStep(s: NurtureState): NurtureStep | null {
  const days = s.ageHours / 24;
  const due = (k: NurtureStep) => !s.sent.has(k);
  if (due("welcome") && s.ageHours >= 0.25 && days < 2) return "welcome";
  if (s.sentRecently || s.localHour < 9 || s.localHour >= 18) return null;

  if (due("nobrand") && s.brands === 0 && days >= 1 && days < 4) return "nobrand";
  if (due("firstlook") && s.brands > 0 && s.hasAnswers && days >= 2 && days < 6) return "firstlook";
  if (due("prompts") && s.brands > 0 && s.prompts < 10 && days >= 3 && days < 7) return "prompts";
  if (PAYING.has(s.plan)) return null;

  if (due("plan") && s.plan === "trial" && s.brands > 0 && s.contentPlans === 0 && days >= 5) return "plan";
  if (due("trialover") && s.plan === "free" && s.storedPlan === "trial" && s.trialEndedHours !== null && s.trialEndedHours < 72) return "trialover";
  if (s.plan === "free" && days >= 14 && days < 18 && due("upgrade") && due("help")) return s.idleDays !== null && s.idleDays <= 7 ? "upgrade" : "help";
  if (due("winback") && days >= 21 && s.hasAnswers && s.idleDays !== null && s.idleDays >= 21) return "winback";
  return null;
}

/** A few prompts worth tracking that the brand doesn't have yet, from its topics, buyers and competitors. */
export function promptIdeas(b: { name: string; topics: string[]; customers?: string | null; competitors: string[]; existing: string[]; year: number }): { prompt: string; stage: string }[] {
  const topic = b.topics.map((t) => t.trim().toLowerCase()).find((t) => t.length > 2 && t.length < 60);
  const buyer = (b.customers ?? "").split(/[,;]/)[0]?.trim().toLowerCase();
  const rival = b.competitors.map((c) => c.trim()).find((c) => c && c.toLowerCase() !== b.name.toLowerCase());
  const ideas: { prompt: string; stage: string }[] = [
    ...(topic && buyer && buyer.length < 50 ? [{ prompt: `best ${topic} for ${buyer}`, stage: "bofu" }] : []),
    ...(topic ? [{ prompt: `best ${topic} in ${b.year}`, stage: "bofu" }] : []),
    ...(rival ? [{ prompt: `${rival} alternatives`, stage: "bofu" }, { prompt: `${b.name} vs ${rival}`, stage: "mofu" }] : []),
    { prompt: `is ${b.name} worth it`, stage: "mofu" },
    ...(topic ? [{ prompt: `how to choose ${/^[aeiou]/.test(topic) ? "an" : "a"} ${topic.replace(/s$/, "")}`, stage: "tofu" }] : []),
  ];
  const have = new Set(b.existing.map((p) => p.trim().toLowerCase()));
  const seen = new Set<string>();
  return ideas.filter((i) => !have.has(i.prompt.toLowerCase()) && !seen.has(i.prompt) && seen.add(i.prompt)).slice(0, 4);
}

/** The items in a brand profile list, which is a comma-separated string or an array. */
export const listOf = (v: unknown): string[] =>
  (Array.isArray(v) ? v.map(String) : typeof v === "string" ? v.split(",") : []).map((x) => x.trim()).filter(Boolean);
