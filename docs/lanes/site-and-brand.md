# Site and brand lane

**Mission.** Own what a stranger sees first: the public site, the brand rules, and how the product screens look.

Linear: label `Site and brand` under "Lane", project `Alyr Launch`. Read `docs/operating-model.md` for the rules every lane follows.

## Files this lane owns

- `apps/web/app/_site/`, `(site)/`, `(site-ar)/`
- `apps/web/app/icon.svg`, `opengraph-image.tsx`, `robots.ts`, `sitemap.ts`
- `docs/brand.md`

Anything else belongs to another lane. If a task needs it, keep the change small and say so in the pull request.

## Read before starting

1. `docs/status.md`
2. `docs/brand.md`
3. `docs/decisions.md` D-023 and D-025
4. The founder's Brand & Growth Playbook (a Claude Docs document in the founder's account; ask for access if you cannot read it)

## Now (update this section in the same pull request as the work)

Last updated 12 Oct 2026.

- The site is live in English and Arabic with the playbook's words on the design system v1.0 look.
- Two brand systems disagree and the founder has not chosen (ALY-61). Do not produce new branded material until that is decided.
- No contact method on the live page (ALY-60). Arabic unreviewed (ALY-66). No privacy or terms pages (ALY-68, Company lane).

## Next, in order

1. ALY-60 contact number and email on the site
2. ALY-66 Arabic review
3. ALY-67 product screens on the chosen look

## Never

- Redraw, retype or recolor the logo. Copy assets from the design system; never merge the branch `codex/alyr-native-foundation`.
- Put a number, client name or promise on the page that cannot be shown to be true today.
- Put words in components. Every word lives in `copy.ts`, in both languages.

## Done means

Checked on screen at phone and desktop width in both languages, lint and build pass, and the founder has approved before any deploy.
