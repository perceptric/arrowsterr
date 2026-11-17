import "server-only";
import { after } from "next/server";
import { DAY, readCache, writeCache } from "./cache";
import { composioReady, hasApp, runAppTool } from "./composio";
import { entitlement } from "./entitlements";
import { charge } from "./meter";
import { bingSiteForUrl } from "./searchEngines";
import { bingSiteList } from "./searchEnginesServer";

// Fast indexing: when a post goes live, ask Bing to crawl it, if the workspace connected Bing Webmaster Tools.
// It runs after the response is sent and never fails or slows the publish.

/** Send a live post's address to Bing in the background. Safe to call anywhere; it never throws. */
export function indexNow(ws: string | null | undefined, url: string | null | undefined): void {
  if (!ws || !url || !/^https?:\/\//i.test(url)) return;
  const task = () =>
    submitToBing(ws, url).then(
      () => {},
      (e) => console.error("Bing URL submit failed:", e instanceof Error ? e.message : e),
    );
  try {
    after(task);
  } catch {
    // Outside a request (a script or a test): run it now without waiting.
    void task();
  }
}

/** Submit one URL to Bing. Skips when Bing can't take it for this workspace, or when it went in the last day. */
export async function submitToBing(ws: string, url: string): Promise<"submitted" | "skipped"> {
  if (!composioReady()) return "skipped";
  if (!(await entitlement(ws)).limits.mcp) return "skipped";
  if (!(await hasApp(ws, "bing_webmaster_tools"))) return "skipped";
  // Each update of a live post publishes again. One submit a day is enough, and Bing's quota is small.
  const key = `composio:bing:submitted:${ws}:${url}`;
  if (await readCache<boolean>(key, DAY)) return "skipped";
  const sites = await bingSiteList(ws, (s) => Boolean(bingSiteForUrl(s, url)));
  const site = bingSiteForUrl(sites, url);
  if (!site) return "skipped";
  charge("composio", 0.005);
  await runAppTool(ws, "bing_webmaster_tools", "BING_WEBMASTER_TOOLS_SUBMIT_URLS", { site_url: site, urls: [url] });
  await writeCache(key, true);
  return "submitted";
}
