// What to do when a plan, allowance or check can't be read. No server imports, so tests can use it.

/** In production a check that can't run denies. In development it lets the work through. */
export const failClosed = () => process.env.NODE_ENV === "production";

/** Postgres and PostgREST codes for a table, column or function that isn't there. */
const MISSING = new Set(["42P01", "42703", "42883", "PGRST202", "PGRST204", "PGRST205"]);

/** True when a database error says a table, column or function doesn't exist yet: a migration not run. */
export function notSetUp(error: { code?: string | null; message?: string | null } | null | undefined): boolean {
  if (!error) return false;
  if (error.code && MISSING.has(error.code)) return true;
  return /does not exist|could not find the (function|table|column)/i.test(error.message ?? "");
}
