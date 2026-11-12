import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

// The empty screen rules (docs/brand.md, Empty state and first screen; docs/empty-screens-plan.md).

const files = (dir: string): string[] => readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? files(join(dir, f)) : /\.tsx$/.test(f) ? [join(dir, f)] : []));
const all = files("src").map((f) => ({ f, s: readFileSync(f, "utf8") }));

test("the old text-filled first screens don't come back", () => {
  for (const { f, s } of all) {
    assert.ok(!/\bToolIntro\b|\bPlanIntro\b|\bPlanSample\b/.test(s), `${f} uses the old intro screen`);
    assert.ok(!/<Empty>/.test(s), `${f} uses a plain-text Empty`);
  }
});

test("every empty screen has a short title and one short line", () => {
  let seen = 0;
  for (const { f, s } of all) {
    // The opening tag ends at a ">" that isn't an arrow's "=>".
    for (const m of s.matchAll(/<EmptyScreen\b([\s\S]*?)(\/>|(?<!=)>([\s\S]*?)<\/EmptyScreen>)/g)) {
      seen++;
      const title = m[1].match(/\btitle="([^"]+)"/)?.[1];
      if (title) assert.ok(title.split(/\s+/).length <= 6, `${f}: "${title}" is over six words`);
      const line = (m[3] ?? "").replace(/\{[^{}]*\}/g, "x").replace(/&apos;/g, "'").replace(/\s+/g, " ").trim();
      if (line && !line.includes("<")) assert.ok(line.length <= 90, `${f}: "${line}" is over 90 characters`);
    }
  }
  assert.ok(seen >= 20, `only ${seen} empty screens found`);
});
