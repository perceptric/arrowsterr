// The visitor's IP address, for rate limits. Pure, so tests can check it.
// Fly sets fly-client-ip itself. Without it, the last x-forwarded-for entry is the one our own proxy added.
// The first entry is whatever the visitor sent, so it is never used.

export function clientIp(request: { headers: Headers }): string {
  const fly = request.headers.get("fly-client-ip")?.trim();
  if (fly) return fly.slice(0, 64);
  const last = (request.headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .pop();
  return last ? last.slice(0, 64) : "unknown";
}
