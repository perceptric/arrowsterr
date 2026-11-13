// Skills: a skill is a folder of text files, led by SKILL.md, in the Agent Skills format. SKILL.md opens with a
// short header (name, description, speed, result, tools) between two "---" lines, then plain steps and rules in
// Markdown. System skills ship with the app (system.ts); Workspace and Personal skills are rows in `ask_skills`.
// Pure, so the Skills page, the / menu, the Ask route and the tests all read skills the same way.

export type Scope = "system" | "workspace" | "personal";
export type Speed = "quick" | "deep";

export type SkillHead = { name: string; description: string; speed: Speed; result: string; tools: string[] };

/** One skill, wherever it lives. `key` is "system:<slug>" or the row's uuid. */
export type Skill = {
  key: string;
  scope: Scope;
  slug: string;
  title: string;
  description: string;
  speed: Speed;
  result: string;
  tools: string[];
  group: string;
  /** False while a tool it needs isn't in Zippie yet: it shows on the Skills page, and stays out of the / menu. */
  ready: boolean;
  files: Record<string, string>;
  ownerId?: string;
  updatedAt?: string;
};

export const MAX_FILES = 12;
export const MAX_FILE_CHARS = 40_000;
export const MAX_DESCRIPTION = 1000;
export const MAIN = "SKILL.md";

export const slugOf = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);

/** "page-audit" or "Page audit" both read as "Page audit". */
export const titleOf = (name: string) => {
  const t = name.replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
  return t ? t[0]!.toUpperCase() + t.slice(1) : "";
};

/** Split SKILL.md into its header and body. Unknown header keys are kept out; a file with no header has an empty one. */
export function parseSkill(md: string): { head: SkillHead; body: string; title: string } {
  const text = md.replace(/\r\n/g, "\n");
  const head: SkillHead = { name: "", description: "", speed: "quick", result: "", tools: [] };
  let body = text;
  if (text.startsWith("---\n")) {
    const end = text.indexOf("\n---", 4);
    if (end > 0) {
      for (const line of text.slice(4, end).split("\n")) {
        const at = line.indexOf(":");
        if (at < 1) continue;
        const k = line.slice(0, at).trim().toLowerCase();
        const v = line.slice(at + 1).trim();
        if (k === "name") head.name = v;
        else if (k === "description") head.description = v;
        else if (k === "speed") head.speed = /^deep/i.test(v) ? "deep" : "quick";
        else if (k === "result") head.result = v;
        else if (k === "tools")
          head.tools = v
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean);
      }
      body = text.slice(end + 4).replace(/^\n+/, "");
    }
  }
  const h1 = body.match(/^# (.+)$/m)?.[1]?.trim() ?? "";
  return { head, body, title: h1 || titleOf(head.name) };
}

/** What's wrong with a SKILL.md, in plain words; empty when it can be saved. */
export function skillProblems(md: string): string[] {
  const { head, title } = parseSkill(md);
  const out: string[] = [];
  if (!md.startsWith("---\n")) out.push("Start SKILL.md with a header between two --- lines.");
  if (!head.name) out.push("Add a name to the header, like name: page-audit.");
  else if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(head.name)) out.push("Write the name in lowercase words joined by dashes, like page-audit.");
  else if (head.name.length > 64) out.push("Keep the name under 64 characters.");
  if (!head.description) out.push("Add a description to the header. Zippie reads it to know when to use the skill.");
  else if (head.description.length > MAX_DESCRIPTION) out.push(`Keep the description under ${MAX_DESCRIPTION} characters.`);
  if (!title) out.push("Add a title line that starts with #.");
  if (md.length > MAX_FILE_CHARS) out.push(`Keep SKILL.md under ${MAX_FILE_CHARS.toLocaleString("en-US")} characters.`);
  return out;
}

/** What's wrong with a skill's files as a whole. */
export function filesProblems(files: Record<string, string>): string[] {
  const out: string[] = [];
  const names = Object.keys(files);
  if (!(MAIN in files)) out.push("A skill needs a SKILL.md file.");
  if (names.length > MAX_FILES) out.push(`A skill holds up to ${MAX_FILES} files.`);
  for (const n of names) {
    if (!/^[A-Za-z0-9][A-Za-z0-9 ._-]{0,79}\.(md|txt|csv|json)$/.test(n)) out.push(`${n}: name files with letters, numbers and dashes, ending in .md, .txt, .csv or .json.`);
    else if ((files[n] ?? "").length > MAX_FILE_CHARS) out.push(`${n} is over ${MAX_FILE_CHARS.toLocaleString("en-US")} characters.`);
  }
  if (files[MAIN] != null) out.push(...skillProblems(files[MAIN]!));
  return out;
}

/** A Workspace or Personal skill row as one Skill. */
export function skillFromRow(row: { id: string; scope: "workspace" | "personal"; files: unknown; owner_id?: string; updated_at?: string }): Skill {
  const files = cleanFiles(row.files);
  const { head, title } = parseSkill(files[MAIN] ?? "");
  return {
    key: row.id,
    scope: row.scope,
    slug: head.name || slugOf(title),
    title: title || "Untitled skill",
    description: head.description,
    speed: head.speed,
    result: head.result || "Answer",
    tools: head.tools,
    group: "",
    ready: true,
    files,
    ownerId: row.owner_id,
    updatedAt: row.updated_at,
  };
}

/** Only string files with a usable name. */
export function cleanFiles(raw: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) if (typeof v === "string" && k.trim()) out[k.trim()] = v;
  return out;
}

/** The files to save for a skill copied from another: the same files, renamed so it doesn't read as the original. */
export function copyFiles(from: Skill, title: string): Record<string, string> {
  const files = { ...from.files };
  const md = files[MAIN] ?? "";
  files[MAIN] = md.replace(/^name: .*$/m, `name: ${slugOf(title) || "my-skill"}`).replace(/^# .*$/m, `# ${title}`);
  return files;
}

/** A blank skill to start from. */
export function blankSkill(title = "New skill"): Record<string, string> {
  return {
    [MAIN]: `---
name: ${slugOf(title) || "new-skill"}
description: What this skill does, and the words someone uses when they want it, like "audit this page" or "fix my meta descriptions".
speed: quick
result: Answer
tools: read_knowledge
---
# ${title}

What this skill does, in one or two sentences.

## When to use
- When someone asks to ...

## Steps
1. Read the page on screen.
2. ...
3. Show the result in the chat.

## Rules
- Use only what the tools return. Say so when something isn't found.

## Output
- What the person gets back.
`,
  };
}

/** A skill's files as Zippie reads them: SKILL.md, then any other files. */
export function skillText(s: Pick<Skill, "files">): string {
  const extra = Object.entries(s.files)
    .filter(([n]) => n !== MAIN)
    .map(([n, t]) => `<file name="${n.replace(/"/g, "'")}">\n${t.slice(0, MAX_FILE_CHARS)}\n</file>`)
    .join("\n");
  return `<skill>
${(s.files[MAIN] ?? "").slice(0, MAX_FILE_CHARS)}
</skill>${extra ? `\n\n<skill_files>\n${extra}\n</skill_files>` : ""}`;
}

const FOLLOW = "Follow its steps and rules. Where a step needs a tool you don't have, say what you'd need and do what you can with the tools you have.";

/** The text a picked skill adds to Zippie's turn. */
export function skillPrompt(s: Pick<Skill, "title" | "files">): string {
  return `The person picked the skill "${s.title}" for this request. ${FOLLOW}\n\n${skillText(s)}`;
}

// Zippie picks a skill on its own: every usable skill's key, title and description go into the prompt, and the
// use_skill tool loads the one that fits. Up to CATALOG_MAX skills, each description cut to MAX_DESCRIPTION (1,000) characters.
export const CATALOG_MAX = 80; // the 50 system skills and the team's own

/** The list of skills Zippie can pick from, or "" when there are none. */
export function skillCatalog(list: Pick<Skill, "key" | "title" | "description" | "ready">[], picked?: string | null): string {
  const usable = list.filter((s) => s.ready && s.description.trim()).slice(0, CATALOG_MAX);
  if (!usable.length) return "";
  const line = (s: (typeof usable)[number]) => `- ${s.key} | ${s.title.replace(/\s+/g, " ")} | ${s.description.replace(/\s+/g, " ").slice(0, MAX_DESCRIPTION)}`;
  return `Skills are the team's own ways of doing a job.
- When a request clearly matches one, call use_skill with its key before anything else, then follow what it returns.
- Use at most one skill a question. Skip skills for quick lookups and small talk.
- Never say a skill exists unless it's in this list.${picked ? `\n- The person already picked "${picked}" for this question, so don't pick another.` : ""}

<skills>
${usable.map(line).join("\n")}
</skills>`;
}

/** The tool Zippie calls to load a skill from the list. */
export const USE_SKILL = {
  name: "use_skill",
  description: "Load one of the team's skills by its key from the skills list, when the request clearly matches it. Returns the skill's steps and rules to follow for this question.",
  input_schema: { type: "object" as const, properties: { key: { type: "string", description: "The skill's key from the list, like system:page-audit" } }, required: ["key"] },
};

/** What use_skill returns for a key, or why it can't. */
export function pickSkillResult(list: Pick<Skill, "key" | "title" | "files" | "ready">[], key: unknown): { ok: true; title: string; text: string } | { ok: false; text: string } {
  const s = typeof key === "string" ? list.find((x) => x.key === key.trim()) : undefined;
  if (!s) return { ok: false, text: "No skill has that key. Answer without a skill, or pick a key from the list." };
  if (!s.ready) return { ok: false, text: `${s.title} isn't ready yet. Answer without it.` };
  return { ok: true, title: s.title, text: `Use the skill "${s.title}" for this request. ${FOLLOW}\n\n${skillText(s)}` };
}

/** Skills that match what's typed after "/", best first: title start, then word start, then anywhere. */
export function matchSkills<T extends Pick<Skill, "title" | "description">>(list: T[], q: string): T[] {
  const s = q.trim().toLowerCase();
  if (!s) return list;
  const score = (x: T) => {
    const t = x.title.toLowerCase();
    if (t.startsWith(s)) return 0;
    if (t.split(/\s+/).some((w) => w.startsWith(s))) return 1;
    if (t.includes(s)) return 2;
    if (x.description.toLowerCase().includes(s)) return 3;
    return 9;
  };
  return list
    .map((x, i) => ({ x, i, r: score(x) }))
    .filter((m) => m.r < 9)
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .map((m) => m.x);
}
