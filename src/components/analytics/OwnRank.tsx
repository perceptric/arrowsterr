"use client";

import { useEffect, useState } from "react";
import type { RunAuth } from "@/lib/runner";
import type { OwnRank as Rank } from "@/lib/seoAnalyticsServer";
import { post } from "../research/shared";

/**
 * "You rank #8.4 with 18,900 impressions" for a keyword, from the brand's own Search Console (Analytics sync).
 * Shows nothing when the brand has no Search Console connected or doesn't show up for the keyword.
 */
export function OwnRank({ auth, brandId, keyword }: { auth: RunAuth; brandId: string | null; keyword: string }) {
  const [hit, setHit] = useState<{ key: string; rank: Rank | null } | null>(null);
  const key = `${brandId}:${keyword}`;
  useEffect(() => {
    if (!brandId || !keyword) return;
    let live = true;
    post<{ ranks: Record<string, Rank> }>(auth, "/api/seo-analytics", { action: "ranks", brandId, queries: [keyword] })
      .then((d) => live && setHit({ key: `${brandId}:${keyword}`, rank: d.ranks[keyword.toLowerCase().trim()] ?? null }))
      .catch(() => null);
    return () => {
      live = false;
    };
  }, [auth, brandId, keyword]);
  const rank = hit?.key === key ? hit.rank : null;
  if (!rank) return null;
  return (
    <span className="aw-chip aw-chip--brand self-start" title={rank.page ? `Your page: ${rank.page}` : undefined}>
      You rank #{rank.position.toFixed(1)} · {rank.impressions.toLocaleString("en-US")} impressions · {(rank.ctr * 100).toFixed(1)}% CTR
    </span>
  );
}
