import assert from "node:assert/strict";
import { test } from "node:test";
import { DRAWING_KINDS, drawing, FRAME, isoVars, shade } from "../src/lib/isoArt.ts";

test("every picture fits its frame, with room for the float", () => {
  assert.equal(DRAWING_KINDS.length, 22);
  for (const k of DRAWING_KINDS) {
    const { bounds: b } = drawing(k);
    for (const v of [b.x0, b.y0, b.x1, b.y1]) assert.ok(Number.isFinite(v), `${k}: ${v}`);
    assert.ok(b.x0 >= 2 && b.x1 <= FRAME.w - 2, `${k} is too wide: ${b.x0}..${b.x1}`);
    assert.ok(b.y0 >= 8 && b.y1 <= FRAME.h - 2, `${k} is too tall: ${b.y0}..${b.y1}`);
  }
});

test("pictures carry no broken numbers and only palette colors", () => {
  for (const k of DRAWING_KINDS) {
    const { body } = drawing(k);
    assert.ok(!/NaN|undefined|Infinity/.test(body), k);
    for (const m of body.matchAll(/var\(--iso-([a-z]+)/g)) assert.ok(m[1] in isoVars("light") || `--iso-${m[1]}` in isoVars("light"), `${k}: ${m[1]}`);
    // The plate stays still and is drawn first; the object floats.
    assert.ok(body.startsWith('<g class="iso-p" style="--i:0">'), k);
    assert.ok(body.includes('<g class="iso-float">'), k);
  }
});

test("both themes define every tone, and shading matches the website's", () => {
  const light = isoVars("light");
  const dark = isoVars("dark");
  assert.deepEqual(Object.keys(light).sort(), Object.keys(dark).sort());
  assert.equal(light["--iso-blue"], "#0943B0");
  assert.equal(shade("#0943B0", 0.22), "#073489");
  assert.equal(light["--iso-blue-r"], shade("#0943B0", 0.22));
});
