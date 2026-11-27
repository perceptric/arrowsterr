import "server-only";
import { readCache, writeCache } from "./cache";
import { runAppTool, type AppSlug } from "./composio";
import { charge } from "./meter";
import { bingSites, type BingSite } from "./searchEngines";

// The workspace's Bing Webmaster Tools sites, through its Composio connection, for indexing (indexing.ts).
// Composio bills every call, so the site list is saved for hours (cache.ts).

const HOUR = 36e5;
const SITES_AGE = 6 * HOUR;
// When no property matches, look again sooner: the person may be adding it right now.
const MISS_AGE = 30 * 60_000;

/** One Composio tool call, counted on the meter when there is one. */
function tool<T>(ws: string, slug: AppSlug, name: string, args: Record<string, unknown>) {
  charge("composio", 0.005);
  return runAppTool<T>(ws, slug, name, args);
}

/** The site list, saved per workspace. A saved list with no match is checked again after half an hour. */
async function siteList<S>(key: string, load: () => Promise<S[]>, matches: (sites: S[]) => boolean): Promise<S[]> {
  const hit = await readCache<{ at: number; sites: S[] }>(key, SITES_AGE);
  if (hit && Array.isArray(hit.sites) && (matches(hit.sites) || Date.now() - hit.at < MISS_AGE)) return hit.sites;
  const sites = await load();
  await writeCache(key, { at: Date.now(), sites });
  return sites;
}

export const bingSiteList = (ws: string, matches: (s: BingSite[]) => boolean = () => true) =>
  siteList<BingSite>(`composio:bing:sites:${ws}`, async () => bingSites(await tool(ws, "bing_webmaster_tools", "BING_WEBMASTER_TOOLS_LIST_SITES", {})), matches);
