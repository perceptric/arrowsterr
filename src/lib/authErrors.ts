/** Supabase's errors in plain words. Anything not listed shows as it came. */
export function plainError(raw: string) {
  if (/invalid login credentials/i.test(raw)) return "Wrong email or password.";
  if (/rate limit|too many|for security purposes/i.test(raw)) return "Too many tries. Wait a minute and try again.";
  if (/already (been )?registered|already exists/i.test(raw)) return "This email already has an account.";
  if (/password.*(at least|should be|characters)|weak password/i.test(raw)) return "Use a password with at least 8 characters.";
  if (/signups? (not allowed|is disabled|are disabled)/i.test(raw)) return "New accounts are closed right now.";
  if (/unable to validate email|invalid email|invalid format/i.test(raw)) return "Enter a valid email address.";
  if (/failed to fetch|network|load failed/i.test(raw)) return "Can't reach Arrowsterr. Check your connection and try again.";
  return raw;
}
