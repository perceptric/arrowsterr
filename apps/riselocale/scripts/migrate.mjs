// Applies migrations/*.sql in name order, once each. Usage: DATABASE_URL=... npm run migrate
import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("Set DATABASE_URL first.");
  process.exit(1);
}
const client = new pg.Client({ connectionString: url, ssl: process.env.PGSSL === "no-verify" ? { rejectUnauthorized: false } : undefined });
await client.connect();
await client.query("create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())");
const done = new Set((await client.query("select name from schema_migrations")).rows.map((r) => r.name));
for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
  if (done.has(file)) continue;
  const sql = readFileSync(join(dir, file), "utf8");
  await client.query("begin");
  try {
    await client.query(sql);
    await client.query("insert into schema_migrations (name) values ($1)", [file]);
    await client.query("commit");
    console.log(`Applied ${file}`);
  } catch (e) {
    await client.query("rollback");
    console.error(`Failed on ${file}: ${e.message}`);
    process.exit(1);
  }
}
await client.end();
