# WhatsApp backup plan: connecting shops before ALYR is a Meta Tech Provider

Researched 16 October 2026 for the founder. Linear: ALY-77. Main plan: ALY-39 and ALY-76.

## The question

The main plan is for ALYR to become a Meta **Tech Provider**. Then every shop connects its own WhatsApp number in about ten minutes through Meta's own window, keeps its WhatsApp Business app, and needs no approval of its own. Becoming a Tech Provider needs Meta business verification of ALYR, which needs the company's CR.

If the CR or Meta's review is slow and a paying shop is ready, what can we do instead?

## The short answer

**No partner removes the need for the CR completely.** Every route that lets a shop keep its WhatsApp Business app goes through someone who is a Meta Tech Provider or Solution Partner, and the partners we checked ask their own software customers to be registered companies and, past a handful of numbers, Tech Providers too.

What a backup *can* do is let the first one to three shops go live while ALYR's own approval is pending. There are two workable ways.

| | Option | Shop keeps its WhatsApp app | Needs ALYR's CR | Cost to start | Best for |
|---|---|---|---|---|---|
| A | **Main plan:** ALYR becomes a Meta Tech Provider | Yes | Yes | Free (Meta's message fees only) | Everyone, once approved |
| B | ALYR joins **360dialog's partner programme** | Yes | Yes, a registered company | €250 a month plus €49 per number | Not worth it for 1 to 3 shops |
| C | **The shop opens its own account with a provider** (for example 360dialog) and gives ALYR access | Yes | No | About €49 a month per number, paid by the shop | **The backup for a pilot before the CR** |
| D | **The shop's own Meta app**, set up together during the visit | No: the number leaves the WhatsApp Business app, or the shop uses a second number | No | Free (Meta's message fees only) | A shop willing to use a new or separate number |

Twilio is not a shortcut: its documentation says software companies must join Meta's Tech Provider programme to connect their customers' numbers.

## Recommendation

1. **Keep the main plan.** Record the two demo videos for Meta's app review now, and submit business verification the day the CR is issued.
2. **Backup for the first pilot before the CR: option C**, with ALYR covering the provider's monthly fee for that shop if it helps close the sale. It keeps the shop's number and app, and needs nothing from ALYR legally.
3. **If the shop can use a separate number: option D**, which costs nothing.
4. **Do not take option B** unless the CR is done and Meta's review stalls for weeks. It costs €250 a month before any shop is connected.

## Before any backup is used

- **Code work** (see [runbook.md](runbook.md)): a second channel for the provider, and credentials per shop instead of one ALYR-wide token. About two to three days of work, not started.
- **Data residency:** the provider would receive every message. It must be added to `docs/data-residency.md` with its location and legal basis before the first message (hard rule 2).
- **A known trap:** 360dialog's documentation says numbers connected with coexistence (keeping the app) **cannot be migrated** to another WhatsApp Business account. Moving a pilot shop from option C to ALYR's own approval later may mean disconnecting and connecting again, not a smooth migration. Ask 360dialog before signing anything.

## Decisions for the founder

1. Is option C acceptable as the backup for the first pilot? (Recommended: yes.)
2. If yes: does ALYR pay the provider's monthly fee for pilot shops, or the shop?
3. Shall I ask 360dialog in writing the three open questions in [options.md](options.md#open-questions-to-ask-the-provider)? That is an outside message, so it needs your yes.

## Files in this folder

- [options.md](options.md): each option in detail, with costs, limits, risks and sources.
- [runbook.md](runbook.md): what we would do, step by step, if option C or D is chosen.
