import { createHash, randomBytes } from "node:crypto";

// API keys, shared by the server and the tests. Only a key's hash is saved, so a key is shown once.
//   aw_live_…     a workspace's API and MCP key (Settings → Integrations, or a connected AI app)
//   aw_partner_…  a partner's key for /api/partner (supabase/098_partner.sql). It makes brands and brand keys.
//   aw_brand_…    a brand key, made by a partner key. The API and MCP server see only its one brand.

export type KeyKind = "live" | "partner" | "brand";
export const KEY_PREFIX: Record<KeyKind, string> = { live: "aw_live_", partner: "aw_partner_", brand: "aw_brand_" };

export const hashKey = (key: string) => createHash("sha256").update(key).digest("hex");

/** A new key of a kind: the key to show once, the prefix to tell keys apart, and the hash to save. */
export function makeKey(kind: KeyKind) {
  const key = `${KEY_PREFIX[kind]}${randomBytes(24).toString("base64url")}`;
  return { key, prefix: key.slice(0, KEY_PREFIX[kind].length + 6), hash: hashKey(key) };
}

/** Which kind a key is, from its prefix. Null for anything else. */
export function keyKind(key: string | null | undefined): KeyKind | null {
  if (!key) return null;
  for (const kind of Object.keys(KEY_PREFIX) as KeyKind[]) if (key.startsWith(KEY_PREFIX[kind]) && key.length > KEY_PREFIX[kind].length) return kind;
  return null;
}

/** The key a request sends: X-API-Key, or Authorization: Bearer. */
export function keyOf(request: Request) {
  return request.headers.get("x-api-key")?.trim() || request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() || "";
}

export type KeyRow = { id: string; workspace_id: string; revoked_at?: string | null; expires_at?: string | null; partner?: boolean | null; brand_id?: string | null };

/**
 * Whether a saved key row may be used as the kind its prefix says. The row must agree with the prefix,
 * so a live key can never act as a partner or brand key, and the other way round.
 * Returns why not, or null when it may.
 */
export function rowProblem(kind: KeyKind, row: KeyRow | null | undefined, now = Date.now()): "invalid" | "expired" | null {
  if (!row || row.revoked_at) return "invalid";
  if (row.expires_at && Date.parse(row.expires_at) < now) return "expired";
  const partner = row.partner === true;
  const brand = Boolean(row.brand_id);
  const fits = kind === "live" ? !partner && !brand : kind === "partner" ? partner && !brand : !partner && brand;
  return fits ? null : "invalid";
}
