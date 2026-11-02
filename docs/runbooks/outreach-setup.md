# Setting up ALYR's outreach engine

For the founder. Spec 065, decision D-152, Linear ALY-310 and ALY-311. Do the steps in order; each
one says how you know it worked. Nothing is sent to anyone until step 11, and you can stop
everything at any moment (the last section).

What it does: finds businesses and the right work email, reads their own website, drafts a short
message with its sources, **you approve it**, the engine sends it from a dedicated mailbox and
follows up until they reply. Email only, never WhatsApp.

## 1. Buy an outreach domain owned by the company

A domain of its own, so a complaint about a cold email can never touch `alyr.qa` (which sends
sign-in codes and invoices).

1. Buy a `.com` in the company's name (for example `alyr-team.com` or `getalyr.com`) at any
   registrar; put its DNS on Cloudflare like `alyr.qa`.
2. Point its website to `https://alyr.qa` (a redirect), so anyone who types it lands on ALYR.
3. Write its renewal date in `docs/access.md` ("Outreach domain and mailbox").

Worked when: opening the new domain in a browser lands on alyr.qa.

## 2. Make the mailbox (Google Workspace)

Use **Google Workspace** on the new domain. Not your Zoho free mailbox and not an alias on
`alyr.qa`: Zoho's usage policy (updated 13 Oct 2026) forbids promotional, bulk, marketing or
automated mail, and Zoho's SMTP and IMAP are on paid plans only. Not Microsoft 365 either: it is
retiring basic-auth SMTP and this build has no OAuth adapter.

1. Sign up for Google Workspace with the new domain; make one user, your own name
   (`akmal@<new domain>`). A real person's name, never an invented one.
2. Turn on 2-Step Verification for that user (Google requires it for app passwords).
3. Google Account → Security → App passwords → make one called "ALYR outreach". Copy it once,
   straight into step 7; never into a chat or a file.
4. The servers are `smtp.gmail.com` port 465 and `imap.gmail.com` port 993 (the engine's defaults
   for the ports).

Worked when: you can send and receive a normal email from the new address in Gmail.

## 3. SPF, DKIM and DMARC on the new domain

In Cloudflare DNS for the new domain:

1. **SPF**: a TXT record on the domain itself: `v=spf1 include:_spf.google.com ~all`.
2. **DKIM**: Google Admin → Apps → Google Workspace → Gmail → Authenticate email → Generate new
   record (2048-bit) → add the TXT record it shows (`google._domainkey`) → back in Google, Start
   authentication.
3. **DMARC**: a TXT record on `_dmarc`: `v=DMARC1; p=none; rua=mailto:<your new address>`.
   Start with `p=none` (report only); move to `p=quarantine` after a month of clean reports.

Worked when: you send yourself an email at a Gmail address, open it, "Show original", and SPF,
DKIM and DMARC all say PASS.

## 4. Warm the mailbox up for 2 to 4 weeks

New mailboxes that send cold email at once land in spam. For two to four weeks, use the address
by hand: write to people you know, reply to them, a few a day. The engine starts slowly anyway
(10 a day the first week, then 20, 30, 40), but only after this.

## 5. Get the keys

Each one is made by you in the provider's own site; each goes straight into step 7.

| Key | Where | Note |
|---|---|---|
| Anthropic API key | console.anthropic.com → API keys | Pay as you go; the engine stops research and drafting past USD 5 a day (`ALYR_OUTREACH_DAILY_MODEL_USD`) |
| Exa API key | dashboard.exa.ai → API keys | USD 10 of free credit a month |
| Hunter API key | hunter.io → API | Free plan: 50 credits a month |
| Google Places API key (optional) | Google Cloud console → APIs & Services → enable "Places API (New)" → Credentials → API key, **restricted to the Places API** | Check its price first (`docs/stack.md` says "check pricing"). The engine asks only for the place ID, name and website |
| Firecrawl API key (optional) | firecrawl.dev → API keys | Only for websites the engine cannot read by itself; free plan 1,000 pages a month |

**Google's terms, if you use Places:** wherever a business's name that came from Google is shown
outside `/ops`, Google must be credited ("Google Maps" attribution). The engine stores only the
place ID and the name, never Google's address, phone, rating or position, and keeps a website
only after its own fetcher has read it.

## 6. Write the words

Three short texts, in your own words:

- **Legal line** (`ALYR_OUTREACH_LEGAL_LINE`): ALYR's legal name and postal address on one line,
  **with no link and no web address in it** (the first message may carry none). For example
  `ALYR Technologies, P.O. Box ..., Doha, Qatar`.
- **Offer** (`ALYR_OUTREACH_OFFER`): what ALYR does for a shop, two or three sentences. The model
  may say nothing about ALYR beyond this, so write only what is true today and no client names
  ALYR does not have.
- **Booking link** (`ALYR_OUTREACH_BOOKING_URL`): your calendar link (https), sent only to people
  who said yes, and only after you approve that reply.

## 7. Put every value in Secret Manager in Doha

On the laptop, signed in to Google Cloud (`gcloud auth login`), from the repository:

1. Once: make the placeholders and the unsubscribe secret, and let the apps read them.
   ```
   infra/gcp/setup.sh secrets          # Enter skips every question you have already answered
   infra/gcp/setup.sh access grant
   ```
   This makes every outreach value "unset" (read as empty) and generates
   `outreach-unsubscribe-secret`, all in Doha (`me-central1`).
2. Each key or password (typed once, hidden; the command restarts the API and the worker):
   ```
   infra/gcp/setup.sh set-secret anthropic-api-key
   infra/gcp/setup.sh set-secret exa-api-key
   infra/gcp/setup.sh set-secret hunter-api-key
   infra/gcp/setup.sh set-secret google-places-api-key   # optional
   infra/gcp/setup.sh set-secret firecrawl-api-key       # optional
   infra/gcp/setup.sh set-secret outreach-smtp-host      # smtp.gmail.com
   infra/gcp/setup.sh set-secret outreach-smtp-user      # your new address
   infra/gcp/setup.sh set-secret outreach-smtp-password  # the app password
   infra/gcp/setup.sh set-secret outreach-imap-host      # imap.gmail.com
   infra/gcp/setup.sh set-secret outreach-imap-user      # your new address
   infra/gcp/setup.sh set-secret outreach-imap-password  # the same app password
   infra/gcp/setup.sh set-secret outreach-from           # your new address
   infra/gcp/setup.sh set-secret outreach-booking-url
   infra/gcp/setup.sh set-secret outreach-unsubscribe-base   # https://api.alyr.qa
   ```
3. The three values with spaces in them (`set-secret` removes spaces, so not with it). The same
   commands `setup.sh` uses inside, then a restart like `set-secret` does:
   ```
   printf '%s' 'Akmal Muhammed' | gcloud secrets versions add outreach-from-name --project alyr-prod --data-file=-
   printf '%s' 'ALYR Technologies, P.O. Box ..., Doha, Qatar' | gcloud secrets versions add outreach-legal-line --project alyr-prod --data-file=-
   printf '%s' 'Your offer in two or three sentences.' | gcloud secrets versions add outreach-offer --project alyr-prod --data-file=-
   stamp="$(date -u +%Y%m%dT%H%M%SZ)"
   gcloud run services update alyr-api --project alyr-prod --region me-central1 --update-env-vars="ALYR_SECRETS_AT=$stamp"
   gcloud run worker-pools update alyr-worker --project alyr-prod --region me-central1 --update-env-vars="ALYR_SECRETS_AT=$stamp"
   ```
4. Deploy the release that contains the engine the usual way (`docs/runbooks/release.md`); the
   values are already wired to `alyr-api` and `alyr-worker` through the list in `setup.sh`.

Worked when: `/ops/outreach` opens and its Connections screen shows each service "configured".
Outreach is still **off**: nothing is sent.

## 8. Test each connection

`/ops/outreach` → Connections → **Test** on each. A test never sends an email and never sends
anyone's details: the model answers one word, Exa runs one search, Hunter reads your account,
SMTP signs in, IMAP signs in and counts unread mail.

Worked when: every row is green. A red one says why (usually a mistyped key: step 7 again).

## 9. Three test drafts to your own addresses

1. `/ops/outreach` → Prospects → Add: a test business whose website you know (your own, or
   alyr.qa), country QA, contact your **own** second address (a Gmail of yours), basis `opt_in`,
   note "founder's test".
2. Research it. In a minute it reaches Review with three drafts, each sentence showing the facts
   it rests on and the page each came from.
3. Do this for three test prospects. Read every draft as if you were the shop owner.

## 10. Switch it on for the test

```
printf '%s' 'on' | gcloud secrets versions add outreach-switch --project alyr-prod --data-file=-
```
then the restart lines of step 7.3. Approve the three test drafts. They go out in Qatar's working
hours (Sunday to Thursday, 08:30 to 16:30). Check in your second inbox: the From is your name,
the footer has the legal line and "reply stop", Gmail shows an "Unsubscribe" link. Reply "stop" to
one and press Unsubscribe on another; within 5 minutes both show "opted out" in `/ops/outreach`.

## 11. Start for real

Add real prospects (or discover them), read each draft, approve. You approve every first message
(and, in Qatar and the GCC, every follow-up too, until the lawyer answers ALY-51). Every morning at
07:00 Doha the digest on your phone says yesterday's numbers.

## Finding Qatar businesses from Overture Maps (optional, free)

Overture Maps publishes places (names, websites, emails, categories) under CDLA Permissive 2.0 /
Apache 2.0, monthly. It has duplicates and junk: the import skips anything under 0.7 confidence
or with neither a website nor an email. Phones and addresses are not kept.

On the laptop (DuckDB installed; the cloud session cannot reach S3), for Qatar's bounding box,
with the newest release name from docs.overturemaps.org (here `2026-10-21.0`):

```sql
LOAD httpfs; LOAD spatial;
SET s3_region='us-west-2';
COPY (
  SELECT id, CAST(names AS JSON) AS names, CAST(taxonomy AS JSON) AS taxonomy, confidence,
         CAST(websites AS JSON) AS websites, CAST(emails AS JSON) AS emails,
         CAST(addresses AS JSON) AS addresses, geometry
  FROM read_parquet('s3://overturemaps-us-west-2/release/2026-10-21.0/theme=places/*/*')
  WHERE bbox.xmin BETWEEN 50.75 AND 51.65 AND bbox.ymin BETWEEN 24.45 AND 26.20
    AND confidence >= 0.7 AND (websites IS NOT NULL OR emails IS NOT NULL)
) TO 'qatar_places.geojson' WITH (FORMAT GDAL, DRIVER 'GeoJSON');
```

Or use the Overture Explorer's "Download Visible" over Doha. Then `/ops/outreach` → Prospects →
Import, choose the file, and give the release name. An email from Overture is flagged in its note:
check it is the business's own before you approve.

## How to stop everything

- **At once, from your phone:** `/ops/outreach` → the **kill switch** (say why). Nothing more is
  sent until you clear it; drafts and replies keep coming in. The engine pulls it by itself if it
  is ever about to write to a honeytoken address, and only you can clear it.
- **Switch the engine off** (sending, follow-ups and reading replies stop; nothing is deleted):
  ```
  printf '%s' 'off' | gcloud secrets versions add outreach-switch --project alyr-prod --data-file=-
  ```
  then the restart lines of step 7.3. Anything other than exactly `on` is off.
- **One business:** its page → Pause (only you can resume it).
- **The mailbox** pauses itself if bounces reach 2% or opt-outs 3% of a week's sends (from 20
  sends), and tells you; resume it from `/ops/outreach` once you know why.
- **A key leaked:** make a new one at the provider, `infra/gcp/setup.sh set-secret <name>`, then
  revoke the old one (`docs/runbooks/secret-rotation.md`).
