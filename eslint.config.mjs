import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier";

// Next.js 16 ships eslint-config-next as native flat configs, so the legacy
// FlatCompat bridge (@eslint/eslintrc) is no longer needed — and it crashes
// under ESLint 10. Compose the flat configs directly instead.
const eslintConfig = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  prettier,
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "public/sw.js",
      "drizzle/**",
      "next-env.d.ts",
      // `eslint .` walks the whole tree (unlike the old `next lint`), so skip
      // generated output that isn't source.
      "coverage/**",
      "playwright-report/**",
      "test-results/**",
    ],
  },
];

export default eslintConfig;
