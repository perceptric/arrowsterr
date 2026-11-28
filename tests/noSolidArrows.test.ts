import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// Menus, pickers and rows that open use the thin Chevron from ui.tsx, and arrows in text use Arrow. Solid triangle
// glyphs (down, right, up and left, small or large) look heavy and never come back (docs/brand.md, Chevrons and arrows).

const SOLID = /[▲▴▶▸►▼▾◀◂◄]/;
const walk = (dir: string): string[] => readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? walk(join(dir, f)) : /\.(tsx?|css)$/.test(f) ? [join(dir, f)] : []));

test("no solid triangle glyphs in the app's screens or styles", () => {
  const hits = [...walk("src/components"), "src/app/globals.css"].flatMap((f) =>
    readFileSync(f, "utf8")
      .split("\n")
      .flatMap((line, i) => (SOLID.test(line) ? [`${f}:${i + 1}`] : [])),
  );
  assert.deepEqual(hits, []);
});
