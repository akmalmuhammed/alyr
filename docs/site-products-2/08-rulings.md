# Creative director's rulings: Shelf and Docs pages

21 Oct 2026. For the fixer on PR #102. Apply `06-critique-design.md` and `07-critique-copy.md` with these rulings; this file wins where they differ. `00-founder-decisions.md` beats everything.

## Copy (07)

- **Apply every P0 and P1.** Apply P2 where it is a string change.
- **Delivery by WhatsApp.** Every sentence that says the paper reaches the customer names its channel and condition: the PDF in the WhatsApp chat while the customer's conversation is open, or by email or a link. Where a sentence is too short for that, say "sends it to your customer by WhatsApp, email or a link" only if a fact or question on the same page states the condition. The hero lead must carry the condition itself, or not mention delivery. Remove "from the shop's number".
- **Remove "go-live date"** on Docs. Replace «جاهز» with the Arabic for "built", per the critique.
- **The "Not yet" lists.** Remove barcodes and expiry (Shelf) and the government e-invoicing system (Docs), and anything else that reads as coming. This settles the builder's open question: D-039 says nothing coming is shown. Keep a "Not yet" item only where leaving it out would make another line on the page untrue. Otherwise, remove the whole list if it ends up empty.
- **The code hand-off caption:** five unmatched codes in ten minutes, as the product does.
- **Product-lane wording** found in the product's own text: list it in `05-build-log.md` under "For the product lane". Do not change product code.

## Design (06)

- **Apply the P0 and every P1.** Apply P2 where it is small.
- **P0, the signature figures play out of sight.** Start each only when the figure is substantially in view: at least 60% visible, or its own top past the middle of the viewport. On phones, start each step as it comes into view, so the ending is seen. Check that the Docs figure's start and its "Sent" tick are both visible together at 1440 × 900, or scale or crop the figure until they are. Keep "plays once", reduced motion and no-JS.
- **P1, Docs tells each story three times.** Cut it to the length of the family. Target about the height of `/accounts` at 1440, and keep Shelf near it too. Remove repeats rather than squeezing spacing. The signature, the demo tabs and "everything it does" should each tell a different part.
- **P1, plate styles.** No rounded corners on figure backgrounds. Use the cut corner or square, as the rest of the site does, through tokens.

## Verification (lean)

- `pnpm lint`, `pnpm exec tsc --noEmit`, `pnpm build`, `bash scripts/build-site.sh` and the drift check.
- Screenshots of the changed sections in both languages at 1440 and 390, plus one dark pass of each new page.
- The signature figures measured with `--eval`: they start in view and end in view.
- axe on `/shelf` and `/docs` in both languages, and Lighthouse on both.
- Page heights at 1440, recorded in the log.
- Push to PR #102. Note that CI cannot run until the founder fixes GitHub billing.
