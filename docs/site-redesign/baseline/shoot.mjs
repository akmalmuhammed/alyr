// Moved to scripts/site/shoot.mjs on 24 Oct 2026 (docs/site-audit/05-tooling-log.md). Many
// docs and build logs cite this path, so it still works: it runs the script in its new place
// with the same arguments. Prefer `node scripts/site/shoot.mjs …` or `pnpm site:shots`.
await import("../../../scripts/site/shoot.mjs");
