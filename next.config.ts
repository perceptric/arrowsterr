import type { NextConfig } from "next";

// Security headers for every page and route. No page is meant to be framed by another site: the PDF worker opens
// /r/print and /r/file as whole pages, and modules run in our own srcdoc iframes, which these rules don't block.
const supabase = process.env.SUPABASE_URL?.trim().replace(/\/+$/, "") ?? "";
const oauthTargets = "https://accounts.google.com https://checkout.stripe.com https://billing.stripe.com";

// Enforced now: rules that can't break Next's inline scripts.
const csp = ["frame-ancestors 'none'", "base-uri 'self'", "object-src 'none'", `form-action 'self' ${oauthTargets}`].join("; ");

// The fuller policy, reported only for now. Turn it on once reports come back clean.
const cspReport = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com https://js.stripe.com https://accounts.google.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://accounts.google.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' https: data: blob:",
  "media-src 'self' https: data: blob:",
  `connect-src 'self' ${supabase} https://*.supabase.co wss://*.supabase.co https://accounts.google.com https://*.sentry.io https://*.ingest.sentry.io https://*.ingest.us.sentry.io`.replace(/\s+/g, " "),
  "frame-src 'self' blob: data: https://challenges.cloudflare.com https://js.stripe.com https://accounts.google.com",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  `form-action 'self' ${oauthTargets}`,
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Content-Security-Policy", value: csp },
  { key: "Content-Security-Policy-Report-Only", value: cspReport },
];

const nextConfig: NextConfig = {
  // Version skew protection: a tab from an older deploy does a full reload instead of mixing two builds.
  deploymentId: process.env.RENDER_GIT_COMMIT || undefined,
  // PostHog goes through our own address (docs/analytics.md), so ad blockers don't drop it.
  skipTrailingSlashRedirect: true,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
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
