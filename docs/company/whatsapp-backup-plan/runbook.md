# Runbook: using the backup for a pilot shop

Use this only after the founder chooses option C or D in [README.md](README.md). Nothing here has been started.

## 1. Before the visit (ALYR side)

| Step | Option C (shop's provider account) | Option D (shop's own Meta app) | Owner |
|---|---|---|---|
| Per-shop credentials | Store the shop's provider API key per number, encrypted, never in git or chat | Store the shop's Meta token and app secret per number, encrypted | Product |
| Channel | Add a provider channel next to `channels/meta.py` and `channels/simulator.py`, behind the same interface | Make `MetaChannel` take credentials per number instead of the single `ALYR_META_ACCESS_TOKEN` | Product |
| Webhooks | A webhook route for the provider's events, with its own way of proving the sender | Webhook signature checked with each shop's own app secret | Go-live |
| Templates | Create ALYR's 16 templates (32 with Arabic) in the shop's account | Same, in the shop's own account | Go-live |
| Data residency | Add the provider to `docs/data-residency.md` with location and legal basis | No new service (Meta is already listed) | Company |
| Tests | Simulator tests for the new channel; one live round trip on a test number | One live round trip on a test number | Product |

Estimate: two to three days of build for either option. Today `MetaChannel` holds one token for all of ALYR (`config.py`, `ALYR_META_ACCESS_TOKEN`), so per-shop credentials are needed for both.

## 2. During the visit

**Option C**
1. The owner opens the provider's sign-up on their own phone or laptop and enters their own details and card. ALYR never types their passwords or card.
2. The owner connects their number with coexistence: in the WhatsApp Business app, Settings, Account, Business Platform, and follows the provider's steps.
3. The owner chooses whether to copy the last six months of chats.
4. The owner creates an API key and pastes it into ALYR's setup screen.
5. ALYR sends a test message to the owner's own phone.

**Option D**
1. The owner signs in to Meta for Developers with their own Facebook account and creates the app and business portfolio, following ALYR's checklist.
2. The owner adds the number. It will no longer work in the WhatsApp Business app, so confirm this out loud first.
3. The owner creates a system user token and pastes it into ALYR's setup screen.
4. ALYR sends a test message to the owner's own phone.

## 3. When ALYR's own Tech Provider approval arrives

- **Option D shops:** move each number into ALYR's onboarding with Meta's documented migration; copy templates first so nothing stops.
- **Option C shops:** ask the provider first. Coexistence numbers cannot be migrated between accounts, so this may mean disconnecting from the provider and connecting again through ALYR, at a quiet hour, with the owner present.
- Then delete the shop's provider key or Meta token from ALYR.

## 4. What to tell the shop, plainly

- The number stays theirs in every option.
- In option C they pay the provider a monthly fee (unless ALYR covers it), plus Meta's per-message fees.
- In option D the number stops working in the WhatsApp Business app.
- In both, the setup may be redone once when ALYR's own approval arrives.
