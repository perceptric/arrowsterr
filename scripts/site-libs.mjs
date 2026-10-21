// Build the browser copies of the free tools' pure rules for the arrowsterr-site theme (docs/free-tools.md).
// The robots.txt tester and the schema generator re-test and rebuild on every key press in the visitor's browser,
// with the same tested code the API runs. Run after changing either file:
//   node scripts/site-libs.mjs ../arrowsterr-site/pages/free-tools
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

const out = process.argv[2];
if (!out) {
  console.error("Usage: node scripts/site-libs.mjs <folder in the site theme>");
  process.exit(1);
}

const LIBS = [
  ["src/lib/robotsTest.ts", "AwRobots", "free-robots.js"],
  ["src/lib/schemaGen.ts", "AwSchema", "free-schema.js"],
];

for (const [src, global, file] of LIBS) {
  const code = readFileSync(src, "utf8");
  if (/^import\s/m.test(code)) throw new Error(`${src} imports other files, so it can't run in the browser on its own.`);
  const js = ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2017, module: ts.ModuleKind.CommonJS, removeComments: false } }).outputText;
  const body = `// Generated from the app's ${src} by scripts/site-libs.mjs. Don't edit here: change the app file and run it again.\n(function () {\n  var exports = {};\n${js.replace(/^/gm, "  ")}\n  window.${global} = exports;\n})();\n`;
  writeFileSync(join(out, file), body);
  console.log(`${file}: ${body.length} bytes`);
}
