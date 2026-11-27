import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// No raw error text on a screen or in an API reply (docs/brand.md › Errors). Screens show errors through errorText or
// the ErrorNote box; routes answer through errorResponse or report (src/lib/errorsServer.ts). Lines that only log are fine.

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(f) ? [p] : [];
  });

// The operator's settings check at /api/setup-check names the services on purpose: it is for whoever runs the server.
const ALLOWED = new Set([join("src", "app", "api", "setup-check", "route.ts")]);

const files = [...walk(join("src", "components")), ...walk(join("src", "app"))].filter((f) => !ALLOWED.has(f));
const routes = files.filter((f) => f.includes(join("src", "app", "api")));
const screens = files.filter((f) => !routes.includes(f));

/** Lines of a file that match, leaving out lines that only log. */
function hits(file: string, re: RegExp) {
  return readFileSync(file, "utf8")
    .split("\n")
    .map((line, i) => ({ line, at: `${file}:${i + 1}` }))
    .filter(({ line }) => re.test(line) && !/console\.(error|warn|log|info)\(/.test(line))
    .map(({ at, line }) => `${at}  ${line.trim().slice(0, 140)}`);
}

test("screens never show e.message, String(e) or a reply's raw error", () => {
  const bad = screens.flatMap((f) => [
    ...hits(f, /\w+ instanceof Error \? \w+\.message/),
    ...hits(f, /String\((e|err|error)\)/),
    ...hits(f, /setError\(\w+(\?)?\.message/),
    ...hits(f, /\{[\w.?]+\.message\}/),
    ...hits(f, /throw new Error\(\w+\??\.error\b/),
    ...hits(f, /className="aw-error[^"]*">\{/),
    ...hits(f, /\b(msgOf|errText)\(/),
  ]);
  assert.deepEqual(bad, [], `Use errorText(e) or <ErrorNote error={e} /> instead:\n${bad.join("\n")}`);
});

test("API routes never send raw error text", () => {
  const bad = routes.flatMap((f) => [
    ...hits(f, /\w+ instanceof Error \? \w+\.message/),
    ...hits(f, /String\((e|err)\)/),
    ...hits(f, /error: \w+(\?)?\.message/),
    ...hits(f, /\b(err|fail)\(\w+(\?)?\.message/),
    ...hits(f, /\?\.message \?\?/),
    ...hits(f, /Run supabase\//),
  ]);
  assert.deepEqual(bad, [], `Use errorResponse(e, where) or report(e, where) instead:\n${bad.join("\n")}`);
});
