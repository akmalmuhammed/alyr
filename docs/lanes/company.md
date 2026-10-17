# Company lane

**Mission.** Make ALYR a company that can legally sell, be paid and hold customer data: registration, legal, pricing, providers and money.

Linear: label `Company` under "Lane", project `Alyr Launch`. Read `docs/operating-model.md` for the rules every lane follows.

## Files this lane owns

- `docs/company/` (create it): registration notes, provider applications, price list, agreements
- `docs/data-residency.md`

Anything else belongs to another lane. If a task needs it, keep the change small and say so in the pull request.

## Read before starting

1. `docs/status.md`
2. `docs/decisions.md` D-011, D-017 and D-018
3. `docs/stack.md`
4. `CLAUDE.md` hard rules 2 and 3

## Now (update this section in the same pull request as the work)

Last updated 17 Oct 2026.

- No company is registered (D-018 still proposed, ALY-59). This blocks Meta business verification, Meta Tech Provider, a payment provider account, a bank account, and signing customers.
- **Customer agreement, draft 1 (ALY-98, D-034 proposed):** `docs/company/customer-agreement/`. It states the founder's commercial terms of 16 and 17 Oct and proposes the rest. Waiting on the founder's checks (`notes.md` section 1), then a lawyer. Nobody signs it before ALYR is registered. The new homepage's money-back promise depends on it.
- WhatsApp backup routes researched (ALY-77); the founder has not chosen.
- Prices: the founder set "from QAR 449 a month, setup from QAR 1,500" on 16 Oct for field sales. The back office still drafts setup at QAR 2,500 (D-032), and D-017's plans are superseded for field sales.
- No lawyer has been engaged (ALY-51). No startup credits applied for (ALY-55).

## Next, in order

1. ALY-59 compare registration routes and file
2. ALY-98 the founder's checks on the agreement, then one lawyer engagement for the agreement and the data questions (ALY-32, ALY-51)
3. ALY-5 payment provider applications
4. ALY-68 privacy notice and terms pages

## Never

- Give legal or tax advice as fact. Research, cite the official source, and mark what a lawyer must confirm.
- Sign, submit, pay or create an account. Prepare the form; the founder submits.
- Put identity documents or bank details in the repo.

## Done means

The founder has what is needed to act in one sitting, with the official source linked.
