# ALYR web app

Next.js app with three route groups: the public site `(site)` and `(site-ar)`, and the product
`(product)` (workspace, back office, sign-in, customer pages). See the root
[README.md](../../README.md) and [CLAUDE.md](../../CLAUDE.md) for how to run it and the rules.

- Dev server: `pnpm dev` on port 3100 (3000 is used by another project). API calls are
  forwarded to `ALYR_API_URL` (default `http://127.0.0.1:8000`).
- Public site build: `scripts/build-site.sh` (static files for the Cloudflare Worker `alyr-site`).
- Words on the public site live in `app/_site/copy.ts`, in English and Arabic.
