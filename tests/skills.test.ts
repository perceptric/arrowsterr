// Zippie's system skills (docs/zippie-skills-plan.md, section 3): 50 skills in 7 groups, each a valid SKILL.md that names
// only tools Zippie has, says when to use it, and passes the same checks a person's own skill must pass to save.
import { test } from "node:test";
import assert from "node:assert/strict";
import { filesProblems, MAIN, matchSkills, parseSkill, skillCatalog, skillFromRow, pickSkillResult } from "../src/lib/skills/format.ts";
import { GROUPS, SKILL_TOOLS, SYSTEM_SKILLS } from "../src/lib/skills/system.ts";
import { readFileSync } from "node:fs";

test("50 system skills in 7 groups, with unique slugs", () => {
  assert.equal(SYSTEM_SKILLS.length, 50);
  assert.equal(new Set(SYSTEM_SKILLS.map((s) => s.slug)).size, 50);
  const count = (g: string) => SYSTEM_SKILLS.filter((s) => s.group === g).length;
  assert.deepEqual(Object.fromEntries(GROUPS.map((g) => [g.key, count(g.key)])), { tech: 12, links: 6, page: 5, ai: 5, research: 4, writing: 16, helpers: 2 });
});

test("every system skill is a valid SKILL.md that says when to use it", () => {
  for (const s of SYSTEM_SKILLS) {
    assert.deepEqual(filesProblems(s.files), [], s.slug);
    const { head, title } = parseSkill(s.files[MAIN]);
    assert.equal(head.name, s.slug);
    assert.equal(title, s.title);
    assert.match(s.description, /Use it /, s.slug);
    assert.ok(s.description.length <= 1000, s.slug);
    assert.ok(/## Steps/.test(s.files[MAIN]) && /## Output/.test(s.files[MAIN]), s.slug);
  }
});

test("system skills name only tools Zippie has", () => {
  // Zippie's tools are the read-only MCP tools, the Content Plan tools and the local ones in ask.ts and zippieTools.ts.
  const src = ["src/lib/mcp/tools.ts", "src/lib/ask.ts", "src/lib/zippieTools.ts"].map((f) => readFileSync(new URL(`../${f}`, import.meta.url), "utf8")).join("\n");
  for (const t of SKILL_TOOLS) assert.ok(src.includes(`name: "${t}"`), `${t} is not one of Zippie's tools`);
  for (const s of SYSTEM_SKILLS) for (const t of s.tools) assert.ok((SKILL_TOOLS as readonly string[]).includes(t), `${s.slug} names ${t}`);
});

test("the writing skills carry the real methods as files", () => {
  const files = (slug: string) => Object.keys(SYSTEM_SKILLS.find((s) => s.slug === slug)!.files);
  assert.ok(files("anti-ai-review").includes("anti-ai-writing.md"));
  assert.ok(files("humanize").includes("humanizer.md") && files("humanize").includes("humanizer-2.md"));
  assert.ok(files("pattern-check").includes("writing-enforcer.md"));
  assert.ok(files("claim-check").includes("claim-boundary-checker.md"));
  assert.ok(files("proofread").includes("proofread.md"));
});

test("Zippie's catalog, use_skill and the / menu read skills the same way", () => {
  const own = skillFromRow({ id: "11111111-1111-1111-1111-111111111111", scope: "personal", files: { [MAIN]: "---\nname: monday-check\ndescription: My weekly check. Use it when I say run my Monday check.\n---\n# Monday check\n\nSteps." } });
  const list = [own, ...SYSTEM_SKILLS];
  const cat = skillCatalog(list);
  assert.match(cat, /system:page-audit \| Page audit/);
  assert.match(cat, /Monday check/);
  const ok = pickSkillResult(list, "system:anti-ai-review");
  assert.ok(ok.ok && ok.text.includes("<skill>") && ok.text.includes('<file name="anti-ai-writing.md">'));
  assert.equal(pickSkillResult(list, "system:made-up").ok, false);
  assert.equal(matchSkills(list, "link")[0].title, "Link a new post");
  assert.ok(matchSkills(list, "audit").some((s) => s.slug === "page-audit"));
});
