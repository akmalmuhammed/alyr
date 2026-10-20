# Connecting another system to ALYR

For a POS vendor's developer, or the IT person of a shop that keeps its sales in another POS, accounting or invoicing tool. Written 20 Oct 2026 (ALY-142). The Arabic words in the product are a draft until a native review (ALY-66), and nothing here has been tried against a real phone: see "What ALYR does not do yet" at the end.

## What it is for

Your system makes the sale. ALYR makes the **digital receipt or invoice** (a PDF, in Arabic and English) and **sends it to the customer on WhatsApp** (or by email), so the customer gets a receipt on their phone and not a paper. Your system can also hear back when the document was delivered or could not be.

You decide, for each kind of document, **who owns the numbers**. This matters because two systems must never number the same kind of paper:

| The shop chooses | What ALYR does |
|---|---|
| **Your system numbers receipts** (`external`) | ALYR **never** gives a receipt a number of its own. You send your own number in `external_document_number`; it is printed on the PDF, which says it was issued by the seller's own system and delivered by ALYR. ALYR's counters do not move. ALYR's own automatic receipts (from orders customers place in ALYR) are skipped, so nothing is on paper twice. |
| **ALYR numbers receipts** (`alyr`, the default) | ALYR numbers the document with its own gapless counter (`RC-0042`). Your `external_document_number`, if you send one, is kept beside the sale for your records. |

The choice is per kind (receipt, invoice, quote, proforma invoice, delivery note, credit note, deposit receipt) and is made by the shop's owner or an admin in the workspace, under Connections, Connect another system.

## Get a key

The owner opens the workspace, **Connections**, **Connect another system**, confirms the terms (that the shop has each customer's permission to be sent their receipt on WhatsApp), and makes a key: a name, what it may do (scopes) and a limit of calls a minute. The key is shown **once**; ALYR keeps only a hash. A key belongs to one shop, never opens the workspace and can be revoked at any time.

A key looks like `alyr_k1_<8 characters>_<43 characters>`. The first part (the prefix) is not secret: the shop sees it in its list to tell keys apart. Send the key as a bearer token:

```
Authorization: Bearer <your key>
```

| Scope | Lets the key |
|---|---|
| `sales:write` | Send sales and credit notes |
| `documents:read` | Look up a sale or a document and fetch its PDF |
| `webhooks` | Add, change and remove webhook addresses |

Start with `GET /api/connect/ping`: it answers `200` with the key's name, scopes and limit if the key is good.

The base address is the shop's web address plus `/api/connect`. The workspace screen shows it.

## Rate limit

Each key has its own limit, 120 calls a minute unless the shop chose another (1 to 1,000). Every answer says where you stand: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` (seconds to the next minute). Over the limit you get `429` with `Retry-After` (seconds) and `"code": "rate_limited"`. A refused call still counts, so wait.

## Send a sale

`POST /api/connect/sales` with two things that make it safe to retry:

* an **`Idempotency-Key` header** (8 to 120 letters, digits, `- _ . :`): a new one for each new sale, **the same one when you retry**;
* **`external_sale_id`**: your own ID for the sale.

A sale posted twice makes **one** document:

| You send | ALYR answers |
|---|---|
| The same key and the same body again | The first answer, with `"replayed": true`, status `200`. Nothing is made or sent twice. |
| The same key with a different body | `409 idempotency_key_reused`. |
| The same sale (kind and `external_sale_id`) under a new key, same body | The first answer again (`200`, replayed). |
| The same sale under a new key, different body | `409 sale_exists`. |
| Six identical calls at the same moment | One document. |

Money is a **whole number of the currency's smallest unit** (`100` is QAR 1.00, `1250` is QAR 12.50). A decimal such as `12.5` is refused, not rounded. A quantity is a number or a string with up to three decimals.

```
curl -sS https://YOUR-SHOP-ADDRESS/api/connect/sales \
  -H "Authorization: Bearer $ALYR_KEY" \
  -H "Idempotency-Key: pos1-2026-10-20-000417" \
  -H "Content-Type: application/json" \
  -d '{
    "external_sale_id": "000417",
    "kind": "receipt",
    "external_document_number": "R-000417",
    "customer": {"phone": "+974 5555 0123", "name": "Fatima Al-Kuwari", "name_ar": "فاطمة الكواري"},
    "lines": [
      {"description": "Fresh Arabic bread", "description_ar": "خبز عربي طازج", "sku": "BR-01",
       "quantity": 12, "unit_price_minor": 350},
      {"description": "Date cake", "description_ar": "كعكة التمر", "sku": "CK-02",
       "quantity": 2, "unit_price_minor": 4500, "discount_minor": 500}
    ],
    "totals": {"total_minor": 12700},
    "payment": {"method": "cash", "amount_minor": 12700, "reference": "", "paid_at": "2026-10-20T11:42:00+03:00"},
    "language": "ar",
    "send": true
  }'
```

### The body

| Field | Meaning |
|---|---|
| `external_sale_id` | Required. Your ID for the sale, up to 120 characters. |
| `kind` | `receipt` (default), `invoice`, `credit_note`, `quote`, `proforma`, `delivery_note`, `deposit_receipt`. |
| `external_document_number` | The number your system gave the document, up to 80 characters (letters, digits, spaces and `. _ / # : -`). **Required** when the shop gave this kind to your system. Never reused: a number already on a document of this shop is `409 number_taken`. |
| `customer` | `phone` (international format, `+974...`, required), and optionally `name`, `name_ar`, `company`, `tax_id`, `email`, `address`, `address_ar`. A receipt without a name is made out to the phone number; an invoice needs a name or a company. ALYR finds the shop's customer by phone and makes one if there is none; it does not rename a customer the shop already has. |
| `lines` | 1 to 200 lines: `description` and/or `description_ar` (one is needed), `sku`, `quantity`, `unit` (`piece`, `kg`, `g`, `l`, `m`, `box`, `pack`, `portion`, `hour`, `day`, `service`), `unit_price_minor`, `discount_minor`, `tax_rate_bp` (500 is 5%). |
| `totals` | `total_minor` (required), and optionally `tax_minor`, `discount_minor`, `rounding_minor` (your own cash rounding, already inside the total). |
| `payment` | `{method, amount_minor, reference, paid_at}` with `method` one of `cash`, `card`, `bank_transfer`, `link`, `credit`, `cheque`, `other`; or `"unpaid"`. A **receipt** is for money paid in full; an **invoice** may be unpaid or part paid. |
| `currency` | `QAR` (default), `SAR`, `AED`, `OMR`, `KWD`, `BHD`, `USD`. |
| `branch` | One of the shop's branches (default `main`). |
| `language` | `ar` or `en`: the customer's language, for the message. |
| `sold_at` | When the sale was made (not in the future, not older than two years): it is the date on the paper when your system numbers the kind. |
| `due_date` | For an invoice. |
| `send` | `true`: send the document to the customer on WhatsApp now. `false`: do not. Leave out: follow the shop's settings. |
| `credits_sale_id`, `reason` | For a `credit_note`: the `external_sale_id` of the earlier sale it credits (ALYR must have received it) and why. |

### Totals

ALYR works the total out from your lines, line by line, and compares it with yours. A difference of up to **one minor unit per line** (the way systems round differently) is accepted and shown on the paper as a "Rounding" line, so the total ALYR prints is the total your till printed. A bigger difference is refused: `422 totals_mismatch`, with `expected_total_minor`, `sent_total_minor` and `tolerance_minor`.

### The answer

`201` for a new sale, `200` for a replay:

```json
{
  "replayed": false,
  "sale": {"external_sale_id": "000417", "kind": "receipt", "external_document_number": "R-000417", "received_at": "..."},
  "document": {"id": "…", "kind": "receipt", "status": "issued", "number": "R-000417",
               "number_authority": "external", "issue_date": "2026-10-20", "currency": "QAR",
               "totals": {"total_minor": 12700, "paid_minor": 12700, "balance_minor": 0, "...": "..."},
               "hosted_url": "https://…/d/shop?t=…", "related_document_id": null},
  "customer": {"contact_id": "…", "created": true},
  "consent": "granted",
  "delivery": {"asked": true, "state": "queued", "last": null},
  "matched_items": [{"position": 1, "sku": "BR-01", "item_id": "…", "variant_id": null}]
}
```

`delivery.state` moves on: `queued`, `sent`, `delivered`, `not_delivered`. Poll `GET /api/connect/sales/{external_sale_id}` or use webhooks. `matched_items` lists the lines whose `sku` is an item in the shop's Catalog; it is a link only. **ALYR changes no stock for your sale**: your system owns its stock.

### Credit notes

Send the return as its own sale: `"kind": "credit_note"`, a new `external_sale_id`, `credits_sale_id` set to the earlier sale, a `reason`, the credited lines and totals. A credit note cannot add up to more than what it credits; when the credit notes cover all of it, the original document becomes `void` (it stays on record). If ALYR has not received the original, you get `404 credited_sale_unknown`: send the original first.

## Who is messaged, and consent

WhatsApp asks every business to have a customer's permission before it starts a conversation. The shop confirmed, when it connected you, that it has each customer's permission to be sent their receipts, invoices and credit notes. When a sale asks for delivery, ALYR records that on the customer as a **service** consent with source `connected_sale`, the shop's confirmation and the key that sent the sale. It covers these documents only: marketing is a different thing and is never granted this way.

* A customer who has told the shop to **stop** is **never messaged**, whatever the shop says. The document still exists; the delivery shows `not_delivered` with the reason `opted_out`.
* Inside the customer's 24-hour window the PDF goes as a WhatsApp document message with a short caption. Outside it only an approved WhatsApp template can start the conversation. **The three document templates are written and not yet approved by Meta**, so for now such a send is recorded at once as `not_delivered`, reason `template_not_approved`, and ALYR falls back to **email** if the customer has an address on file. The hosted link (`hosted_url`) always works and can be passed on another way; it is in the `document.failed` event too.

## Look things up

* `GET /api/connect/sales/{external_sale_id}` (scope `documents:read`): the sale, its document and its delivery.
* `GET /api/connect/documents/{id}`: the document in full (lines, totals, who numbered it, credit notes, delivery state, `hosted_url`).
* `GET /api/connect/documents/{id}/pdf`: the PDF.

## Webhooks

Register addresses in the workspace (Connections), or with a key that has the `webhooks` scope: `GET/POST /api/connect/webhooks`, `PUT/DELETE /api/connect/webhooks/{id}`, `POST .../{id}/rotate-secret`, `POST .../{id}/test`, `GET .../{id}/deliveries`. Creating one returns a **signing secret, once**.

Events: `document.issued`, `document.delivered`, `document.failed`, `document.cancelled`, `payment.recorded` (and `webhook.test` for a test). Each message is a POST of JSON:

```json
{"id": "f1c0…", "type": "document.issued", "created_at": "2026-10-20T08:42:11Z",
 "data": {"document_id": "…", "kind": "receipt", "number": "R-000417", "number_authority": "external",
          "currency": "QAR", "total_minor": 12700, "paid_minor": 12700, "balance_minor": 0,
          "issue_date": "2026-10-20", "source": "external", "source_ref": "000417",
          "related_document_id": null}}
```

The data names documents by ID and number and money by minor units, and carries **no customer name, phone or address**; your system knows its sale from `source_ref` (your `external_sale_id`). `id` is the same on every retry: ignore a message whose `id` you have handled. `document.delivered` is sent once, when WhatsApp reports the document delivered (an email has no delivery report, so it never produces this event; a failed email produces `document.failed`).

### Verify the signature

Every request carries:

| Header | Value |
|---|---|
| `X-Alyr-Event` | The event type |
| `X-Alyr-Delivery` | The event `id` |
| `X-Alyr-Timestamp` | Unix time in seconds when this attempt was made |
| `X-Alyr-Signature` | `sha256=` and the lowercase hex HMAC-SHA256, keyed with your secret, of the text `<timestamp>.<raw body>` |

Compute it over the **raw bytes** you received (not re-encoded JSON), compare in constant time, and refuse a timestamp more than five minutes old. Answer with any `2xx` within a few seconds.

```python
import hashlib, hmac, time

def verify(secret: str, headers: dict, raw_body: bytes) -> bool:
    stamp = headers["X-Alyr-Timestamp"]
    if abs(time.time() - int(stamp)) > 300:
        return False
    expected = "sha256=" + hmac.new(secret.encode(), f"{stamp}.".encode() + raw_body,
                                    hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, headers["X-Alyr-Signature"])
```

```js
import { createHmac, timingSafeEqual } from "node:crypto";

export function verify(secret, headers, rawBody /* Buffer */) {
  const stamp = headers["x-alyr-timestamp"];
  if (Math.abs(Date.now() / 1000 - Number(stamp)) > 300) return false;
  const expected = "sha256=" + createHmac("sha256", secret).update(`${stamp}.`).update(rawBody).digest("hex");
  const given = Buffer.from(headers["x-alyr-signature"] ?? "");
  const wanted = Buffer.from(expected);
  return given.length === wanted.length && timingSafeEqual(given, wanted);
}
```

### Retries, the log and switching off

If your address does not answer `2xx` ALYR tries again, eight attempts in all: now, then after 30 seconds, 2 minutes, 10 minutes, 30 minutes, 1 hour, 3 hours and 6 hours. The owner sees every message, its attempts and the last answer (the first 500 characters) in the workspace. An address that has failed ten times in a row **and** has had no success for 24 hours is switched off, and the owners and admins are emailed (when email is set up); nothing more is sent until a person switches it on.

### Which addresses are allowed

ALYR sends only to public addresses: **https only**, a domain name (not an address written as numbers), no user name or password in it, port 443 or 1024 and above. Names that mean "this machine" or a private network (`localhost`, `*.local`, `*.internal`, a name with no dot) are refused. ALYR looks the name up **each time it sends** and refuses it if any answer is a private, loopback, link-local or otherwise reserved address; it connects to the address it checked. **Redirects are never followed**: answer at the address you gave. Timeouts are short (3 seconds to connect, 10 in all).

## Import a file instead

A POS that can export a file can skip the API: Connections, Connect another system, **Import sales from a file**. CSV (UTF-8, or Arabic Windows-1256; comma, semicolon or tab) or Excel, one row per line, rows with the same sale ID are one sale. Download the template for the columns. ALYR finds columns by their names (English or Arabic); you can change the mapping and **save it** for the next file. You see **every row checked, with its number, in English and Arabic**, before anything is made; applying makes everything in **one transaction** through the same door as the API (so a sale ALYR already has is skipped, never made twice). A file holds up to 200 sales and 2,000 rows. An import sends nothing unless you tick "send". **Undo** takes back the newest import while nothing in it has been sent: its documents are **withdrawn** (kept and marked, never deleted) and their sales can be imported again. Undo is not possible for documents that ALYR numbered (issued paper with an ALYR number is never taken back: cancel it with a credit note).

## Errors

Every refusal is JSON: `detail` (English), `code` (to program against), `message_ar` (Arabic), and what says where (`field`, and numbers where useful). A malformed body is `422` with `code: validation_error` and a `detail` list, one entry for each problem (`loc`, `msg`, `type`).

| Status | `code` | Meaning |
|---|---|---|
| 400 | `idempotency_key_needed` | Missing or malformed `Idempotency-Key` |
| 401 | `key_missing`, `key_invalid`, `key_revoked` | No key, a wrong key, a revoked key |
| 403 | `scope_missing`, `module_off` | The key lacks the scope; the shop has not got Documents on |
| 404 | `sale_not_found`, `document_not_found`, `credited_sale_unknown` | |
| 409 | `idempotency_key_reused`, `sale_exists`, `number_taken`, `terms_not_accepted`, `credit_too_big`, `already_void`, `cannot_credit` | See above |
| 413 | `body_too_large` | More than 512 KB |
| 422 | `totals_mismatch`, `phone_invalid`, `external_number_needed`, `external_number_invalid`, `receipt_needs_payment`, `payment_not_for_kind`, `payment_too_big`, `credits_sale_needed`, `customer_name_needed`, `currency_not_supported`, `sold_at_invalid`, `branch_unknown`, `registration_needed`, `webhook_url_invalid`, `webhook_url_blocked`, `webhook_url_unresolved`, `webhook_events_invalid` | The sale or the address is not acceptable; the words say what to change |
| 429 | `rate_limited` | Wait `Retry-After` seconds |

`registration_needed` is for a kind ALYR numbers: an invoice needs the shop's commercial registration number in its document settings (a receipt does not). For a kind your system numbers, the registration is your system's business and ALYR does not ask.

## A tiny client

```python
import json, os, urllib.request, uuid

BASE = "https://YOUR-SHOP-ADDRESS/api/connect"

def send_sale(sale: dict, idempotency_key: str):
    request = urllib.request.Request(
        f"{BASE}/sales", data=json.dumps(sale).encode(), method="POST",
        headers={"Authorization": "Bearer " + os.environ["ALYR_KEY"],
                 "Idempotency-Key": idempotency_key, "Content-Type": "application/json"})
    with urllib.request.urlopen(request, timeout=15) as answer:
        return json.load(answer)

# Make the key once per sale and keep it with the sale: a retry uses the same one.
key = f"pos1-{uuid.uuid4()}"
```

```js
const BASE = "https://YOUR-SHOP-ADDRESS/api/connect";

export async function sendSale(sale, idempotencyKey) {
  const response = await fetch(`${BASE}/sales`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.ALYR_KEY}`, "Idempotency-Key": idempotencyKey,
               "Content-Type": "application/json" },
    body: JSON.stringify(sale),
  });
  if (response.status === 429) {                       // wait and send the SAME key again
    await new Promise((r) => setTimeout(r, Number(response.headers.get("retry-after")) * 1000));
    return sendSale(sale, idempotencyKey);
  }
  return response.json();
}
```

Retry on a network failure or a `5xx` with the **same** key; never on a `4xx` other than `429`.

## Limits

| What | Limit |
|---|---|
| Request body | 512 KB |
| Lines in a sale | 200 |
| Sales / rows in an import file | 200 / 2,000 |
| Active keys per shop | 10 |
| Webhook addresses per shop | 10 |
| Calls a minute per key | 1 to 1,000 (120 to start) |

## What ALYR does not do yet

* No real WhatsApp message, email or phone has been used: everything here was proved against a stand-in for WhatsApp and a mock for email.
* The three document templates are not submitted to Meta, so outside the 24-hour window WhatsApp delivery fails gracefully (above).
* The Arabic is a draft until a native review (ALY-66), and what the law asks of an invoice's wording and of record keeping is with the lawyer (ALY-51).
* Named connectors for particular POS products, an accountant export and payment-gateway links are not built.
