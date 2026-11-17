// Copy icons next to the built node files, where n8n looks for them.
import { cpSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
for (const dir of ["nodes", "credentials"]) {
  const walk = (rel) => {
    for (const f of readdirSync(join(root, dir, rel), { withFileTypes: true })) {
      const p = join(rel, f.name);
      if (f.isDirectory()) walk(p);
      else if (/\.(svg|png)$/.test(f.name)) cpSync(join(root, dir, p), join(root, "dist", dir, p));
    }
  };
  if (existsSync(join(root, dir))) walk("");
}
