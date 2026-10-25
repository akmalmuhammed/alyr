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
    // The portal demo (scripts/build-portal-demo.sh): its build and its stage copy.
    "out-demo/**",
    ".demo-stage/**",
    ".wrangler/**",
    // The portal built for Cloudflare Workers (pnpm portal:build).
    ".open-next/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
