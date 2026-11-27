import "server-only";
import { friendly, newRef, rawText } from "./errors";

// The one way an API route answers with an error (docs/brand.md, Errors): plain words for the person, the raw error in
// the server log under a ref they can quote.

/** Log the raw error on one JSON line and return the words a person sees, with the ref when there is one. */
export function report(e: unknown, where: string, hint?: string) {
  const f = friendly(e, hint);
  const ref = f.ref ?? newRef();
  const stack = e instanceof Error ? e.stack?.split("\n").slice(1, 4).join(" | ") : undefined;
  console.error(JSON.stringify({ level: "error", ref, where, message: rawText(e).slice(0, 2000), stack }));
  return { error: f.message, ref: f.ref, retry: f.retry };
}

/** An error reply for a route: { error, ref } with the right status. */
export function errorResponse(e: unknown, where: string, opts: { status?: number; hint?: string } = {}) {
  const status = opts.status ?? (typeof (e as { status?: unknown })?.status === "number" && (e as { status: number }).status >= 400 ? (e as { status: number }).status : 500);
  const r = report(e, where, opts.hint);
  return Response.json({ error: r.error, ...(r.ref ? { ref: r.ref } : {}) }, { status });
}
