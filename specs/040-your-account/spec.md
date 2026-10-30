# 040 · Your account: switch business, change the sign-in email, download everything

Go-live checklist items 40 and 41, tracked under ALY-266 (Linear's free issue limit is reached). Decision D-081. Builds on D-022 (sign-in by a one-time code, no passwords), D-028 (the activity record) and D-029 (email: Resend).

## What it is for

- **Item 40.** A person can work for more than one business (an owner with two shops, an accountant for three). Sign-in opened the first business they joined, and nothing let them reach the others. And nobody could change the address they sign in with: a person who left their old job's mailbox lost the workspace with it, and ALYR had to edit the database.
- **Item 41.** A client must be able to take everything ALYR keeps for their business, not only the catalog's spreadsheet: to keep their own copy, to show an accountant, or to leave. Without it a client is locked in, and a client who must answer their own customers' questions about their data cannot.

## What a person sees

A new screen, **Your account** (`/app/account`), under Account in the side bar, for every role. It has three cards.

- **Sign-in email.** The address they sign in with. "Change" asks for the new address and emails a six-digit code to it (in English and Arabic, like the sign-in code). Typing the code makes the change. Then:
  - their sign-ins on every other device end; this one stays signed in;
  - the old address gets a note, in both languages, that the sign-in email changed, the new address shown only partly (`ah••••@gmail.com`), and to reply at once if they did not do it;
  - every business they work for records "changed their sign-in email" against them.
  - It is refused when the address is the same, is not an address, or already signs someone in (said only after the code proves the person owns it, so the form cannot be used to learn who has an account). ALYR's own staff, who reach the back office by their address, change it through ALYR.
- **Your businesses.** Every business they work for, with their role in each and the one open now. "Open" switches to another: a new session for that business replaces this one and the workspace reloads in it. Signing in now opens the business they used last, not the first they joined, and an invite to a person whose sign-in opens another business says how to switch (specs/037).
- **Your data.** Owners only (an admin or agent sees who can). "Download all data" gives one ZIP of everything the business keeps in ALYR.
  - Each table is a CSV file that Excel opens with Arabic intact (UTF-8 with a byte-order mark): customers and their consent, messages, the inbox's notes, orders and their lines, bookings, credit accounts and their entries, payments, the catalog with sizes, prices, price groups, discounts, delivery, stock and its log, documents and their lines, the team, the settings, the activity record, and every other table that belongs to the business.
  - Files are files: every issued document's PDF, the logo and stamp, the photos of the catalog (largest size kept), and the pictures and files customers sent in the chat.
  - `README.txt`, in English and Arabic, says what each file is, that money is in dirhams (100 dirhams = 1 QAR), that times are Doha time, what is left out and why, and who downloaded it when.
  - Every owner of the business gets an email each time it is downloaded (who, when), so a stolen session cannot take the data quietly. The download is also on the activity record.
  - At most five downloads an hour for a business.

## What is left out of the download, and why

- **Secrets.** API keys' hashes, webhook signing secrets, sign-in sessions, the one-time codes to link a staff phone. Any column whose name says secret, password, token, credential, sealed or private key, or ends in `api_key` or `_hash`, is dropped even when nobody listed it.
- **ALYR's own machinery.** The job queue, the record of WhatsApp messages already handled, the photo store's own log.
- **The spreadsheets the owner uploaded** to import items or sales: the owner has them, and what they changed is in the tables.
- **What ALYR charges the business.** Its quotes and payments to ALYR are ALYR's records; the owner sees them on Products and can ask for them.

A table added later that belongs to a business is in the download without anyone remembering to add it. A column of raw bytes is never written into a CSV.

## How it works

- `core/account.py`: the businesses a person works for, the switch, the email change and its code, and the account emails (a job, `account_notice`, carrying the old address for the change note and the downloader's ID for the download note; the shop's owners are read when it runs).
- The code for a change is a sign-in code in its own namespace (`change:<person>:<new address>` in `login_codes`), so it cannot be used to sign in, cannot crowd out the new address's own sign-in codes, and is limited like one: five an hour for the address, five changes asked an hour per person, five guesses per code, thirty guesses an hour from one network address.
- The business a person switches to is kept on them (`users.last_tenant_id`, migration 0072), and `auth.session_for` opens it at sign-in if they still work for it, else the first they joined.
- `core/export.py`: the ZIP is written as it is sent (a stream), so a large business does not need its whole download in memory. It reads every table with a `tenant_id` the app can read, inside the business's own scope (row-level security), and also asks for that business's rows by `tenant_id`, for the two tables without row-level security. Text that a spreadsheet could take for a formula gets the catalog export's leading apostrophe.
- `routes/account.py`: `GET /api/account`, `POST /api/account/switch`, `POST /api/account/email/code`, `POST /api/account/email`, `GET /api/account/export`.
- Web: `_workspace/Account.tsx`, its words in `accountCopy.ts` and its styles in `account.css`. The screen is `account` in `catalog.ACCOUNT_SCREENS`.

## Not in this spec

- **Deleting a business or leaving ALYR.** Closing an account (and how long ALYR keeps a closed business's data) is a founder's decision for the terms (ALY-98).
- **A download for one customer.** A customer's own request goes through the shop (ALY-119 forgets a customer).
- **The download in the background**, emailed when ready. A shop's download is written while the owner waits; when a business is too large for that, it becomes a job.
- **Changing a name.** The name a person shows is set by the owner on Team.

## Checks

`tests/test_account.py` (13) and `tests/test_export.py` (16) on the real path (PostgreSQL, HTTP in and out, the mail provider replaced by a recording transport): the list and the switch, the old cookie refused, sign-in reopening the business used last, no switch into a business the person does not work for; the change by code, the note to the old address, the other devices signed out, the record in every business; a wrong code, a code for another address, a change code used to sign in, an address that is taken, the same address, ALYR staff, a non-address and the limits refused; every table of a business in the download or left out on purpose, nothing of another business, no secret, a formula made harmless, photos, chat files and the logo as files, owners only, every owner emailed, the record, the limit. In a real browser (Chromium, against a seeded local API): 375 and 320 px, English and Arabic, light and dark, every target 44 px, nothing sideways, no page errors; the email change with a wrong and a right code, the download, the switch landing on the other business's home, and an agent's view.
