// DataForSEO's Google Maps and Google Organic SERP APIs, queued (task_post, then task_get by id).
// Results are collected by our own task ids, never through tasks_ready, so a DataForSEO account
// shared with another app (Arrowsterr) never has its tasks taken.

import { parseMaps, parseOrganic } from "./match.ts";
import type { Fetched, Kind, Posted, Provider, TaskSpec } from "./provider.ts";

const PATH: Record<Kind, string> = { maps: "serp/google/maps", organic: "serp/google/organic" };
/** DataForSEO's codes for a task that isn't finished yet. */
const WAITING = new Set([40601, 40602]);
const DEPTH = 20;

type Fetch = typeof fetch;

export function dataForSeo(opts: { login: string; password: string; api?: string; language?: string; locationCode?: number; fetch?: Fetch }): Provider {
  const api = (opts.api || "https://api.dataforseo.com/v3").replace(/\/$/, "");
  const language = opts.language || "en";
  const auth = `Basic ${Buffer.from(`${opts.login}:${opts.password}`).toString("base64")}`;
  const doFetch = opts.fetch ?? fetch;

  async function call(path: string, body?: unknown) {
    const res = await doFetch(`${api}/${path}`, {
      method: body ? "POST" : "GET",
      headers: { Authorization: auth, "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(60_000),
    });
    if (res.status === 401) throw new Error("DataForSEO turned down the login. Check DFS_LOGIN and DFS_PASSWORD.");
    if (!res.ok) throw new Error(`DataForSEO returned ${res.status}.`);
    const data = (await res.json()) as { status_code?: number; status_message?: string; tasks?: Record<string, unknown>[] };
    if (data.status_code !== 20000) throw new Error(`DataForSEO: ${data.status_message ?? "unknown error"}`);
    return data.tasks ?? [];
  }

  function body(kind: Kind, s: TaskSpec) {
    const lat = s.lat.toFixed(7);
    const lng = s.lng.toFixed(7);
    const base = { keyword: s.keyword.slice(0, 700), language_code: language, priority: s.priority, depth: DEPTH, tag: s.tag };
    if (kind === "maps") return { ...base, location_coordinate: `${lat},${lng},${s.zoom}z`, search_places: false };
    // Organic takes "lat,lng,radius". 200 is close to the smallest radius DataForSEO allows.
    return { ...base, location_coordinate: `${lat},${lng},200`, device: "desktop" };
  }

  return {
    name: "dataforseo",
    async post(kind, specs) {
      const out: Posted[] = [];
      for (let i = 0; i < specs.length; i += 100) {
        const chunk = specs.slice(i, i + 100);
        const tasks = await call(`${PATH[kind]}/task_post`, chunk.map((s) => body(kind, s)));
        chunk.forEach((_, n) => {
          const t = tasks[n];
          if (t && t.status_code === 20100 && typeof t.id === "string") out.push({ id: t.id });
          else out.push({ error: String(t?.status_message ?? "DataForSEO did not create the task.") });
        });
      }
      return out;
    },
    async get(kind, id): Promise<Fetched> {
      const [t] = await call(`${PATH[kind]}/task_get/advanced/${encodeURIComponent(id)}`);
      if (!t) return { state: "failed", error: "DataForSEO returned no task." };
      const code = Number(t.status_code);
      if (WAITING.has(code)) return { state: "waiting" };
      if (code !== 20000) return { state: "failed", error: String(t.status_message ?? `DataForSEO code ${code}`) };
      const result = (t.result as { items?: unknown }[] | null)?.[0];
      if (kind === "maps") return { state: "done", maps: parseMaps(result?.items, DEPTH) };
      const { pack, organic } = parseOrganic(result?.items, DEPTH);
      return { state: "done", pack, organic };
    },
    async search(query) {
      const [t] = await call("serp/google/maps/live/advanced", [
        { keyword: query.slice(0, 700), language_code: language, location_code: opts.locationCode || 2840, depth: 10 },
      ]);
      if (!t || Number(t.status_code) !== 20000) throw new Error(String(t?.status_message ?? "The search failed."));
      return parseMaps((t.result as { items?: unknown }[] | null)?.[0]?.items, 10);
    },
  };
}
