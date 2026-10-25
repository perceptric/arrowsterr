import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";

const hash = (s: string) => createHash("sha256").update(s).digest();

/** True when the request's Bearer token matches one of the secrets that are set. */
function matches(request: Request, secrets: (string | undefined)[]) {
  const given = hash(request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "");
  let ok = false;
  // Check every secret, so the time taken doesn't say which one matched.
  for (const s of secrets) if (s && timingSafeEqual(hash(s), given)) ok = true;
  return ok;
}

/** True when the request carries the CRON_SECRET as a Bearer token. */
export function allowed(request: Request) {
  return matches(request, [process.env.CRON_SECRET?.trim()]);
}

/**
 * For the routes the Fly worker calls (PDFs, page renders, images, the job worker).
 * WORKER_SECRET when set, so the worker machine doesn't need CRON_SECRET; CRON_SECRET still works.
 */
export function workerAllowed(request: Request) {
  return matches(request, [process.env.WORKER_SECRET?.trim(), process.env.CRON_SECRET?.trim()]);
}
