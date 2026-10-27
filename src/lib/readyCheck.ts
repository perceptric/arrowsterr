/**
 * Remember a setup check once it passes. A failed check is tried again after `retryMs`,
 * so one database error at boot doesn't stop the job queue until the next deploy.
 */
export function readyCheck(probe: () => Promise<boolean>, retryMs = 60_000, now = Date.now) {
  let ready = false;
  let failedAt = -Infinity;
  return async () => {
    if (ready) return true;
    if (now() - failedAt < retryMs) return false;
    ready = await probe().catch(() => false);
    if (!ready) failedAt = now();
    return ready;
  };
}
