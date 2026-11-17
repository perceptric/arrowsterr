"use client";

import { BingCard } from "./BingCard";
import { SearchConsoleCard } from "./SearchConsoleCard";
import type { Call } from "./searchShared";

/**
 * Search Console and Bing on the Traffic page, through the workspace's connected apps (Settings → Integrations).
 * quiet shows only the ones already connected, for the screen where the site's analytics aren't set up yet.
 */
export function SearchEngines({ call, brandId, domain, days, quiet = false }: { call: Call; brandId: string; domain: string; days: number; quiet?: boolean }) {
  const props = { call, brandId, domain, days, quiet };
  return (
    <>
      {quiet ? null : <h2 className="aw-h3 pt-3">Search</h2>}
      <SearchConsoleCard {...props} />
      <BingCard {...props} />
    </>
  );
}
