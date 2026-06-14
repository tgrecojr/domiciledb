import path from "node:path";
import { defineConfig } from "vitest/config";

// Integration tests (real S3/MinIO round-trip). Run with `npm run test:integration`
// after providing S3_* env. Kept separate from the fast unit suite.
export default defineConfig({
  esbuild: { jsx: "automatic" },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "server-only": path.resolve(__dirname, "./tests/stubs/empty.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    testTimeout: 30000,
  },
});
