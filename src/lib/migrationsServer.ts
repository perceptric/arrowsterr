import "server-only";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { migrationQuery, pendingMigrations } from "./migrations";
import { supabaseUrl } from "./serverAuth";

// Runs new supabase/NNN_*.sql files on each schedule tick (every 10 minutes), through the database's SQL endpoint
// (/pg/query on SUPABASE_URL, with the secret key). It keeps the same record as the old server runner,
// ops.schema_migrations, and stops at the first file that fails. Files must be safe to run twice (README, Migrations).

async function pg(url: string, key: string, query: string) {
  const res = await fetch(`${url}/pg/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: key, Authorization: `Bearer ${key}` },
    body: JSON.stringify({ query }),
    signal: AbortSignal.timeout(120_000),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error((data && (data.message || data.error)) || `SQL endpoint answered ${res.status}`);
  return data as Record<string, unknown>[];
}

export async function runMigrations(): Promise<string[]> {
  const url = supabaseUrl();
  const key = process.env.SUPABASE_SECRET_KEY?.trim();
  if (!url || !key) return [];
  const dir = path.join(process.cwd(), "supabase");
  const files = await readdir(dir).catch(() => [] as string[]);
  if (!files.length) return [];
  const applied = (await pg(url, key, "select filename from ops.schema_migrations")).map((r) => String(r.filename));
  const ran: string[] = [];
  for (const file of pendingMigrations(files, applied)) {
    const sql = await readFile(path.join(dir, file), "utf8");
    try {
      await pg(url, key, migrationQuery(file, sql, process.env.GIT_COMMIT?.trim() || "app"));
    } catch (e) {
      throw new Error(`${file}: ${e instanceof Error ? e.message : e}`);
    }
    console.log(`Migration ran: ${file}`);
    ran.push(file);
  }
  return ran;
}
