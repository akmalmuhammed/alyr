"""Connected mode: another system sends its sales to ALYR, ALYR hands the customer the paper
(ALY-142, decision D-042, spec 015).

A shop keeps its own POS, accounting or invoicing tool and still wants ALYR's WhatsApp receipt or
invoice for its customers, or wants ALYR to carry only part of the paper trail. This package is
the door for that, and the rules that stop two systems from numbering the same paper.

* `authority`  per shop and per kind of document, who owns the numbers: ALYR or the shop's other
               system. With `external`, ALYR never allocates a number for that kind.
* `terms`      what the shop confirms before connecting (it has each customer's permission to be
               sent their receipt on WhatsApp), and the wording recorded as the consent.
* `keys`       API keys per shop: shown once, stored hashed, scopes, a rate limit per key.
* `ingest`     one sale in, one document out, once: idempotency, totals checked, the customer
               found or made, consent recorded, the paper issued, delivery asked for.
* `webhooks`   events out, signed, retried, with a guard against sending to the shop's own
               network (`ssrf`).
* `sale_imports` the same door for a CSV exported from another POS: preview, apply, undo.
* `words`      every refusal, in English and Arabic (a draft until ALY-66).

Nothing here changes the engine's promises for ALYR-numbered paper: gapless numbers, immutable
once issued, hashed. The external path sits beside them (`documents/service.py`, migration 0043).
"""
