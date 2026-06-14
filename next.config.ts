import withSerwistInit from "@serwist/next";
import type { NextConfig } from "next";

// NOTE: @serwist/next is webpack-only — it injects a webpack config and does
// not support Turbopack. Next 16 defaults to Turbopack, so `dev`/`build` pass
// `--webpack` (see package.json) to keep service-worker generation working.
const withSerwist = withSerwistInit({
  // Source service worker; compiled to /public/sw.js at build time.
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
  // PWA install + offline only work in a secure context (HTTPS or localhost).
  // Disabled in dev to avoid caching churn while iterating.
  disable: process.env.NODE_ENV === "development",
});

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Standalone output -> small runtime image for the distroless container.
  output: "standalone",
  // better-sqlite3 / sharp are native; keep them external to the server bundle.
  // instrumentation.ts (migrations + scheduler) is enabled by default in Next 15.
  serverExternalPackages: ["better-sqlite3", "sharp", "@react-pdf/renderer"],
  experimental: {
    serverActions: {
      // Photo capture posts full-size phone images (often several at once)
      // through a Server Action; the default 1 MB cap rejects them.
      bodySizeLimit: "50mb",
    },
  },
};

export default withSerwist(nextConfig);
