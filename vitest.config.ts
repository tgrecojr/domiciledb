import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // Use the automatic JSX runtime so server-side React (e.g. @react-pdf/renderer
  // components) can be unit-rendered without importing React explicitly.
  esbuild: { jsx: "automatic" },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // Satisfy Next-only runtime guards when testing server modules in node.
      "server-only": path.resolve(__dirname, "./tests/stubs/empty.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts"],
    coverage: {
      provider: "v8",
      // CI/CD goes straight to prod, so we ENFORCE coverage on the pure,
      // business-critical logic where a silent regression would mis-state a
      // claim. Integration paths (UI, server actions, DB queries) are covered
      // by Playwright e2e, which v8 unit coverage doesn't see — so we scope the
      // gate to these modules rather than the whole tree. Add pure modules here
      // (with their tests) as they're created.
      include: ["src/lib/coverage.ts", "src/lib/money.ts", "src/lib/report.ts"],
      reporter: ["text-summary", "html"],
      thresholds: {
        statements: 100,
        lines: 100,
        functions: 100,
        branches: 90,
      },
    },
  },
});
