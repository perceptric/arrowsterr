// Password checks that run in the browser before an account is made or a password is changed. Pure but for
// leakedCount, so tests/passwordCheck.test.ts runs it.

export type Strength = { score: 0 | 1 | 2 | 3 | 4; label: string };

// The whole password is a well-known one, maybe with digits after it ("password1", "arrowsterr2026"). A long password
// that only starts with one of these ("passwordsarelongnow") is fine.
const COMMON = /^(password|passw0rd|qwerty|letmein|welcome|admin|iloveyou|monkey|dragon|abc123|123456|111111|arrowsterr)\d*$/i;

/**
 * Strength by length, the one thing that makes a password hard to guess. Too weak: under 8 characters, a well-known
 * password, or one character over and over. Then Okay (8 to 11), Good (12 to 15) and Strong (16 or more). Leaked
 * passwords are caught by leakedCount, whatever their length.
 */
export function strength(pw: string): Strength {
  if (!pw) return { score: 0, label: "" };
  if (pw.length < 8 || COMMON.test(pw) || /^(.)\1+$/.test(pw)) return { score: 1, label: "Too weak" };
  if (pw.length >= 16) return { score: 4, label: "Strong" };
  if (pw.length >= 12) return { score: 3, label: "Good" };
  return { score: 2, label: "Okay" };
}

/**
 * How many times this password shows up in known data leaks (Have I Been Pwned).
 * Only the first 5 characters of its SHA-1 hash leave the browser, so the password itself is never sent.
 * Returns 0 when the check can't run, so a network problem never blocks sign-up.
 */
export async function leakedCount(pw: string): Promise<number> {
  try {
    const digest = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(pw));
    const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
    const res = await fetch(`https://api.pwnedpasswords.com/range/${hex.slice(0, 5)}`, { headers: { "Add-Padding": "true" }, signal: AbortSignal.timeout(4000) });
    if (!res.ok) return 0;
    const rest = hex.slice(5);
    const line = (await res.text()).split("\n").find((l) => l.startsWith(rest));
    return line ? Number(line.split(":")[1]) || 0 : 0;
  } catch {
    return 0;
  }
}

/** Why this password can't be used, or "" when it's fine. */
export async function passwordProblem(pw: string): Promise<string> {
  if (pw.length < 8) return "Use at least 8 characters.";
  if (strength(pw).score < 2) return "That password is too easy to guess. Try a longer one.";
  const n = await leakedCount(pw);
  if (n > 0) return `That password showed up in ${n.toLocaleString()} data leaks. Pick a different one.`;
  return "";
}
