// Runs the engine every few seconds inside the server process (started from instrumentation.ts).

import { pool } from "./db.ts";
import { tick } from "./engine.ts";
import { provider } from "./source.ts";

const g = globalThis as unknown as { rlWorker?: NodeJS.Timeout };

export function startWorker() {
  if (g.rlWorker || process.env.RL_WORKER === "off" || !process.env.DATABASE_URL) return;
  let busy = false;
  g.rlWorker = setInterval(async () => {
    const src = provider();
    if (busy || !src) return;
    busy = true;
    try {
      await tick(pool(), src);
    } catch (e) {
      console.error("[worker]", (e as Error).message);
    } finally {
      busy = false;
    }
  }, Number(process.env.RL_TICK_MS) || 5000);
}
