// Every error a person can see goes through here (docs/brand.md, Errors). friendly() turns anything that was thrown,
// a failed API reply, or a saved error into one or two plain sentences with the next step. It never lets through
// JSON, stack traces, status codes, request ids, SQL or the names of the services we run on. An error it can't place
// gets "Something went wrong. Try again." and a short ref; the server logs the raw error under that ref.
// Pure, so the browser, the server and the tests share it.

export type Friendly = { message: string; ref: string | null; retry: boolean };

const REF = /\s*\(Ref ([A-Z0-9]{4,10})\)\s*$/;
const CMS = ["WordPress", "Shopify", "Webflow", "HubSpot", "Ghost", "Wix", "Squarespace", "Framer", "Contentful", "Sanity", "Strapi", "Notion"];

/** A short code to find this error in the logs: "7KQ2M". */
export function newRef() {
  const abc = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 5; i++) out += abc[Math.floor(Math.random() * abc.length)];
  return out;
}

/** The raw text of anything thrown, for the logs. Never for a screen. */
export function rawText(e: unknown): string {
  if (typeof e === "string") return e;
  if (e instanceof Error) return e.message;
  if (e && typeof e === "object") {
    const o = e as { message?: unknown; error?: unknown };
    if (typeof o.message === "string") return o.message;
    if (typeof o.error === "string") return o.error;
    try {
      return JSON.stringify(e);
    } catch {
      return "";
    }
  }
  return e === undefined || e === null ? "" : String(e);
}

/** The HTTP status an error carries: on the object, or at the start of the text ("400 {...}", "Error 500"). */
function statusOf(e: unknown, text: string): number | null {
  const o = (e && typeof e === "object" ? e : {}) as { status?: unknown; statusCode?: unknown };
  const s = typeof o.status === "number" ? o.status : typeof o.statusCode === "number" ? o.statusCode : null;
  if (s && s >= 400) return s;
  const m = /^(?:error\s*|http\s*)?([45]\d\d)\b/i.exec(text.trim()) ?? /\b(?:status(?: code)?|returned|answered)\s*:?\s*([45]\d\d)\b/i.exec(text);
  return m ? Number(m[1]) : null;
}

// Signs that a message was written by a machine, not for a person.
const RAW =
  /[{}<>[\]`\\|]|https?:\/\/|\n\s+at\s|\.(sql|tsx?|jsx?|mjs)\b|\b[a-z]+_[a-z_]+\b|\b(returned|answered|status|error|HTTP|code)\s*:?\s*[45]\d\d\b|^[45]\d\d\b|\b(undefined|null|NaN|TypeError|ReferenceError|SyntaxError|RangeError|JSON|SQL|status code|request[ _]?id|req_[a-z0-9]+|ECONN\w*|ENOTFOUND|ETIMEDOUT|EAI_AGAIN|PGRST\w*|jwt|relation|violates|Supabase|Postgres|PostgREST|Anthropic|DataForSEO|Composio|Umami|Coresignal|Firecrawl|Hostinger|OVH|Vercel|Resend|OpenRouter|Sentry|Cloudflare|fal\.ai)\b/i;

/** A message already written for a person: a short sentence, no machine signs. Those pass through as they are. */
export function readable(text: string) {
  const t = text.trim();
  return t.length >= 2 && t.length <= 300 && /^["“'‘(]?[A-Z0-9]/.test(t) && /[.!?)"”]$/.test(t) && !RAW.test(t);
}

const said = (o: unknown, key: string) => (o && typeof o === "object" ? (o as Record<string, unknown>)[key] : undefined);

/** Turn anything thrown, a failed reply or a saved error into words for the screen. hint leads an error it can't place. */
export function friendly(e: unknown, hint?: string): Friendly {
  let text = rawText(e).trim();
  const kept = REF.exec(text);
  text = text.replace(REF, "");
  const ownRef = typeof said(e, "ref") === "string" ? (said(e, "ref") as string) : (kept?.[1] ?? null);
  const status = statusOf(e, text);
  const name = typeof said(e, "name") === "string" ? (said(e, "name") as string) : "";
  const code = String(said(e, "code") ?? "");
  const type = String(said(e, "type") ?? said(said(e, "raw"), "type") ?? "");
  const say = (message: string, retry = false, ref: string | null = null): Friendly => ({ message, ref, retry });
  const generic = (lead = hint ?? "Something went wrong.") => say(`${lead.replace(/\s*$/, "")} Try again.`, true, ownRef ?? newRef());

  if (!text && !status) return generic();

  // Stopped on purpose, or took too long.
  if (name === "AbortError" || /\baborted\b/i.test(text)) return say("This was stopped before it finished. Try again.", true);
  if (name === "TimeoutError" || /timed? ?out|timeout|ETIMEDOUT|deadline exceeded/i.test(text) || status === 408 || status === 504) return say("This took too long. Try again in a moment.", true);

  // The connection.
  if (/fetch failed|failed to fetch|load failed|networkerror|network error|network request failed|ECONNREFUSED|ECONNRESET|ENOTFOUND|EAI_AGAIN|socket hang up|other side closed/i.test(text))
    return say("The connection dropped. Check your internet and try again.", true);

  // Zippie's model.
  if (status === 529 || /overloaded/i.test(text)) return say("Zippie is busy right now. Try again in a minute.", true);
  const claude = /"type"\s*:\s*"error"|invalid_request_error|rate_limit_error|api_error|authentication_error|permission_error|not_found_error|overloaded_error|`thinking` block|prompt is too long/i.test(text);
  if (claude) {
    if (/prompt is too long|too many tokens|context (window|length)/i.test(text)) return say("This chat got too long for Zippie. Start a new chat to keep going.");
    if (status === 429 || /rate_limit/i.test(text)) return say("Zippie is getting a lot of requests. Wait a minute and try again.", true);
    if (status && status >= 500) return say("Zippie is having trouble right now. Try again in a minute.", true, ownRef ?? newRef());
    return say("Zippie hit a problem with this chat. Try again, or start a new chat.", true, ownRef ?? newRef());
  }

  // Google: an expired sign-in, or an API that isn't turned on.
  if (/has not been used in project|is disabled|SERVICE_DISABLED|accessNotConfigured|API has not been enabled/i.test(text))
    return say("Google needs one more setting turned on. Open Settings → Integrations and connect Google again.");
  if (/invalid_grant|token (has been )?expired|expired or revoked|Token has been expired|insufficient(Permissions| authentication scopes)|unauthorized_client|google.*(401|unauthenticated)/i.test(text))
    return say("Your Google connection expired. Connect Google again in Settings → Integrations.");

  // Stripe: a card problem keeps Stripe's own short words.
  if (type === "StripeCardError" || type === "card_error") return say(readable(text) ? text : "Your card was declined. Try another card.");
  if (type.startsWith("Stripe")) return say("Payments hit a problem. Try again, or email support@arrowsterr.com.", true, ownRef ?? newRef());

  // A site's sign-in that stopped working.
  const cms = CMS.find((c) => new RegExp(`\\b${c}\\b`, "i").test(text));
  if (cms && (status === 401 || status === 403 || /unauthori[sz]ed|forbidden|invalid.{0,20}(token|key|password|credential)|rest_forbidden|rest_cannot|not allowed|access denied|application password/i.test(text)))
    return say(`${cms} stopped accepting Arrowsterr's sign-in. Connect it again in Settings → Integrations.`);

  // The database.
  if (/duplicate key|already exists/i.test(text) || code === "23505") return say("That already exists.");
  if (/^PGRST|^\d{2}[0-9A-Z]{3}$/.test(code) || /relation .* does not exist|column .* does not exist|violates|syntax error at|permission denied for|null value in column|invalid input syntax|JWT|PGRST/i.test(text))
    return generic("Something went wrong with your data.");

  // By status.
  if (status === 401) return say("Your session ended. Sign in again to keep going.");
  if (status === 403) return say(readable(text) ? text : "You don't have access to this. Ask a workspace admin.");
  if (status === 404) return say(readable(text) ? text : "We couldn't find that. It may have been moved or deleted.");
  if (status === 413) return say("That's too large. Try a smaller file or less text.");
  if (status === 429) return say(readable(text) ? text : "Too many requests at once. Wait a minute and try again.", true);

  // Written for a person already.
  if (readable(text)) return say(text, Boolean(status && status >= 500), ownRef);
  return generic();
}

/** The words to put on a screen for any error, with its ref when there is one: "Something went wrong. Try again. (Ref 7KQ2M)". */
export function errorText(e: unknown, hint?: string) {
  const f = friendly(e, hint);
  return f.ref ? `${f.message} (Ref ${f.ref})` : f.message;
}

/** A failed reply from one of our API routes, as an Error with friendly words, its status and its ref. */
export function httpError(status: number, body: unknown) {
  const b = (body && typeof body === "object" ? body : {}) as { error?: unknown; message?: unknown; ref?: unknown; limit?: unknown; readOnly?: unknown };
  const f = friendly({ message: typeof b.error === "string" ? b.error : typeof b.message === "string" ? b.message : "", status, ref: typeof b.ref === "string" ? b.ref : undefined });
  return Object.assign(new Error(f.message), { status, ref: f.ref ?? undefined, retry: f.retry, limit: Boolean(b.limit || b.readOnly) });
}

/** Split "words (Ref 7KQ2M)" into the words and the ref, for the error box. */
export function splitRef(text: string): { words: string; ref: string | null } {
  const m = REF.exec(text);
  return m ? { words: text.replace(REF, ""), ref: m[1] } : { words: text, ref: null };
}

/** What a feature says while its database tables are still being added (the app adds them itself on its next run). */
export const NOT_READY = "This part of Arrowsterr is still getting ready. Try again in a few minutes.";
