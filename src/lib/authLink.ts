// What the sign-in screen says when an email link lands here and can't sign in, and which passkey errors it shows.
// Pure, so tests/authLink.test.ts runs it without a browser or Supabase.
//
// Email links use PKCE: the link confirms the email, then comes back with ?code=, and only the browser that asked for
// the email holds the other half. Opened in another browser or on another device, the code can't be used there, so the
// address still has ?code= while nobody is signed in. The confirm email comes back with ?from=signup (FROM_SIGNUP).

/** Added to the confirm email's return address, so a confirm link opened elsewhere can say the email is confirmed. */
export const FROM_SIGNUP = "signup";

/** True for /signup and /?signup=1, the addresses the website's "Start free trial" buttons open. */
export function wantsSignup(path: string, search: string): boolean {
  const p = path.replace(/\/+$/, "");
  const q = new URLSearchParams(search);
  return p === "/signup" || q.get("signup") === "1";
}

/** The one line for a link that came back here signed out, or "" when there's nothing to say. */
export function linkNotice(search: string, hash: string): string {
  const read = (s: string) => new URLSearchParams(s.replace(/^[?#]/, ""));
  const q = read(search);
  const h = read(hash);
  const code = h.get("error_code") ?? q.get("error_code") ?? h.get("error") ?? q.get("error");
  if (code) {
    const desc = `${h.get("error_description") ?? q.get("error_description") ?? ""}`.toLowerCase();
    // Closing Google's window, say: nothing to explain.
    if (code === "access_denied" && /cancel|denied by user/.test(desc)) return "";
    if (code === "otp_expired" || /expired|invalid|already/.test(desc)) return "That link has expired or was already used. Sign in, or send a new one.";
    return "That link didn't sign you in. Sign in here.";
  }
  if (!q.get("code")) return "";
  if (q.get("from") === FROM_SIGNUP) return "Your email is confirmed. Sign in to continue.";
  return "That link opened in a different browser. Sign in here, or open it where you asked for it.";
}

const LINK_KEYS = ["code", "from", "error", "error_code", "error_description", "sb_flow_id"];

/** The query without what a link left on it, so a reload doesn't say it again. Starts with "?" when anything is left. */
export function withoutLinkParams(search: string): string {
  const q = new URLSearchParams(search.replace(/^\?/, ""));
  for (const k of LINK_KEYS) q.delete(k);
  const s = q.toString();
  return s ? `?${s}` : "";
}

/** Whether a link left anything to clean off the address. */
export function hasLinkParams(search: string, hash: string): boolean {
  const q = new URLSearchParams(search.replace(/^\?/, ""));
  return LINK_KEYS.some((k) => q.has(k)) || /(^|[#&])error(_code|_description)?=/.test(hash);
}

/**
 * The line to show for a passkey that didn't sign in, or "". The waiting passkey in the email box's suggestions
 * (`background`) never shows one: a browser without passkeys, a closed prompt or any other failure there is quiet.
 * Only a click on "Sign in with a passkey" can show an error, and a closed prompt stays quiet there too.
 */
export function passkeyError(message: string, background: boolean): string {
  if (background) return "";
  if (/abort|cancel|not allowed|notallowed|timed out|timeout/i.test(message)) return "";
  if (/non-webauthn|not supported|unsupported|resident|allowcredentials/i.test(message)) return "Passkeys don't work in this browser. Sign in another way.";
  if (/not found|no passkey|credential/i.test(message)) return "No passkey for this site on this device. Sign in another way, then add one in Settings.";
  return message;
}
