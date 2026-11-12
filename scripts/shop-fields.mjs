// AI Shopping phase 1: list every field the recorded fixtures carry, per item type, with how often it's filled.
// node scripts/shop-fields.mjs [type filter]
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const DIR = new URL("../tests/fixtures/shop/", import.meta.url).pathname;
const filter = process.argv[2];
const seen = new Map(); // type -> { n, fields: Map(path -> { filled, sample }) }
const files = { gpt: 0, aim: 0 };
const withCards = { gpt: 0, aim: 0 };

function walk(node, eng, found) {
  if (Array.isArray(node)) return node.forEach((x) => walk(x, eng, found));
  if (!node || typeof node !== "object") return;
  if (typeof node.type === "string") {
    const key = `${eng}:${node.type}`;
    if (/shopping|products|product/.test(node.type)) found.add(eng);
    const t = seen.get(key) ?? { n: 0, fields: new Map() };
    t.n++;
    for (const [k, v] of Object.entries(node)) {
      if (k === "items") continue;
      const paths = v && typeof v === "object" && !Array.isArray(v) ? Object.entries(v).map(([k2, v2]) => [`${k}.${k2}`, v2]) : [[k, v]];
      for (const [p, val] of paths) {
        const f = t.fields.get(p) ?? { filled: 0, sample: undefined };
        const filled = val !== null && val !== undefined && val !== "" && !(Array.isArray(val) && !val.length);
        if (filled) { f.filled++; if (f.sample === undefined) f.sample = JSON.stringify(val).slice(0, 90); }
        t.fields.set(p, f);
      }
    }
    seen.set(key, t);
  }
  for (const v of Object.values(node)) if (v && typeof v === "object") walk(v, eng, found);
}

for (const eng of ["gpt", "aim"]) {
  for (const f of (await readdir(join(DIR, eng))).filter((x) => x.endsWith(".json"))) {
    const fx = JSON.parse(await readFile(join(DIR, eng, f), "utf8"));
    files[eng]++;
    const found = new Set();
    walk(fx.result?.items ?? [], eng, found);
    if (found.size) withCards[eng]++;
  }
}
console.log(`files ${JSON.stringify(files)} with product items ${JSON.stringify(withCards)}\n`);
for (const [type, t] of [...seen].sort()) {
  if (filter && !type.includes(filter)) continue;
  console.log(`${type}  (${t.n})`);
  for (const [p, f] of t.fields) console.log(`   ${p.padEnd(34)} ${String(f.filled).padStart(4)}/${t.n}  ${f.sample ?? ""}`);
}
