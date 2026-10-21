import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Version skew protection: a tab from an older deploy does a full reload instead of mixing two builds.
  deploymentId: process.env.RENDER_GIT_COMMIT || undefined,
  // PostHog goes through our own address (docs/analytics.md), so ad blockers don't drop it.
  skipTrailingSlashRedirect: true,
  async rewrites() {
    return [
      { source: "/ingest/static/:path*", destination: "https://us-assets.i.posthog.com/static/:path*" },
      { source: "/ingest/:path*", destination: "https://us.i.posthog.com/:path*" },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
