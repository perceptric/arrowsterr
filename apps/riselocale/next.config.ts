import type { NextConfig } from "next";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pg"],
  poweredByHeader: false,
  // This app lives inside the Arrowsterr repo; keep Next from treating the repo root as the project.
  turbopack: { root: dirname(fileURLToPath(import.meta.url)) },
};

export default nextConfig;
