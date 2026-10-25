import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { test } from "node:test";

// Server code must fetch outside addresses with safeFetch (src/lib/safeFetch.ts), which refuses the server's own
// network. Plain fetch() is only allowed in the files below: each one calls a fixed vendor API or the app's own
// services, never an address a customer typed or a page linked to. Add a file here only for that reason.
const ALLOWED = new Set([
  "src/lib/safeFetch.ts", // the safe fetch itself
  "src/lib/dataforseo.ts", // DataForSEO
  "src/lib/email.ts", // Resend
  "src/lib/google.ts", // Google sign-in and Analytics
  "src/lib/stripe.ts", // Stripe
  "src/lib/umami.ts", // the tracking server (UMAMI settings)
  "src/lib/freeTools.ts", // Cloudflare Turnstile
  "src/lib/freeRunners.ts", // Open PageRank, Tranco and PageSpeed
  "src/app/api/setup-check/route.ts", // Supabase, DataForSEO and Umami health checks
  "src/app/api/site/route.ts", // the tracking server
  "src/app/t/api/send/route.ts", // the tracking server
  "src/app/t/script.js/route.ts", // the tracking server
]);

const root = new URL("..", import.meta.url).pathname;
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return files(p);
    return /\.(ts|tsx|js|mjs)$/.test(name) ? [p] : [];
  });
}

test("server code never fetches an outside address with plain fetch()", () => {
  const bad: string[] = [];
  for (const file of [...files(join(root, "src/lib")), ...files(join(root, "src/app"))]) {
    const rel = relative(root, file);
    if (ALLOWED.has(rel)) continue;
    const src = readFileSync(file, "utf8");
    src.split("\n").forEach((line, i) => {
      if (/^\s*(\/\/|\*|\/\*)/.test(line)) return; // comments
      // fetch( or globalThis.fetch(, but not safeFetch( or route.fetch(. A path on the app itself ("/api/...") is fine.
      for (const m of line.matchAll(/(?:^|[^\w.$])(?:globalThis\.|window\.)?fetch\(\s*(.?)(.?)/g)) {
        const sameApp = /["'`]/.test(m[1]) && m[2] === "/";
        if (!sameApp) bad.push(`${rel}:${i + 1}: ${line.trim().slice(0, 120)}`);
      }
    });
  }
  assert.deepEqual(bad, [], `Use safeFetch for these, or add a vendor API file to ALLOWED:\n${bad.join("\n")}`);
});
