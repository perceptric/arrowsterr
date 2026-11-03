"use client";

import { useEffect, useMemo, useState } from "react";
import type { Chat } from "@/lib/chats";
import { homeOf, nameFromTitle } from "@/lib/linkTitles";
import type { RunAuth } from "@/lib/runner";

const bare = (d: string) => d.replace(/^www\./, "").toLowerCase();

/**
 * Names for sites, so a list never shows a bare address: the brand the AI answers tie to the domain
 * ("revenuezen.com" is RevenueZen), else the name in the site's home page title, read once through
 * /api/link-titles. A site with neither keeps its domain.
 */
export function useSiteNames(domains: string[], chats: Chat[], reader: RunAuth | null): Record<string, string> {
  const fromAnswers = useMemo(() => {
    const count = new Map<string, Map<string, number>>();
    for (const c of chats)
      for (const b of c.brands) {
        if (!b.domain) continue;
        const d = bare(b.domain);
        const m = count.get(d) ?? new Map<string, number>();
        m.set(b.name, (m.get(b.name) ?? 0) + 1);
        count.set(d, m);
      }
    return Object.fromEntries([...count.entries()].map(([d, m]) => [d, [...m.entries()].sort((a, b) => b[1] - a[1])[0][0]]));
  }, [chats]);
  const [fromTitles, setFromTitles] = useState<Record<string, string>>({});
  const missing = domains.map(bare).filter((d, i, all) => d && !fromAnswers[d] && all.indexOf(d) === i).slice(0, 30);
  const key = missing.join("\n");
  useEffect(() => {
    if (!key || !reader) return;
    let live = true;
    (async () => {
      const list = key.split("\n");
      const res = await fetch("/api/link-titles", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${await reader.token()}` },
        body: JSON.stringify({ workspaceId: reader.workspaceId, urls: list.map(homeOf) }),
      }).catch(() => null);
      const data = (res?.ok ? await res.json().catch(() => null) : null) as { titles?: Record<string, string> } | null;
      if (!live || !data?.titles) return;
      const found: Record<string, string> = {};
      for (const d of list) {
        const name = nameFromTitle(data.titles[homeOf(d)]);
        if (name) found[d] = name;
      }
      setFromTitles((x) => ({ ...x, ...found }));
    })();
    return () => void (live = false);
  }, [key, reader]);
  return useMemo(() => ({ ...fromTitles, ...fromAnswers }), [fromTitles, fromAnswers]);
}

/** The name to show for a site, or its domain when no name is known. */
export const siteNameOf = (domain: string, names: Record<string, string>) => names[bare(domain)] || domain;
