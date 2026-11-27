import type { RunAuth } from "@/lib/runner";
import { httpError } from "@/lib/errors";

/** POST to a report route as the signed-in member. Throws the route's error in plain words (httpError). */
export async function post<T>(auth: RunAuth, path: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${await auth.token()}` },
    body: JSON.stringify({ ...body, workspaceId: auth.workspaceId }),
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw httpError(res.status, out);
  return out as T;
}

/** "2h ago", "3d ago", or a date. */
export function ago(iso: string | null | undefined) {
  if (!iso) return "–";
  const s = (Date.now() - Date.parse(iso)) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 30 * 86400) return `${Math.floor(s / 86400)}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/** Download a saved PDF. Returns the reason when it can't, like a file still being made. */
export async function openFile(auth: RunAuth, fileId: string): Promise<string | null> {
  const s = await post<{ status: string; url?: string; error?: string }>(auth, "/api/files", { action: "status", fileId });
  if (s.status === "ready" && s.url) {
    window.location.assign(s.url);
    return null;
  }
  return s.status === "failed" ? (s.error ?? "That PDF failed.") : "That PDF is still being made. Try again in a minute.";
}
