# Security

## Reporting a problem
Email **security@alyr.qa** with what you found and how to repeat it. Please do not open a
GitHub issue or post it publicly. We reply within two working days and tell you when it is fixed.

Do not access, change or keep data that is not yours, and do not test against real
merchants' shops; use the demo shop.

## What we protect
- Each business's data is separated by PostgreSQL row-level security; the application's
  database role cannot bypass it (CLAUDE.md, hard rule 1).
- Sign-in uses one-time codes; codes and sessions are stored only as hashes (D-022).
- WhatsApp webhooks are verified by Meta's signature.
- ALYR never holds merchants' money or card numbers (hard rule 3).
- Personal data sent outside Qatar is listed in `docs/data-residency.md`.

## For people working on ALYR
- Secrets live in `.env` (ignored) and, in production, the cloud key vault. Never in git or chat.
- `scripts/hooks/pre-commit` blocks keys and personal documents; `scripts/check.sh` turns it on.
- CI scans every change with gitleaks and checks dependencies for known vulnerabilities.
- If a secret leaks, follow `docs/runbooks/incident-response.md`, section "A secret leaked".
