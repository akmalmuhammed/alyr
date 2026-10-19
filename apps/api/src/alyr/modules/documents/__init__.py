"""Documents: receipts, invoices, quotes, delivery notes, statements, credit notes, deposit
receipts and proformas for every shop (ALY-138, decision D-042, spec 011).

One engine, three ways in (later packages: from ALYR's own orders and bookings, typed by
hand, sent by another system's API) and two ways out (send, export). This package is the
engine itself:

* `money`      integer minor units, the rounding rule, how an amount is written in each language
* `kinds`      what each kind of document is, requires and is numbered like
* `words`      every word a document says, English and Arabic together (a draft until ALY-66)
* `canonical`  the canonical JSON and SHA-256 hash of an issued document
* `settings`   the shop's seller details, look and rules
* `numbering`  gapless numbers under a row lock
* `service`    drafts, issuing, credit notes, reading
* `access`     who may do what
* `render/`    the PDF

The module is called `documents` in `catalog.py` and is off for every shop: no product and no
starting setup includes it until the screens and the sales hooks (packages 2 and 3) exist.
"""
