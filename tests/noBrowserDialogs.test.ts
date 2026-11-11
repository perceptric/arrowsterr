import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

// The app asks its own questions (src/components/Dialogs.tsx): never the browser's confirm(), prompt() or alert().
const files = (dir: string): string[] => readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? files(join(dir, f)) : /\.tsx?$/.test(f) ? [join(dir, f)] : []));

test("no browser pop-ups in the app", () => {
  const bad = files("src").flatMap((f) =>
    readFileSync(f, "utf8")
      .split("\n")
      .map((line, i) => ({ f, i: i + 1, line }))
      .filter(({ line }) => /(^|[^\w.])(window\.)?(confirm|prompt|alert)\(/.test(line) && !/^\s*(\/\/|\*)/.test(line) && !/function (confirm|prompt|alert)\(/.test(line) && !/confirm\(sb/.test(line)),
  );
  assert.deepEqual(bad.map((b) => `${b.f}:${b.i}`), []);
});
