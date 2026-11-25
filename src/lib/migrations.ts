// Which database files still need to run. Pure, so tests can load it (migrationsServer.ts does the running).

/** Numbered migration files, like 103_writing_chats.sql. schema.sql and templates/ are left out. */
export const isMigration = (name: string) => /^\d{3}_[\w-]+\.sql$/.test(name);

/** The files not yet in ops.schema_migrations, in filename order. */
export function pendingMigrations(files: string[], applied: string[]): string[] {
  const done = new Set(applied);
  return files.filter((f) => isMigration(f) && !done.has(f)).sort();
}

/** One file as a single query: Postgres runs a multi-statement query as one transaction, so a failure rolls it all back. */
export function migrationQuery(file: string, sql: string, commit: string): string {
  const quote = (s: string) => `'${s.replace(/'/g, "''")}'`;
  return [
    sql.trim().replace(/;?\s*$/, ";"),
    `insert into ops.schema_migrations (filename, applied_at, commit_sha) values (${quote(file)}, now(), ${quote(commit)}) on conflict do nothing;`,
    `notify pgrst, 'reload schema';`,
  ].join("\n");
}
