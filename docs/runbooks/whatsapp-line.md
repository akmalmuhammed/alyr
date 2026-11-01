# Connecting a shop's WhatsApp number, and looking after its line

Written 31 Oct 2026 (ALY-166, `specs/060-whatsapp-line/spec.md`). For the "new number" way (D-050):
the shop's number lives on **ALYR's own WhatsApp account** in Meta, and ALYR staff attach it to the
shop from `/ops`. Shops with their own account come with Embedded Signup (`embedded-signup.md`).

Meta's pages are the source for everything done in Meta. They change; read the page again before the
step. Checked 31 Oct 2026:

- Adding and verifying a number: https://developers.facebook.com/documentation/business-messaging/whatsapp/business-phone-numbers/registration
- What Meta tells you about a number: https://developers.facebook.com/documentation/business-messaging/whatsapp/business-phone-numbers/phone-numbers
- Webhook subscriptions per account: https://developers.facebook.com/documentation/business-messaging/whatsapp/solution-providers/manage-webhooks
- Reading a number's health: https://developers.facebook.com/documentation/business-messaging/whatsapp/support/health-status

## The one step a person must do

Everything else on this page ALYR does from `/ops`. This one is in Meta, by a person, because it
sends a code to the shop's phone and accepts Meta's terms for a new number.

**Before you start:** the shop is in `/ops` → Onboarding → "WhatsApp to connect" with the way "new
number", and its number and the name customers will see are filled in (the owner gave them, spec
019). The number must not be on WhatsApp already and must be able to receive a text or a call.

1. Open WhatsApp Manager for ALYR's business portfolio (business.facebook.com → WhatsApp Manager).
   Pick ALYR's WhatsApp Business Account.
2. Add a phone number: Phone numbers → **Add phone number**. Give the display name exactly as the
   owner gave it (it must match the business's real name on its sign or commercial registration, or
   Meta refuses it), and pick the category. Meta sends a code by text or call to the shop's number.
   Ask the owner for it, enter it.
3. Wait until Meta shows the number as **Connected**. If the display name is still in review, the
   number can show as pending; Meta says the result by a `phone_number_name_update` message and in
   WhatsApp Manager.
4. Copy two long numbers from the number's details: **Phone number ID** and **WhatsApp Business
   Account ID** (not the phone number itself).

Then in `/ops`:

5. Onboarding → the shop → **Steps** → **Attach Meta number**: paste both, press **Attach**. ALYR asks
   Meta first and refuses anything that is not connected; nothing is written until Meta agrees.
6. Open **WhatsApp lines** (or press **Check the line** beside the attached number) and press
   **Check**. Every row should be a tick, except the last two, which stay a circle until a customer's
   message arrives and one of ours goes out.
7. Ask the owner to send the code from their workspace (Team → "Your WhatsApp" → link, which gives a code to send as `LINK 12345678`) to
   the shop's new number. That proves a message **reaches ALYR**, and makes the owner a member of staff
   on this number.
8. Press **Check** again, choose the owner in **Test message**, press **Send test message**. The
   owner's phone receives "ALYR line test for …". When the last test shows Sent or Delivered and the
   state reads **Working**, the line is connected both ways. Tell the owner.

## If it does not work

| The screen says | Meaning | Do |
|---|---|---|
| Attach: "Meta shows this number as … Finish registering it" | Meta does not call it Connected | Finish step 2 and 3 in WhatsApp Manager. A number added by the API (not by WhatsApp Manager) must also be *registered* with a six-digit PIN (`POST /{phone-number-id}/register`); ALYR does not do that for a shop's number yet, so ask the developer session. Meta allows ten tries per number in 72 hours |
| Check: "The number at Meta" is red, "Meta refused ALYR's access token" | The token in Secret Manager is wrong or has expired | `secret-rotation.md`, the "Meta system-user token" row and "Where production stands". Every line is affected, not one |
| Check: "ALYR's access token lacks a permission" | `whatsapp_business_management` or `whatsapp_business_messaging` is not on the token | Re-issue the token with both (Meta's system user, `meta-tech-provider.md`) |
| "On the WhatsApp account" red: not on the account that was given | The Account ID pasted is not the account the number is on | Detach, attach again with the right Account ID |
| "Meta's messages reach ALYR" red: no app is subscribed | Meta will not send this account's messages to ALYR | In the app dashboard, Webhooks, the callback and verify token are set; then subscribe the app to the account: `POST /{waba-id}/subscribed_apps` (Meta's page above). One subscription serves every number on the account |
| "…Another app is subscribed, not ALYR's" | Someone subscribed a different app | Ask the founder who; remove it in the app dashboard |
| Test: "Only a member of this shop's staff who has written to this number…" | The person is not linked, or wrote to another number | Do step 7 with the right number |
| Test: "more than 24 hours old" | WhatsApp only lets a business answer inside 24 hours | The person sends any message to the number, then press Send again |
| Test shows Failed | Meta accepted the message and could not deliver it, or refused it | Read the reason on the line; the owner's phone may be off, or the number wrong |

## Detaching

**Detach** (Onboarding → Steps) takes the number off the shop: its messages stop arriving and nothing
is sent from it. The number stays in Meta. The line's trail keeps who attached it, when it was checked
and when it was detached.

## Health: what Meta says about a number and its account

Spec 062, D-147. `/ops` → WhatsApp lines → a shop → **Health**, and **Today** for anything wrong. It comes from
Meta's notices as they arrive, and from a read of every number every six hours; **Check** reads it again.
Meta's pages, checked 31 Oct 2026:

- Quality, throughput and the number's fields: https://developers.facebook.com/documentation/business-messaging/whatsapp/business-phone-numbers/phone-numbers
- A number's limit and throughput changes: https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/phone_number_quality_update
- Account restrictions, violations, disables and partners: https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/account_update
- Alerts (limit increases, official business account, profile picture): https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/account_alerts
- Account review decisions: https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/account_review_update
- Display name decisions: https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/phone_number_name_update
- Messaging limits: https://developers.facebook.com/documentation/business-messaging/whatsapp/messaging-limits
- The health status of a number: https://developers.facebook.com/documentation/business-messaging/whatsapp/support/health-status

**For these notices to arrive at all,** the Meta app's webhook must be subscribed to the fields
`account_update`, `account_alerts`, `account_review_update`, `phone_number_quality_update`,
`phone_number_name_update`, `message_template_status_update` and `template_category_update`, as well as
`messages` (the founder, in the app dashboard → WhatsApp → Configuration → Webhook fields), and the app must be
subscribed to each account (Check's "Meta's messages reach ALYR" row). Until then only the six-hourly read works.

### The states

| Shows | Means | Do |
|---|---|---|
| Healthy | Meta has reported and nothing is wrong | Nothing |
| Meta has not reported yet | No notice, no read since the number was attached | Press **Check** |
| Needs a look (attention) | Something Meta calls a warning | Read the reasons; see below |
| Needs action now (critical) | Flagged, restricted, blocked, or the account is | See below; it is also on Today and on the phone |

### The reasons and what to do

| Reason | What it is | Do |
|---|---|---|
| Quality rating red / number flagged | Customers are blocking or reporting this shop's messages. Meta can lower the messaging limit | Find out from the owner what is being sent that customers do not want (reminders to people who did not ask; a template nobody expects). Stop it at the source. Quality recovers over days; Meta says a flagged number returns to connected if quality improves |
| Quality yellow | Medium quality | Same, earlier |
| Restricted (the number) | Meta shows the number as restricted, often because it reached its limit | Wait for the 24-hour window to reset; look at the messaging limit; do not send more |
| Sending blocked / limited | Meta's health status says a requirement is not met (an unapproved display name, a template not approved) | Read Meta's page above; the Health section says which |
| Display name rejected | Meta refused the name; its reason code is shown | The owner edits the name in WhatsApp Manager to match the sign or registration (Meta's display name guidelines) |
| The account is restricted | A restriction with a type and an end date (for example, no business-started messages until the date) | **Every shop on that account is affected.** Read Meta's remediation in WhatsApp Manager; do not send business-started messages until it ends; tell the founder |
| The account is disabled / scheduled to be disabled | Meta is closing or will close the account | Founder now: appeal in WhatsApp Manager / Business Support; the shops on it will stop |
| Meta reports a policy violation | A warning that precedes a restriction | Read what the violation says; find what was sent; it stops counting after 30 days |
| The business removed ALYR from its account | An Embedded Signup shop disconnected ALYR | Ask the owner; nothing can be sent until they reconnect |
| Review of the account rejected / not decided | Meta's policy review | Founder: Meta Business Support |
| Meta raised an alert | For example a limit increase was deferred, or an official business account decision | Informational; read the type and Meta's page |

### The alert on the phone

One message, `line_health`, when any number is critical or any account is restricted, disabled or removed. It
carries counts, never a name. The first step it names is this page. It repeats every two hours and says "cleared" when
Meta's state improves (the next read, or the next notice).

### What ALYR does not do

It does not pause a shop's sending when its number is flagged, and it does not tell the owner. Both are the founder's call.

## What is checked and what is not

A **check** reads from Meta (the number, the numbers on the account, the app subscribed to its webhooks)
and from ALYR's own records (a customer's message has arrived; a message of ours has gone out). It never
sends a message and never changes anything at Meta. A **test** sends one message, only to the shop's own
staff, through the same outbound layer as everything else.
