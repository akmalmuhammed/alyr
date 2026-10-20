---
name: alyr-email
description: Write, design or change an email ALYR sends. Use for the sign-in code email (apps/api/src/alyr/core/mail.py), the weekly report email to owners (modules/report.py email()), any new email to an owner, a member of staff or a client (quotes, invoices, setup steps, welcome), the subject lines, the plain-text twin, and the HTML layout, logo, colours, fonts, Arabic and dark mode of any email. Load alyr-design first.
---

# An email from ALYR

Email is ALYR's quietest surface: a sign-in code, a weekly report, later a quote or an
invoice. It is read in clients that strip CSS, block images and invert colours, so the
design is simple tables, inline styles and a plain-text twin. There are no rules yet beyond
the two existing emails; these are derived from the brand and the known breaks.

## Before you start

1. Load `alyr-design` (voice, Arabic, honesty).
2. Read `core/mail.py` (sending through Resend, D-029) and `modules/report.py` `email()`.
   Every email has a subject, a plain text and an HTML part; the API sends them through
   `send()` in `mail.py`, never from a module directly.
3. Read `docs/data-residency.md`: Resend is in the EU; only what that row allows goes in an
   email (a sign-in code; a shop's own figures to its own owners). **Open and click tracking
   stay off.** No tracking pixels, no third-party images.
4. Check Resend's current documentation for anything new you use (inline images,
   attachments, headers).

## Known breaks to fix when you touch them

- The wordmark is retyped as "ALYR" in Arial 700: it must be the logo.
- Colours are literals (`#f6f7f3`, `#15171a`, `#5f666d`, `#e3e6e1`): use `brand.EMAIL` once
  `apps/api/src/alyr/brand.py` is generated (ALY-126); `design-check.mjs` will fail on them.
- No dark-mode handling.
- 16 px rounded panels: the brand uses rules and at most a 2 px radius.
- «خلال {minutes} دقائق» is right only for 3 to 10: use `counted()`.

## Layout

- One column, at most 560 px wide, `role="presentation"` tables, inline styles only, a
  `<!doctype html>` and `<meta name="color-scheme" content="light dark">`.
- **Logo** at the top: the horizontal logo as an image (PNG at 2× for sharpness, width and
  height set, `alt="ALYR"`), never live text. Where the image lives (an inline attachment, or
  a file on an ALYR domain such as `media.alyr.qa`) is a decision with the founder, because
  it publishes a file; until then the symbol as an inline image is the fallback. Never
  load it from a third party.
- Then, in order: what this is (one line), the one thing (the code, the week's number, the
  amount), what to do (one link or button), the small print. Nothing else.
- **One button at most,** Volt with on-signal text and a 2 px radius, a real link with its
  address written beside it for clients that strip buttons. Sign-in emails have no button.
- Rules (1 px line token) between blocks instead of boxes and shadows.
- **Type** from `brand.FONT` (`font.family.email`, `font.family.email-mono`): email clients do
  not load web fonts, so the token is a system stack. If you want the brand faces named first
  for clients that have them, change the token, not the email. Body at least 15 px, small
  print at least 13 px, line height 1.5 (`--leading-arabic-body` in Arabic).
- **Colours** from `brand.EMAIL` (`component.email`: bg, panel, text, muted, rule; light only
  for now). Volt only on the one button or the one figure that is the signal, never as text
  on light; add an email token for it rather than a literal.

## Dark mode

- Declare `color-scheme`, and add a `@media (prefers-color-scheme: dark)` block in `<style>`
  for clients that read it, with the dark token values.
- Assume clients that invert anyway: no text in images, a logo version that reads on both
  (the Carbon logo on a light plate of its own, or both versions swapped by the media query).
- Check the email in light and in a dark client before sending it to anyone.

## Languages

- When the person's language is known (a setting, the shop's language), send that language
  only, with `lang` and `dir` on the root.
- When it is not known (sign-in by email address, owners' reports today), English first, a
  rule, then Arabic in its own block with `dir="rtl"`, `lang="ar"` and `text-align: right`,
  written whole, not translated from the English.
- The subject leads with the fact ("123456 is your ALYR sign-in code"); one language, or both
  separated by " · " when the language is unknown.
- Arabic follows `alyr-design/arabic.md`: «ر.ق» after the amount, Western digits, `<bdi>`
  around "ALYR", codes and amounts, agreement through `counted()`.

## Plain-text twin

Every email has one, carrying everything the HTML says, in the same order, with links
written out. It is what some clients show and what screen readers often read.

## Words

- From ALYR, in ALYR's voice; sentence case; no "Dear valued customer", no marketing in a
  transactional email, no AI words, no response-time promises.
- Say what to ignore: "If you did not ask for it, you can ignore this email."
- Never put a password, a full phone number, a payment card or another shop's data in an
  email; never log the body (`mail.py` logs the status only).
- A future invoice or receipt by email follows `alyr-print` for its fields and formal MSA.

## Done when

- [ ] Subject, HTML and plain text written and tested (`tests/test_mail.py` style: what is
      sent, through the stub transport).
- [ ] Logo is an image, colours from tokens, no third-party request, no tracking.
- [ ] Rendered and looked at: a light client, a dark client, a phone width, images off;
      English and Arabic.
- [ ] Arabic block right-aligned and RTL, agreement correct, no "QAR".
- [ ] Nothing sent to a real person without the founder's yes.
