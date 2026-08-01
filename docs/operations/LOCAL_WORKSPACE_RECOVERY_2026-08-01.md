# Local workspace recovery — 2026-08-01

## Scope

This record covers a local Windows workspace incident only. No hosted database,
Storage object, DNS record, Expo project, EAS build, or production setting was
changed by the incident or its recovery.

## What happened

The system drive reached zero free bytes during release evidence work. The root
generated `node_modules` tree was moved to `D:` with a recursive `robocopy
/MOVE`. The dependency tree contained npm-workspace junctions. Because the copy
did not exclude junction traversal, `robocopy` materialized the linked workspace
files under the `D:` destination and removed their original directory contents.

The operation preserved the bytes but temporarily made Git report the linked
workspaces as deleted.

## Recovery

1. Stopped all staging/commit activity as soon as the deletion state appeared.
2. Mapped each npm workspace to the corresponding preserved `D:` copy.
3. Copied the ten affected workspaces back without `node_modules`.
4. Compared every tracked and non-ignored untracked workspace file against the
   preserved copy by SHA-256.
5. Preserved the materialized workspace copies under:

   `D:\HeldatRecovery\c-drive-full-20260801\workspace-source-snapshot-after-followed-junction`

6. Recreated the ten npm-workspace junctions.
7. Linked the root and four nested dependency directories to the clean,
   lockfile-derived `npm ci` installation used by the isolated iOS validation.

## Verification

| Gate | Result |
|---|---|
| Tracked workspace files compared | 981 |
| Non-ignored untracked workspace files compared | 123 |
| Total SHA-256 comparisons | 1,104 |
| Missing recovery files | 0 |
| Missing restored files | 0 |
| Hash mismatches | 0 |
| npm workspace junctions | 10/10 resolve to the live workspace |
| Shared package build | Passed |
| Native TypeScript | Passed |
| Focused native regression | 7/7 suites; 66/66 tests |
| Unexpected tracked changes after recovery | 0 |

Pre-existing modified and untracked product/design files were preserved; no
Git checkout, reset, clean, or broad staging command was used.

## Prevention rule

- Never recursively move or delete a dependency tree that may contain workspace
  links.
- Before any dependency-tree relocation, enumerate reparse points explicitly.
- Prefer a clean lockfile install on the destination volume.
- If a copy is unavoidable, exclude junction traversal (`/XJ`) or copy links as
  links (`/SL`) and verify the resolved source and destination boundaries.
- Keep dependency caches and release artifacts on `D:`; keep the Git workspace
  source authoritative on `C:`.
