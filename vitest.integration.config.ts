import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// Integration tests (real S3 round-trip via RustFS). Run with
// `npm run test:integration` after providing S3_* env. Separate from the unit suite.
export default defineConfig({
  plugins: [react()], // transform JSX reached transitively (backup -> PDF render)
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
