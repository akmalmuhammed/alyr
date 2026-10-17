# Creative director's rulings on the two critiques

17 Oct 2026. For the builder doing the fix pass on PR #45. Apply `06-critique-design.md` and `07-critique-copy.md` with these rulings; where a ruling here differs from a critique, this file wins. `00-founder-decisions.md` still beats everything.

## Copy (07)

**Apply as written:** every P0 and P1, and P2 items 1–14, except where changed below.

- **P0-1 `/chat`:** take option (b): swap the strings, keep `/chat` in the build. In the same pass, fix the other `/chat` items the critique lists as P1 when they are string-only: "Tue 14 Oct" (use a date whose weekday is right, or drop the weekday), Western digits in Arabic, and neutral sample names in place of real Qatari family names (Al-Kuwari, Al-Emadi, Al-Naimi). Do not redesign `/chat`.
- **P0-2 hero body:** do not add the "Payment links follow…" sentence to the hero; it weakens the first screen. Use: EN "ALYR sets up and looks after the technology for owner-run businesses in Qatar. We start with your WhatsApp: orders, bookings and order tracking in the chat, and your whole team on one number." AR «تجهّز ALYR التقنية للمنشآت التي يديرها أصحابها في قطر، وتتولى متابعتها. ونبدأ معك من واتساب: الطلبات والحجوزات وتتبّع الطلبات داخل المحادثة، وفريقك كله على رقم واحد.» The truth about payments lives in the Payment links module and in `does.body` (critique wording). Meta description, `does.product.line` and `does.body`: critique wording.
- **P1-12 Arabic headline:** Modern Standard, as recommended: «تحوّل رقمياً.» / «بلا فريق تقنية.»
- **P1-5:** remove "in Arabic or English" from `contact.reply` and `final.body`. The founder has not promised written Arabic replies.
- **P1-15 name check:** keep Qirfa Bakery / «مخبز قرفة», monogram «ق». The manual Instagram, Maps and trademark check goes on the founder list in the PR.
- **Sample customer:** "Aisha Hamad" / «عائشة حمد» everywhere on the homepage.
- **"Meta" on `/ar`:** keep Latin "Meta".
- **Social card for `/ar`:** add an Arabic card if `opengraph-image.tsx` can load IBM Plex Sans Arabic within the static build; otherwise leave it and note it.
- **(product) items:** do not change product code. List them in `05-build-log.md` under "For the product lane" (language-aware `fmt_qar`, the «صنف» plural, the seed's Al-Kuwari, "Assistant" label, the setup checklist line); the operator files the ticket.

## Design (06)

**Apply as written:** both P0s, every P1, and P2 items 1–12.

- **Lift 1 and 2 of "the five changes": do them.** The fold gets its gaps and becomes the signature: at the band entry, at the top of the closing call, and in the dark-mode band tone. The hero figure sits on a Carbon plate in columns 8–12, with its top start corner cut at 45° (6 rem) and a 0.5 rem Paper gap at 45° between the phone and the order record. This is the answer to "it looks like Ramp". Mirror everything in RTL.
- **Lifts 3–5:** covered by P1-2, P0-1, P1-3, P1-6 and P2-9. Target about 12,500 px at 1440 in English, with nothing removed.
- **P1-4:** in the email state, the note under the hero and price buttons is "A person from ALYR replies." plus the address (Arabic to match). "Our WhatsApp line opens soon" appears at most once, in the FAQ.
- **P2-1 time formats:** use exactly what the product prints in each drawn screen (03 §2); where the page writes a time in its own text, use "4:05 PM" in English and the same digits with «م» or «ص» in Arabic.
- **P2-13 `/chat`:** the WhatsApp-style bubbles stay (the founder asked for them). The line "ALYR adds payments, books and a website" changes to match the homepage's unnamed slots, as a string fix with the other `/chat` claims.

## Checks before the fix pass is done

- 320 × 700, both languages: `document.documentElement.scrollWidth === 320`, and the sticky bar is fully on screen.
- LCP under 2.5 s on Lighthouse mobile, both languages; Performance ≥ 90 and Accessibility 100; zero serious or critical axe issues.
- No JavaScript: the header is readable over every section.
- Dark mode: the band and the closing call clearly separate from the page.
- Fresh screenshots replace `shots/`, plus `shots/fold-*.png` showing the fold at rest in both languages.
