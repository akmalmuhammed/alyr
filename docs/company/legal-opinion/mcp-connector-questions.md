# A question for the lawyer (ALY-51): an owner's own assistant app reading their shop's data

Prepared 9 Nov 2026 for the founder to add to the brief in `brief.md`. It is one more numbered question for the same written opinion. Nothing here is legal advice and no lawyer has read it. Linear is not edited from here; the founder or the operator adds it to ALY-51.

## What is being built

Today a shop owner can ask ALYR about their business from the workspace or from WhatsApp. ALYR is adding a third way (decision D-170, spec `specs/067-mcp-connector/spec.md`): the owner adds ALYR as a connector in **their own** Claude or ChatGPT account, signs in to ALYR with the email code they already use, and their own app can then ask ALYR questions about **that one business** ("how many bookings today", "what is low on stock") and, later, ask for a change that the owner confirms first.

The facts that matter for the question:

- **ALYR never calls an AI provider.** The owner's app calls ALYR. ALYR has no account with Anthropic or OpenAI for this, sends them nothing on its own, and does not choose the provider. The owner does, under the owner's own account and the owner's own terms with that provider.
- **Off by default, per business.** Only an owner can switch it on, and only after confirming, in words, that what ALYR sends to their app leaves ALYR and is handled by the provider they use there, under their own account. The wording version and the time are kept. An owner or admin can pause it or end any connection at once.
- **What the app can see is cut down before it leaves Doha.** Customers appear as a first name and the last three digits of a phone number. Never a message, a customer's identifier, an address, a salary or an identity document. Amounts the shop is owed or has earned are shown only to the owner and admin roles, never to an agent. The app sees nothing the signed-in person could not see in the workspace.
- **Where the provider is.** Anthropic and OpenAI are in the United States. The data goes there only when the owner asks their own app a question and the app asks ALYR for the answer.
- **Everything is recorded.** Every call the app makes is on the business's activity record: the person, the app, the tool, the arguments (not the answer) and the result.

## The question

**Q-MCP.** When an owner of a business in Qatar connects their own AI assistant account to ALYR, and the assistant then reads that business's information (including limited personal data of the business's customers: a first name and the last three digits of a phone number) held by ALYR in Doha:

1. **Whose responsibility is the transfer** under Law No. 13 of 2016 on Personal Data Protection: the owner's (as the controller who chose the recipient and gave the instruction), ALYR's (as the processor that releases the data), or both? Does it change if the owner is a sole trader, a company, or a person acting for an owner (an admin or an agent) who connects it?
2. **Is it a cross-border transfer ALYR must justify** (a notice, a permit or an approval from the regulator, or nothing), given that ALYR does not choose the recipient, sends nothing unless the owner's own app asks, and sends the minimum described above? If a justification is needed, what is the simplest one that is true (the owner's instruction, the customer's consent when they first message the shop, a notice)?
3. **What must the terms and the confirmation say?** Is the owner's one-time confirmation ("what ALYR sends to this app leaves ALYR and is handled by the provider I use there, under my own account") enough, or must it name the provider and the country, say something to the shop's customers (in the shop's privacy notice or the WhatsApp opt-in), or allow a customer to ask that their data is not shown to such an app?
4. **Is the data minimum right?** Is a first name plus the last three digits of a phone number personal data that needs the same treatment as a full name and number, and if so is it still the right minimum for the owner's own questions (who is the customer owed by, whose booking is at 4 pm)?
5. **What follows if the app later changes something** (stock, a booking, an order) after the owner confirms, or sends a message to a customer through ALYR's own sending layer with the customer's consent and the 24-hour window respected? We do not expect the first version to send anything.

## Why it is a separate question

D-013, the register and the brief treat a model run by a provider ALYR chooses (the question of ALY-329). This is different: ALYR chooses nothing and calls nothing; the owner brings their own account. It may be a simpler case, or it may not be, and the first version is switched off in production until the answer is in.

## What we do not ask

Whether ALYR may later run a model itself (ALY-329, the other half of ALY-51). Whether the owner's own provider is compliant. Anything about card data (ALYR holds none).
