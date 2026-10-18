# Spec 003: Owner actions over WhatsApp (phases 0 and 1)

Status: phases 0 and 1 built in ALY-130. Decision: D-040. Design (architecture, one edit end to end, phases, guardrails): https://www.figma.com/design/FymEODsZGzeQTXciYIvYWI

An owner or a member of staff can ask ALYR about the shop from the shop's own WhatsApp number, and later change things from it, as well as from the workspace. Both doors go through one set of **actions**, so permissions, the modules a shop has switched on, and the record of who did what are written once.

## Who it is for

- **Portal-first:** managers at a desk who set up and review. They never need a command.
- **Chat-first:** owners on the shop floor who want a number or a one-line answer from their phone.
- **Mixed:** both, on the same data. Each person has a channel preference (portal, WhatsApp, both); it decides where ALYR nudges them in a later phase and shows which door is used.

## Phase 0: who is writing

**The problem.** `contacts.role = 'staff'` is only a flag. Nothing proves who holds the number, nothing says which person or which role it is, and nothing but the seed data sets it.

**The link.**
1. A signed-in person asks the workspace for a link code: `POST /api/owner/whatsapp-link`. The answer holds the code, the message to send (`LINK 48271936`) and how long it lasts. Only a hash is stored.
2. From their phone they send that message to the shop's WhatsApp number.
3. The inbound path sees `LINK <8 digits>` from any contact. If the code matches a live code of this shop, the contact becomes theirs: `contacts.user_id` is set, `role` becomes `staff`, `verified_at` is stamped, the code is used up, and the link is on the activity record (channel `whatsapp`).
4. The person can unlink (`DELETE /api/owner/whatsapp`), which clears the link and records it. The number stays a staff number (so a weekly report setting survives) but runs no commands.

**Why a code and not a typed number.** WhatsApp's business-scoped user ID can arrive without a phone number (D-009), so a typed number cannot be matched to the sender. A code sent from the phone proves the person controls both the login and the phone, with nothing to match.

**Guessing.** A code is eight digits, lasts ten minutes, and every wrong `LINK` attempt against the shop counts against all of the shop's live codes; at ten the codes are dead and the person asks for a new one. A reply never says whether a code existed or had expired: "That code did not work."

**Roles are read each time.** What a number may do comes from the person's membership (owner, admin, agent) when the message arrives, not from a copy. Removing the person or changing their role takes effect on their next message.

**One number per person per shop.** A new link replaces the old number.

**The permission table** (`core/actions.py`):

| Action | Owner | Admin | Agent | Needs module |
|---|---|---|---|---|
| `today` | yes | yes | counts only | each section needs its own module |
| `orders` | yes | yes | no amounts | `orders` |
| `bookings` | yes | yes | yes | `bookings` |
| `owed` | yes | yes | no | `ledger` |

Agents see no money (D-035), in chat as in the workspace.

**The record.** `activity.channel` (`portal`, `whatsapp`, `system`) says which door. Reads are not recorded (they would bury the record); every change in later phases is. Link and unlink use a new subject, `team`.

## Phase 1: ask

Commands, in English and Arabic, from a linked staff number only (a customer's `TODAY` is an ordinary customer message and is left alone; only `LINK <code>` is read from anyone):

| Send | Answer |
|---|---|
| `TODAY` / «اليوم» | Today in the shop's time zone, one section per module the shop has on, from the same numbers as the weekly report |
| `ORDERS` / «الطلبات» | Open orders (new, confirmed, ready), newest first, up to 8 |
| `BOOKINGS` / «الحجوزات» | Today's bookings in time order |
| `OWED` / «المستحقات» | Total owed, the five largest balances, which are late |
| `HELP` / «مساعدة» | The commands this person's role and the shop's modules allow |
| `REPORT` | As before (the weekly report card) |

Anything else from a linked number goes on to the modules exactly as before. A staff number that is not linked gets one line saying how to link it, for the words above only.

**Portal door.** `GET /api/owner/ask/{today|orders|bookings|owed}` runs the same action for the signed-in person, so the workspace and the chat can never disagree. The answer is data; the chat words come from `modules/owner/chat.py`.

**Links in chat.** Each answer can end with a link to the workspace screen. It is added only when `ALYR_WORKSPACE_URL` is set, because the address in `ALYR_PUBLIC_WEB_URL` today is the laptop tunnel, which does not serve the workspace (it answers 404). Until always-on hosting (ALY-10) there is no link.

## Not in this spec

- **Phase 2:** edits that ask YES and offer UNDO (`CLOSED today`, `STOCK`, `PRICE`). Needs the pending-confirmation table, built then. Gate: a named pilot owner says which five edits they want (ALY-58).
- **Phase 3:** operate (move or cancel a booking, mark an order, send a reminder through the consent layer).
- **Phase 4:** nudges from the Agent's "needs you now" cards, and AI drafts. Needs the data-location answer (ALY-51) and Meta's pricing rule (ALY-64).
- **The workspace screen** for linking a number (a "Link WhatsApp" entry in Team), with its English and Arabic words. Until it exists a number is linked through the API.

## Tests

`apps/api/tests/test_owner_actions.py`, through the simulator and real PostgreSQL: the link (right code, wrong code, expired, used twice, ten wrong guesses, relink, unlink), every command in both languages, roles (an agent sees no money and no `OWED`), modules off, a customer cannot use staff commands, a removed member is refused, the portal route gives what the chat gives, and the shop's isolation (a code from another shop does nothing).
