# 037 · Welcome and invite emails

Go-live checklist (50 clients, 29 Oct) item 23, CJ-21 of the 29 Oct audit · tracked under ALY-266 (Linear's free issue limit is reached) · Builds on D-029 (email through Resend) and D-010 (the job queue)

## What it is for

Today nobody is told that their account exists:

- **A new owner** who signed up at `/start` has no email saying how to get back in. If they close the tab, they have to guess that `/login` and a code are the way.
- **A person an owner adds to the team** learns about it only if the owner tells them, and then has to be told where to sign in.
- **The owner of a business ALYR makes in the back office** is in the same position.

## The two emails

| | Welcome | Invite |
|---|---|---|
| **To** | The owner, right after they make a business at `/start` | A person an owner or admin adds to the team; the owner of a business made in the back office |
| **Language** | The one the owner signed up in | Both. We do not know which the person reads, so the shop's own language comes first and the other follows under a rule |
| **Says** | Their workspace exists; how to sign in (open `/login`, give this address, a 6-digit code comes each time, no password); a button to continue the setup | Who added them, to which business, as what (owner, admin or team member); how to sign in; a button to sign in; "ignore it if you did not expect it" |
| **Subject** | "Welcome to ALYR, Hamad" | "Hamad Al-Kuwari added you to Barbers on ALYR"; from the back office, "Your ALYR workspace for Zaitoon Grill is ready" |

**Neither email signs anyone in:** it holds no code and no link with a token. The person signs in at `/login` with a code, as always. A forwarded or leaked invite therefore gives nobody access.

**When signing in opens another business:** a person can be on more than one business's team. Signing in opens the business they used last, else the first they joined (`auth.business_at_sign_in`, D-081). So an invite to a person whose sign-in opens another business says so, and how to open this one: Your account, then Open next to it (specs/040).

**Replies** go to ALYR's address (`email_reply_to`), as for the setup reminders.

> **One email is different (ALY-213, D-101).** The "your workspace is ready" email that follows a payment (`specs/041-activation-job`) does carry a link that signs the owner in, once. These two emails still carry none.

## How they are sent (`core/welcome.py`)

- **Queued as a job** (`account_email`) in the same transaction that made the account:
  - at sign-up, in `onboarding.create_business`;
  - when someone is added, in `POST /api/team`;
  - after the back office makes a business, in `POST /api/admin/businesses`.
- **Retried** by the job queue if Resend refuses or cannot be reached. Unlike a sign-in code (D-029), these hold nothing secret and are still useful an hour later.
- **A job carries IDs only** (`letter`, `user_id`, `by`). The address, names, role and words are read when it runs. A person removed from the team before it went is not written to, and the job ends quietly.
- **Nothing is queued** while email is off (no Resend key), or for an address that cannot be a real person's (`mail.deliverable`: the demo shops' `.example` addresses, tests).

## Data

- **No new table, and no migration.**
- **What Resend receives:**
  - the person's name and email address;
  - the business's name and their role;
  - for an invite, the name of who added them.
- **Listed in `docs/data-residency.md`** as its own Resend row.
- **No customer data** is in either email.

## Tests (`tests/test_welcome.py`)

- the welcome, in English and in Arabic, and that it holds no code or token;
- the invite, with who added them, the role in both languages and the shop's language first;
- the back office's email to the owner of a business it makes;
- the line about another business, only when signing in opens that one;
- nothing queued for an example address or while email is off;
- a person removed before it went is not written to;
- a refusal by Resend is tried again.

## Not in this spec

- **A way to switch between businesses,** or to change the sign-in email: go-live item 40, in specs/040-your-account.
- **Telling an owner when a person they added first signs in.**
- **An email when someone is removed from a team,** or their role changes.
- **Checking the emails in a real inbox:** go-live item 22. It needs the Resend key in production and an inbox to read.
