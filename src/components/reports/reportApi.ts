import type { RunAuth } from "@/lib/runner";

/** POST to a report route as the signed-in member. Throws the route's error text. */
export async function post<T>(auth: RunAuth, path: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${await auth.token()}` },
    body: JSON.stringify({ ...body, workspaceId: auth.workspaceId }),
  });
  const out = await res.json().catch(() => ({ error: `The server returned ${res.status}.` }));
  if (!res.ok) throw Object.assign(new Error(out.error || `Error ${res.status}`), { limit: Boolean(out.limit) });
  return out as T;
}

export const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** "2 h ago", "Yesterday", or a date: the app's one ago. */
export { ago } from "@/lib/dates";

/** Download a saved PDF. Returns the reason when it can't, like a file still being made. */
export async function openFile(auth: RunAuth, fileId: string): Promise<string | null> {
  const s = await post<{ status: string; url?: string; error?: string }>(auth, "/api/files", { action: "status", fileId });
  if (s.status === "ready" && s.url) {
    window.location.assign(s.url);
    return null;
  }
  return s.status === "failed" ? (s.error ?? "That PDF failed.") : "That PDF is still being made. Try again in a minute.";
}
