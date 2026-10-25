// Rate limits kept in the database (supabase/058_security.sql), so every server machine shares one count.
// No server imports, so tests can check the keys.
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

/** A limit's key: the scope, then a hash of the value, so IP addresses, tokens and API keys are never stored. */
export const limitKey = (scope: string, value: string) => `${scope}:${createHash("sha256").update(`${scope}:${value}`).digest("hex").slice(0, 32)}`;

/** True when the error says hit_limit is not in the database yet. */
export const limitMissing = (error: { code?: string; message?: string }) =>
  error.code === "PGRST202" || error.code === "42883" || /function public\.hit_limit.*(does not exist|schema cache)/i.test(error.message ?? "");

/**
 * Count one hit on a key. True while the key has used fewer than max hits in this window of seconds.
 * Before supabase/058_security.sql is run, every hit is let through with a warning.
 */
export async function underLimit(db: SupabaseClient, key: string, max: number, windowSeconds: number): Promise<boolean> {
  const { data, error } = await db.rpc("hit_limit", { p_key: key, p_max: max, p_window_seconds: windowSeconds });
  if (!error) return data === true;
  if (limitMissing(error)) {
    console.warn("Rate limit skipped. Run supabase/058_security.sql in Supabase.");
    return true;
  }
  console.error("Rate limit failed:", error.message);
  return false;
}
