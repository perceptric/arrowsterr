import "server-only";

// Helpers for the login security routes (src/app/api/auth).

/** The caller's address. The proxy in front of the app adds the real one last, so a sent header can't fake it. */
export function clientIp(request: Request): string {
  const real = request.headers.get("x-real-ip")?.trim();
  if (real) return real.slice(0, 64);
  const list = (request.headers.get("x-forwarded-for") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return (list[list.length - 1] ?? "").slice(0, 64);
}

/** "Chrome on macOS", from the browser's user agent. */
export function deviceLabel(ua: string): string {
  const browser = /Edg\//.test(ua) ? "Edge" : /OPR\//.test(ua) ? "Opera" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "A browser";
  const os = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Mac OS X|Macintosh/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "an unknown system";
  return `${browser} on ${os}`;
}

// Wrong-password limits, counted over 15 minutes (and an hour for one email from anywhere).
export const LIMITS = { pair: 5, ip: 20, emailHour: 30 };
