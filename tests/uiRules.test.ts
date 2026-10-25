// The UI rules from docs/unify-plan.md (Part 1 and Part 6), checked on every screen file:
// no browser pop-ups (confirm, prompt, alert), no <select>, no emoji, no text symbols standing in for icons,
// and no new stylesheets. Each file is parsed with TypeScript, so comments and words inside strings don't count.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";

const ROOT = join(import.meta.dirname, "..");
const DIRS = ["src/components", "src/app"];

function walk(dir: string, ext: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name), ext) : e.name.endsWith(ext) ? [join(dir, e.name)] : []));
}
const FILES = DIRS.flatMap((d) => walk(join(ROOT, d), ".tsx"));

// The browser's own pop-ups. The app's are askConfirm, askText and tell (src/components/Dialogs.tsx).
const POPUPS = new Set(["confirm", "prompt", "alert"]);
// Emoji: characters shown as emoji by default, and anything with the emoji variation selector.
// Country flags are pairs of regional indicators; flag() makes them from country codes, so data may hold them.
const EMOJI = /\p{Emoji_Presentation}|️/u;
const FLAGS = /[\u{1F1E6}-\u{1F1FF}]{2}/gu;
// Text symbols that stand in for an icon when they are an element's whole text. Use src/components/Icons.tsx.
const SYMBOLS = new Set(["→", "✓", "✕", "×", "▾", "▸", "▶", "↗"]);
// Files allowed to break a rule, with the reason.
const ALLOW: Record<string, string[]> = {
  // A game with its own pixel art and emoji sprites, not a working screen.
  "src/components/DinoGame.tsx": ["emoji"],
};
// The app's stylesheets. The CSS stays as it is: a new file fails.
const CSS = ["src/app/brand-v2.css", "src/app/brand-v5.css", "src/app/brand.css", "src/app/globals.css", "src/app/twenty-ui.css", "src/app/twenty.css"];

type Finding = { rule: string; where: string; text: string };

/** The rules a file's code breaks. rel is its path from the repo root, for the allowlist and the report. */
function scanCode(rel: string, code: string): Finding[] {
  const allowed = ALLOW[rel] ?? [];
  const src = ts.createSourceFile(rel, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const out: Finding[] = [];
  const add = (rule: string, node: ts.Node, text: string) => {
    if (allowed.includes(rule)) return;
    const { line } = src.getLineAndCharacterOfPosition(node.getStart(src));
    out.push({ rule, where: `${rel}:${line + 1}`, text: text.trim().slice(0, 60) });
  };
  // A string that is an element's text: a JSX child, or a branch of a condition that is one.
  const inJsxText = (node: ts.Node): boolean => {
    let p = node.parent;
    while (p && (ts.isConditionalExpression(p) || ts.isBinaryExpression(p) || ts.isParenthesizedExpression(p))) p = p.parent;
    return Boolean(p && ts.isJsxExpression(p) && p.parent && (ts.isJsxElement(p.parent) || ts.isJsxFragment(p.parent)));
  };
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      const name = ts.isIdentifier(callee) ? callee.text : ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.expression) && callee.expression.text === "window" ? callee.name.text : "";
      if (POPUPS.has(name)) add("popup", node, node.getText(src));
    }
    if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && node.tagName.getText(src) === "select") add("select", node, "<select");
    const text = ts.isJsxText(node) ? node.text : ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node) ? node.text : null;
    if (text !== null) {
      if (EMOJI.test(text.replace(FLAGS, ""))) add("emoji", node, text);
      if (SYMBOLS.has(text.trim()) && (ts.isJsxText(node) || (ts.isStringLiteral(node) && inJsxText(node)))) add("symbol", node, text);
    }
    ts.forEachChild(node, visit);
  };
  visit(src);
  return out;
}

const scan = (file: string) => scanCode(relative(ROOT, file).replaceAll("\\", "/"), readFileSync(file, "utf8"));
const ALL = FILES.flatMap(scan);
const report = (rule: string) =>
  ALL.filter((f) => f.rule === rule)
    .map((f) => `${f.where}  ${f.text}`)
    .join("\n");

test("ui rules: the scan reads the screen files", () => {
  assert.ok(FILES.length > 50, `only ${FILES.length} files found`);
});

test("ui rules: no confirm(), prompt() or alert(); use askConfirm, askText or tell", () => {
  assert.equal(report("popup"), "");
});

test("ui rules: no <select>; use Dropdown or SelectPop from Pickers.tsx", () => {
  assert.equal(report("select"), "");
});

test("ui rules: no emoji in screen text", () => {
  assert.equal(report("emoji"), "");
});

test("ui rules: no text symbols as icons (→ ✓ ✕ × ▾ ▸ ▶ ↗); use Icons.tsx", () => {
  assert.equal(report("symbol"), "");
});

test("ui rules: no new stylesheets", () => {
  const found = walk(join(ROOT, "src"), ".css").map((f) => relative(ROOT, f).replaceAll("\\", "/")).sort();
  assert.deepEqual(found, [...CSS].sort());
});

test("ui rules: the scan catches what it should, and leaves comments, words and flags alone", () => {
  const sample = `
    // confirm( in a comment and "askConfirm(" in a string are fine
    const a = () => { if (confirm("Sure?")) window.alert("x"); askConfirm({}); };
    const b = <select />;
    const c = <span>✓</span>;
    const d = <p>{on ? "→" : null}</p>;
    const e = <i title="→">Go → there</i>;
    const f = "Party \u{1F389}";
    const g = "\u{1F1FA}\u{1F1F8} United States";
  `;
  const rules = scanCode("sample.tsx", sample).map((f) => f.rule);
  assert.deepEqual(rules.sort(), ["emoji", "popup", "popup", "select", "symbol", "symbol"]);
  assert.deepEqual(scanCode("src/components/DinoGame.tsx", `const s = "\u{1F996}";`), []);
});
