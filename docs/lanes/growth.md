# Growth lane

**Mission.** Bring business owners to ALYR without the founder knocking on every door: content, programmes and partnerships.

Linear: label `Growth` under "Lane", project `Alyr Launch`. Read `docs/operating-model.md` for the rules every lane follows.

## Files this lane owns

- `docs/growth/` (create it): content calendar, drafts, programme applications, partner list

Anything else belongs to another lane. If a task needs it, keep the change small and say so in the pull request.

## Read before starting

1. `docs/status.md`
2. The founder's Brand & Growth Playbook, sections 5, 7 and 8 (a Claude Docs document in the founder's account)
3. `docs/brand.md`

## Now (update this section in the same pull request as the work)

Last updated 25 Oct 2026.

- **The growth and content plan is written** (`docs/growth/plan.md`), on four research reports (`docs/growth/research/`).
  - **Phase 0 (foundations):** handles, profiles, the bank of posts.
  - **Phase 1 (in public, no selling):** runs before the CR.
  - **Phases 2 and 3:** wait for the CR and the first customers.
- **The social studio** renders posts from the design system in code: `D:\alyr-video\social`, with a contact sheet at `out/index.html`. Batch 1 has 11 posts in English and Arabic. Founder posts, video scripts and the first calendar are in `docs/growth/drafts/`. The Figma social kit is a local plugin at `D:\alyr-figma-builder\social`.
- Nothing has been published. The founder approves every piece against the checklist (plan, section 8).
- Cloud credit applications drafted (ALY-55): `docs/growth/cloud-credit-applications.md`. Microsoft first, Google Start tier second; both wait on an @alyr.qa email address.
- **Profile texts ready, no account created (ALY-230, Needs Akmal):** `docs/growth/profiles.md`. LinkedIn page, Instagram, X, YouTube, Crunchbase, Google Business Profile (service area: Doha and Qatar) and Bing Places, in English and Arabic, the same name, line and description as the site, with each platform's limits and the founder's checklist. Recommended handle `alyr_qa` (`alyr-qa` on LinkedIn), fallback `alyrhq`; plain `alyr` is taken on every platform checked, and "ALYR Inc." (a web agency) holds `linkedin.com/company/alyr`. The last step adds each address to `NEXT_PUBLIC_ALYR_SAME_AS` (PR #123).
- **Keyword map (ALY-234):** `docs/growth/research/05-keywords.md`. Owners search how to make WhatsApp Business work, not for "a system"; «دفتر الديون» is the owner's word for debts; five new guides proposed for ALY-233; ten new questions for the monthly AI set (to add to `visibility.md` once PR #123 merges). No search volumes yet (needs a Google Ads account).

## Next, in order

1. The founder creates the profiles from `docs/growth/profiles.md` (ALY-230); Google Business Profile after the company lane's answer (ALY-231)
2. Phase 0 with the founder: handles, profiles, approving batch 1 (plan, section 14)
3. ALY-69 the first two weeks of content (drafted; extend the bank to 20–30 posts)
4. ALY-70 SMEs Go Digital requirements (unverified as a programme)
5. ALY-43 QR codes and chat links (built in ALY-112, hidden until go-live; use it for the shop kit)

## Never

- Publish or post anything. Draft; the founder approves against the playbook's 12-point checklist and publishes.
- Use a statistic, client or quote that is not real and permitted.
- Name or attack a delivery app or a competitor.

## Done means

Published by the founder, and the result (saves, shares, conversations started) is logged.
