import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "dist/**",           // bundled worker
    "test-results/**",   // Playwright output
  ]),
]);

eslintConfig.push({ rules: { "react/no-unescaped-entities": "off" } }); // apostrophes in copy are intended

export default eslintConfig;
