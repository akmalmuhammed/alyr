# Spec 000: Core platform

Status: draft. Linear: ALY-9. Covers ALY-12, ALY-13, ALY-14, ALY-15, ALY-18, ALY-45.

## What the core does

Every module needs the same things: receive a WhatsApp message, know which merchant it belongs to, remember where the conversation is, understand the customer's wording, reply, and keep one merchant's data away from another's. The core does those once.

## Message path

```
customer's phone
  -> Meta Cloud API            (or the simulator)
  -> channel adapter           verify, parse into InboundMessage
  -> tenant lookup             receiving number -> tenant
  -> dedupe                    ignore a message ID already handled
  -> normaliser                Arabic numerals, dialect -> intent + values   (ALY-15)
  -> session                   where is this conversation?                    (ALY-14)
  -> module handler            returns OutboundMessage objects
  -> outbound layer            consent, 24-hour window, limits, metering
  -> channel adapter           send
```

## Channels

A channel is anything that can deliver messages. Two exist:

- `meta`: Meta's WhatsApp Cloud API. Inbound by webhook, signed with `X-Hub-Signature-256` (HMAC-SHA256 of the raw body with the app secret). Outbound by HTTPS to the Graph API.
- `simulator`: in-process. Inbound by `POST /sim/messages`. Outbound messages are stored and read back by the chat simulator page.

Both produce the same `InboundMessage` and accept the same `OutboundMessage`. A tenant's channel is a setting. Modules cannot tell which is in use.

### Acceptance

- A webhook with a missing or wrong signature is rejected with 401 and nothing is processed.
- Meta's verification request (`hub.mode=subscribe`) returns the challenge only when the verify token matches.
- The same message ID delivered twice is handled once.
- A message to a number no tenant owns is acknowledged and dropped, and logged without its content.
- The webhook returns 200 quickly; slow work does not hold the response.

## Outbound message kinds

| Kind | When allowed | Cost |
|---|---|---|
| `text`, `buttons` (up to 3), `list` (up to 10 rows), `media` | Inside the 24-hour window opened by the customer's last message | Free |
| `template` (utility, marketing, authentication) | Any time, if consent exists and the template is approved | Charged per message; utility is free inside an open window |

The outbound layer decides which is allowed. A module asks to "send a payment reminder"; the outbound layer sends free text if the window is open and the utility template if it is not.

## Tenancy (ALY-13)

- One PostgreSQL database. Every tenant-owned table has `tenant_id uuid not null`.
- RLS policy on each: `tenant_id = current_setting('app.tenant_id')::uuid`.
- Each request opens a transaction and runs `set local app.tenant_id = ...` before any query.
- The application role has no `BYPASSRLS`. Migrations run as a separate owner role.
- A CI test lists all tables and fails if one has `tenant_id` without a policy, or has neither and is not on an explicit allow-list of global tables.

Core tables: `tenants`, `tenant_modules`, `users`, `contacts`, `conversations`, `messages`, `consents`, `audit_log`.

## Module switches

`tenant_modules(tenant_id, module_key, enabled, config jsonb)`. The router only offers handlers whose module is enabled. The workspace shows only enabled modules.

## Sessions (ALY-14)

Redis key `sess:{tenant_id}:{customer_number}` holds: active module, step, collected values, `window_expires_at`. Expires after 24 hours of silence. "cancel" and "menu" (Arabic and English) always reset it.

## Money

Amounts are integers in dirhams. 1 QAR = 100 dirhams. Displayed as `QAR 1,850` or `QAR 1,850.50`.

## Not in this spec

Payments (spec 002), consent and messaging limits (spec 003), each module's own behaviour.
