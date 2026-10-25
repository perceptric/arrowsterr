// Writes src/lib/skillText.ts from the writing and brand skills in skills/ (docs/agentic-writing.md, section 6).
// Each skill keeps its LICENSE (MIT, or Apache 2.0 for brand-review) next to it. Run after changing a file in skills/: node scripts/skills.mjs
import { readFileSync, writeFileSync } from "node:fs";

const SKILLS = {
  humanizer: ["humanizer/SKILL.md"],
  antiAi: ["anti-ai-writing/SKILL.md"],
  enforcer: ["writing-enforcer/SKILL.md", "writing-enforcer/ai-pattern-taxonomy.md"],
  claims: ["claim-boundary-checker/SKILL.md", "claim-boundary-checker/classification.md"],
  proofread: ["proofread/SKILL.md"],
  voiceProfiler: ["voice-profiler/SKILL.md"],
  brandReview: ["brand-review/SKILL.md"],
  styleSheet: ["style-sheet/SKILL.md", "style-sheet/variant-families.md", "style-sheet/default-decisions.md"],
};
const read = (f) => readFileSync(new URL(`../skills/${f}`, import.meta.url), "utf8").replace(/^---\n[\s\S]*?\n---\n/, "").trim();
const body = Object.entries(SKILLS)
  .map(([key, files]) => `  ${key}: ${JSON.stringify(files.map(read).join("\n\n"))},`)
  .join("\n");
writeFileSync(
  new URL("../src/lib/skillText.ts", import.meta.url),
  `// Made by scripts/skills.mjs from skills/ (open source, see each skill's LICENSE). Do not edit by hand.\nexport const SKILL_TEXT = {\n${body}\n} as const;\n`,
);
console.log("src/lib/skillText.ts written");
