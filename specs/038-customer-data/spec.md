# 038 · A customer's data: a copy, forgetting, and how long working copies are kept

Go-live checklist (50 clients, 29 Oct) item 19 · Linear ALY-119 (with ALY-120, the privacy notice) · Decision D-075 · Builds on D-042 (documents are immutable), D-028 (the activity record) and D-010 (the job queue)

## What it is for

The privacy notice (published, version one) promises two things about a business's customers:

- **They can ask to see the data held about them, or to be deleted.**
- **We delete it "with the business's agreement, because the records are the business's".**

Before this, neither could be done. A customer's records could not be deleted at all: their orders, bookings and credit account point at them, and several tables are append-only. And nothing was ever deleted on a timer: every finished job kept its payload for good, and an inbound job's payload is the customer's message as Meta sent it, with their number.

## Who does it, and where

**An owner or admin, from the customer's conversation in the workspace.** Under the conversation, two quiet buttons:

- **Download their data.** A JSON file of everything the business holds about the customer, to check and send them.
- **Forget this customer.** Opens a check before anything happens, then deletes.

Agents (team members) see neither, and the API refuses them (403). Both are on the customer's activity record with who did it and when: that record is the log of requests. A request that reaches ALYR (hello@alyr.qa) goes to the business, as the notice says; see "A request that comes to ALYR" below.

## The copy (`GET /api/inbox/conversations/{id}/export`)

One file, `customer-data-<date>.json`. It holds:

- the business's name, when the copy was made, and that amounts are in dirhams (100 to the riyal);
- the customer: name, number, WhatsApp ID and username, email, language, when they first wrote, and what they agreed to receive;
- their messages (direction, kind, text, status, time);
- the team's notes on them, with who wrote each;
- their consent record (purpose, status, where it came from, the words they saw);
- their orders (not the owner's test orders) with the lines, delivery address and note;
- their bookings, credit account entries and payment requests (references and statuses only; ALYR never holds card numbers);
- the receipts and invoices issued to them (kind, number, date, total).

The owner reads it before sending it on: the notes are the team's words.

## Forgetting (`POST /api/inbox/conversations/{id}/forget`)

**The check comes first** (`GET .../forget`). It says what goes and what stays, with counts, and what stands in the way:

| Deleted | Kept, as "Forgotten customer · عميل محذوف" |
|---|---|
| Their number, WhatsApp ID, username, name and email | Orders, without the delivery address or note |
| Their messages and the pictures in them | Bookings, without the note |
| The team's notes on them | The credit account and its entries |
| Their consent record, cart, back-in-stock requests and sold-out asks | Payment requests (references and statuses) |
| Draft receipts and invoices | Issued receipts and invoices, unchanged |
| Any queued or finished job, and any event already sent to the business's own system, that names them | The activity record (who did what and when) |

- **Open work comes first.** An order still to hand over (new, confirmed, ready) or a booking still to come must be finished or cancelled. The check says so and the button stays off; the API answers 409 `open_work`.
- **Money owed is shown.** If they still owe the business, the check says how much and that they cannot be reminded once forgotten. It does not stop it: that is the business's call.
- **Issued documents stay as they are.** The law requires the business to keep its invoices (D-042: the database refuses any change). The message that carried one stays as the record of its delivery, emptied of its words.
- **The name is in both languages,** because a stored name is shown as it is in an English or Arabic workspace.
- **Afterwards the conversation is gone:** it is not listed, and cannot be opened, replied to or noted on. If the person writes again, they start as a new customer with nothing joined to the old record.
- **It cannot be undone.** Backups keep a copy until they age out, within 35 days (the backup period the notice gives).

**How it works.** One database function, `forget_contact` (migration 0067), runs as the table owner for the business in scope only, because consents, notes, sold-out asks and watches are append-only for the app role and must stay so. The API decides who may call it. `core/forget.py` keeps `TABLES`, what forgetting does to every table that points at a customer. `tests/test_forget.py` reads the database's own foreign keys and fails if a table is missing, so a new table cannot be added without deciding.

Tables that hold a customer's ID without a foreign key, because their records are locked once issued (documents, manual payments, document deliveries, connected sales), are kept as they are.

## How long working copies are kept (`core/retention.py`, D-075)

A business's records are kept for as long as it uses ALYR, as the notice says. The copies ALYR makes only to get work done are purged once a day by the worker, one business at a time:

| What | Kept for | Why that long |
|---|---|---|
| A finished job | 30 days after it finished | To look into a fault; its payload repeats the record it worked on |
| A job that failed for good | 90 days | A person can see it and send it round again until then |
| The IDs of WhatsApp messages already handled | 30 days | Meta tries a webhook again for up to 7 days, so an older repeat cannot come |
| An event sent to the business's own system | 30 days | Already so (`connect.webhooks.KEEP_DAYS`) |

Queued and running jobs are never purged. Migration 0068 adds the two indexes the purge needs.

## A request that comes to ALYR

The notice tells a business's customers that deletion happens with the business's agreement. When one writes to hello@alyr.qa:

1. Reply that the request has been passed to the business, and name it.
2. Send the business owner the request, without anything more about the person than they wrote.
3. The owner forgets them (or downloads their data) from the conversation; it is on the activity record.
4. Confirm to the person by email within 30 days, as the notice promises.

A business's own data, when it stops using ALYR, is deleted 60 days after it stops (the notice). That needs a business to be able to stop, which is go-live item 39; it is not built here.

## Tests

- `tests/test_forget.py`:
  - every table that points at a customer has been decided;
  - forgetting deletes who they are and what they said, keeps the sales records without the address and notes, deletes jobs that name them, and is on the record;
  - the conversation cannot be opened, replied to or noted on afterwards;
  - writing again makes a new customer;
  - an open order or a booking to come is refused;
  - an issued receipt is unchanged, its message emptied, a draft deleted;
  - the copy holds their messages, notes, orders with lines and credit entries, and is on the record;
  - agents are refused, and another business's customer is not found.
- `tests/test_retention.py`: what is past its time goes, for every business; what is not, and queued or running jobs, stay; a parked job can still be sent again until it goes.
- `forget.test.mjs`: every word in both languages, and no words in the screen itself.

## Not in this spec

- **Correcting a customer's data** (the notice's third right): there is no screen yet to change a customer's name or email. Until there is, the team keeps the right details in a note; a screen to correct them is a follow-up. A number is the customer's own.
- **Deleting a business's data 60 days after it stops:** go-live item 39 (cancelling).
- **A customer asking from WhatsApp itself** ("delete my data"): it reaches the inbox as any message does, and the team acts on it.
- **Purging a business's old messages while it still uses ALYR:** the notice promises none, and the business's records are its own.
