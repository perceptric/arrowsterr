// System skills (docs/zippie-skills-plan.md, section 3): written by us, the same for every workspace, read-only in the
// app. People copy one to change it. Each lives in defs/ as a full SKILL.md body. The description says what the skill
// does and the words people use when they want it, so Zippie can pick it on its own. `tools` names only tools Zippie
// has (tests/skills.test.ts checks it).

import { MAIN, type Skill } from "./format.ts";
import { AI } from "./defs/ai.ts";
import { HELPERS } from "./defs/helpers.ts";
import { LINKS } from "./defs/links.ts";
import { PAGE } from "./defs/page.ts";
import { BASE_RULES, GROUPS, type Def } from "./defs/shared.ts";
import { TECH } from "./defs/tech.ts";
import { WRITING } from "./defs/writing.ts";

export { GROUPS, SKILL_TOOLS, type Group } from "./defs/shared.ts";

export const DEFS: Def[] = [...TECH, ...LINKS, ...PAGE, ...AI, ...WRITING, ...HELPERS];

function markdown(d: Def): string {
  return `---
name: ${d.slug}
description: ${d.description}
speed: ${d.speed}
result: ${d.result}
tools: ${d.tools.join(", ")}
---
# ${d.title}

${d.body.trim()}

## Always
${BASE_RULES.map((r) => `- ${r}`).join("\n")}
`;
}

export const SYSTEM_SKILLS: Skill[] = DEFS.map((d) => ({
  key: `system:${d.slug}`,
  scope: "system",
  slug: d.slug,
  title: d.title,
  description: d.description,
  speed: d.speed,
  result: d.result,
  tools: d.tools,
  group: d.group,
  ready: d.ready,
  files: { [MAIN]: markdown(d), ...(d.files ?? {}) },
}));

export const systemSkill = (key: string) => SYSTEM_SKILLS.find((s) => s.key === key || s.key === `system:${key}`) ?? null;
export const groupLabel = (g: string) => GROUPS.find((x) => x.key === g)?.label ?? g;
