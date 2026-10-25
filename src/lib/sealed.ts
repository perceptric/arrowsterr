import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

// Secrets saved in the database (CMS keys and passwords, Slack webhook addresses) are encrypted here.
// The key is SECRETS_KEY, or the same key Google tokens use (google.ts) when that is not set, so a deploy
// without SECRETS_KEY keeps working. Values saved before sealing are plain text: they read as they are,
// and get sealed the next time they are saved. Pure, so the tests can run it.

const PREFIX = "sealed:v1:";

/** Every key that may have sealed a value, the one to seal with first. */
function keys(): Buffer[] {
  const out: Buffer[] = [];
  const own = process.env.SECRETS_KEY?.trim();
  if (own) out.push(createHash("sha256").update(`arrowsterr-secrets:${own}`).digest());
  const google = process.env.GOOGLE_TOKEN_KEY?.trim() || process.env.SUPABASE_SECRET_KEY?.trim();
  if (google) out.push(createHash("sha256").update(`arrowsterr-google:${google}`).digest());
  return out;
}

export const isSealed = (v: unknown): v is string => typeof v === "string" && v.startsWith(PREFIX);

/** Encrypt a secret for the database. Without any key on the server it stays plain, like before. */
export function sealSecret(text: string): string {
  if (!text || isSealed(text)) return text;
  const key = keys()[0];
  if (!key) return text;
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([c.update(text, "utf8"), c.final()]);
  return PREFIX + [iv, c.getAuthTag(), body].map((b) => b.toString("base64url")).join(".");
}

/** The secret as it was typed. A plain value from before sealing comes back as it is. */
export function openSecret(value: string): string {
  if (!isSealed(value)) return value;
  const [iv, tag, body] = value.slice(PREFIX.length).split(".").map((p) => Buffer.from(p, "base64url"));
  for (const key of keys()) {
    try {
      const d = createDecipheriv("aes-256-gcm", key, iv);
      d.setAuthTag(tag);
      return Buffer.concat([d.update(body), d.final()]).toString("utf8");
    } catch {
      // Sealed with the other key. Try the next one.
    }
  }
  throw new Error("A saved key can't be read. Connect it again.");
}

/** Seal the named fields of a saved config, like a CMS connection's password or token. */
export function sealConfig<T extends Record<string, string>>(config: T, secrets: string[]): T {
  const out: Record<string, string> = { ...config };
  for (const k of secrets) if (typeof out[k] === "string" && out[k]) out[k] = sealSecret(out[k]);
  return out as T;
}

/** Open every sealed field of a saved config. Plain fields pass through. */
export function openConfig<T extends Record<string, string>>(config: T): T {
  const out: Record<string, string> = { ...(config ?? {}) };
  for (const [k, v] of Object.entries(out)) if (isSealed(v)) out[k] = openSecret(v);
  return out as T;
}
