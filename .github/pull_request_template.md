<!-- Title: what changed, in plain words. Branch: aly-NN-short-name. -->

**Linear:** ALY-

## What changed
<!-- For someone who does not read code. -->

## How it was checked
<!-- Commands run, tests added, pages looked at (desktop, phone, dark, Arabic). -->

## Not checked
<!-- Be honest: what you could not test and why. "Nothing" is rarely true. -->

## Hygiene checklist (docs/hygiene.md)
- [ ] One Linear issue, branch named after it
- [ ] `scripts/check.sh` passes; CI green before merge
- [ ] New table: tenant_id, forced RLS, policy, grants (test_tenant_isolation passes)
- [ ] New outside service or new personal data sent abroad: row in `docs/data-residency.md`
- [ ] New decision: entry in `docs/decisions.md`; superseded ones marked
- [ ] New tool or account: row in `docs/stack.md` and `docs/access.md`
- [ ] New dependency: one-line reason below
- [ ] User-facing text in English and Arabic
- [ ] No secrets, real customer data or personal documents in the diff
- [ ] `docs/status.md` updated for what this PR changes (after merge if the PR waits)
- [ ] Migration: new file only, never an edited one

**New dependencies:** none
