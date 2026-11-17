import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Version skew protection: a tab from an older deploy does a full reload instead of mixing two builds.
  deploymentId: process.env.RENDER_GIT_COMMIT || undefined,
  // PostHog goes through our own address (docs/analytics.md), so ad blockers don't drop it.
  skipTrailingSlashRedirect: true,
  // Composio's SDK (Apps for Zippie) loads its own Node modules at runtime, so it isn't bundled.
  serverExternalPackages: ["@composio/core"],
  // No other site can show the app in a frame, so nobody can trick a click on Allow or Delete.
  // Shared reports (/r) stay embeddable.
  async headers() {
    return [
      {
        source: "/((?!r/).*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
        ],
      },
    ];
  },
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
