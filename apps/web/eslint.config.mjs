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
    ".next-*/**",
    "out/**",
    // The published public site, built by scripts/build-site.sh.
    "out-site/**",
    ".wrangler/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
