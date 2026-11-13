// What every system skill is made of, and the rules several share (docs/zippie-skills-plan.md, section 3). Each skill
// is one SKILL.md body in the Agent Skills format: when to use it and when not to, the steps with the tool each uses,
// the hard calls, the shape of the answer and the rules.

import type { Speed } from "../format.ts";

export const GROUPS = [
  { key: "tech", label: "Technical SEO" },
  { key: "links", label: "Internal linking" },
  { key: "page", label: "On-page" },
  { key: "ai", label: "AI visibility" },
  { key: "research", label: "Research and reports" },
  { key: "writing", label: "Writing" },
  { key: "helpers", label: "Helpers" },
] as const;
export type Group = (typeof GROUPS)[number]["key"];

export type Def = {
  slug: string;
  title: string;
  group: Group;
  speed: Speed;
  result: string;
  ready: boolean;
  tools: string[];
  /** What it does, the words people use when they want it ("Use it when..."), and what it's for. Under 1,000 characters. */
  description: string;
  /** The SKILL.md body after the title: plain markdown. */
  body: string;
  files?: Record<string, string>;
};

export const BASE_RULES = [
  "Use only what the tools, Knowledge and the person give you. Say so when something isn't found, and never fill a gap with a guess.",
  "Nothing changes on a site until the person approves it: site changes go through propose_changes as a review card.",
  "Write in plain words, at a 9th grade reading level, in the brand's voice from Knowledge (Persona) when there is one.",
];

/** Every tool a system skill may name. tests/skills.test.ts checks each one against Zippie's tools. */
export const SKILL_TOOLS = [
  "list_brands",
  "get_ai_visibility",
  "get_visibility_trend",
  "get_prompts",
  "get_prompt_answers",
  "get_competitors",
  "get_cited_sources",
  "get_content_plan",
  "get_topic_bank",
  "add_to_content_plan",
  "update_content_plan",
  "list_cms_connections",
  "get_site_content",
  "propose_changes",
  "get_change_set",
  "show_setup",
  "read_knowledge",
  "read_draft",
  "crawl_page",
  "crawl_site",
  "check_urls",
  "read_robots",
  "page_speed",
  "get_rankings",
  "get_clusters",
  "propose_skill",
  "propose_knowledge",
] as const;

/** What the person should know about fixes a play can't make yet: Zippie lists them for the person to apply. */
export const LIST_FIXES = "When no play can make a fix (redirects, canonicals, robots.txt, server settings), list it plainly with the exact value to set, and say where in their CMS it goes. Never say you made it.";

type Parts = Omit<Def, "body" | "ready"> & { ready?: boolean; intro: string; use: string[]; notFor?: string[]; steps: string[]; hard?: string[]; output: string[]; rules?: string[] };
const list = (xs: string[]) => xs.map((x) => `- ${x}`).join("\n");

/** One system skill from its parts, written as a playbook body. */
export function def(p: Parts): Def {
  const body = [
    p.intro,
    `## When to use\n${list(p.use)}`,
    p.notFor?.length ? `## When not to use\n${list(p.notFor)}` : "",
    `## Steps\n${p.steps.map((s, i) => `${i + 1}. ${s}`).join("\n")}`,
    p.hard?.length ? `## Hard calls\n${list(p.hard)}` : "",
    `## Output\n${list(p.output)}`,
    p.rules?.length ? `## Rules\n${list(p.rules)}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
  return { slug: p.slug, title: p.title, group: p.group, speed: p.speed, result: p.result, ready: p.ready ?? true, tools: p.tools, description: p.description, body, files: p.files };
}
