# Heldat shared foundation

These packages contain the provider-neutral product contract shared by web,
iOS, Android, tests, and future service adapters.

Heldat is the public product name. The private `@alyr/*` package namespace
remains stable for workspace and import compatibility.

| Package | Responsibility |
|---|---|
| `@alyr/contracts` | Record, command, sync, evidence, location, API, port, permission, and analytics contracts |
| `@alyr/domain` | Pure focused-v1 taxonomy, readiness, location-history, and evidence-integrity rules |
| `@alyr/design-tokens` | Approved premium midnight product tokens without platform components |
| `@alyr/analytics` | Reject-by-default privacy-safe analytics event construction and adapters |
| `@alyr/fixtures` | Deterministic 25-asset pilot household shared by platform tests |

The packages deliberately contain no React, React Native, browser-storage,
Expo, Supabase, or object-storage implementation. Platform code implements the
ports from `@alyr/contracts`; providers never become canonical record identity.

Run all package checks from the repository root:

```sh
npm run check:shared
```
