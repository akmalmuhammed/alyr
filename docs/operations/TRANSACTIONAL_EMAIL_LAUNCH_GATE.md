# Heldat transactional-email launch gate

Last updated: 2026-07-31

## Purpose and current state

This runbook covers authentication email only: signup confirmation, password
reset, household invitation, and related security notices. It contains no SMTP
credentials, live DNS values, account recovery material, or recipient data.

Current verified state:

- `heldat.app` DNS is managed in Cloudflare and registration remains at
  Spaceship.
- Public inbound addresses are named as `support@heldat.app`,
  `privacy@heldat.app`, and `security@heldat.app`.
- A single public DMARC monitoring record with `p=none` is documented in
  `docs/operations/LAUNCH_CONTROL_HANDOFF_2026-07-31.md`; preserve and verify it
  during provider authentication rather than adding a second DMARC record.
- Inbound delivery, mailbox monitoring, authentication sending identity,
  custom SMTP, and production deliverability are still launch gates.
- Supabase's default SMTP path is for non-production use. Its documented
  recipient restriction, changeable low rate limit, best-effort delivery, and
  lack of SLA make it unsuitable for public enrollment.

## Non-secret owner inputs

Resolve these values before configuration:

```text
AUTH_EMAIL_PROVIDER=Brevo
AUTH_SENDING_DOMAIN=
AUTH_FROM_NAME=
AUTH_FROM_ADDRESS=
AUTH_REPLY_TO=
AUTH_SUPPORT_ESCALATION_ADDRESS=
AUTH_DNS_CHANGE_OWNER=
AUTH_DELIVERABILITY_OWNER=
AUTH_ON_CALL_OWNER=
AUTH_PROVIDER_PROFILE_COUNTRY=
AUTH_PROVIDER_PROFILE_ADDRESS_IF_REQUIRED=
AUTH_MONTHLY_VOLUME_ESTIMATE=
AUTH_PEAK_HOURLY_VOLUME_ESTIMATE=
AUTH_APPROVER_NAME_AND_DATE=
```

Use a sending domain and identity dedicated to transactional authentication
mail. Keep marketing/broadcast campaigns on a separate domain or subdomain and
sender identity. Provider identity/address fields stay in protected provider
screens unless a store or applicable law requires publication.

## Secrets boundary

| Value | Storage location |
|---|---|
| Brevo login and MFA recovery | Brevo account manager/password manager |
| SMTP username/key/password | Brevo and Supabase protected consoles only |
| Cloudflare account/MFA | Cloudflare account manager/password manager |
| Supabase owner/service credentials | Supabase protected console/approved secret store |
| DNS verification values | Cloudflare DNS and Brevo console; redact evidence exports where appropriate |

Never paste a credential into a repository file, issue, chat, screenshot,
support ticket, test fixture, build log, or release evidence bundle.

## DNS authentication procedure

1. Capture a redacted before-state export of the relevant Cloudflare DNS
   records and record `[DNS_BEFORE_EVIDENCE_PATH]` plus
   `[DNS_CHANGE_WINDOW_UTC]`.
2. In Brevo, select the approved authentication sending domain.
3. Use manual DNS authentication so every proposed record is reviewed before
   Cloudflare changes are made and the existing DMARC policy is preserved.
4. Add the Brevo verification-code TXT record exactly as Brevo displays it.
5. Add the displayed DKIM record or records exactly as shown. Brevo may present
   one TXT record or two CNAME records. If CNAME DKIM is used in Cloudflare,
   confirm that CNAME flattening does not alter the record Brevo expects.
6. Preserve exactly one `_dmarc` TXT record for the domain. Review and merge the
   required policy/reporting values rather than creating a second DMARC record.
7. Add SPF or a custom return-path record only when the selected Brevo setup
   explicitly provides it. Maintain a single SPF policy for a hostname; merge
   approved mechanisms rather than adding a duplicate SPF TXT record.
8. Leave unrelated MX, mail-routing, website, App Links, and Supabase records
   unchanged.
9. Wait for DNS propagation, run Brevo's verification, and record
   `[BREVO_DOMAIN_VERIFIED_AT_UTC]` and `[DNS_AFTER_EVIDENCE_PATH]`.
10. Send a controlled authentication message to two unrelated mailbox
    providers and save redacted raw-header evidence showing aligned
    `DKIM=pass`, `SPF=pass`, and `DMARC=pass`.

Do not move DMARC from observation to enforcement merely because Brevo shows
the domain as authenticated. Review delivered headers, forwarding behavior,
bounces, and every legitimate sender first; approve enforcement as a separate
DNS change.

## Supabase custom SMTP configuration

1. In the Supabase production project, configure the Brevo SMTP host, port,
   protected credential, approved from name/address, and reply-to address.
2. Confirm the from domain matches the authenticated and approved identity.
3. Configure an Auth email rate limit supported by the provider quota and the
   expected launch peak; the documented initial custom-SMTP limit is not an
   automatic production capacity decision.
4. Review every confirmation, recovery, invitation, and security-notice
   template. Remove user-controlled HTML and unnecessary personal data.
5. Disable click tracking for authentication mail. If provider policy requires
   tracking, prove that rewriting preserves the intended target and
   authentication parameters for confirmation, reset, and invitation flows.
6. Verify Supabase Site URL and redirect allowlist entries for the production
   HTTPS paths and the exact signed mobile deep-link behavior.
7. Record only redacted settings screenshots and provider configuration IDs in
   `[SMTP_CONFIGURATION_EVIDENCE_PATH]`.
8. Leave Supabase default SMTP out of the public fallback path. During provider
   outage, queue or fail the user action clearly and operate the incident
   procedure below.

## Required test matrix

Run from the production candidate against the production Auth project. Use
synthetic test identities and delete them after evidence is retained.

| Scenario | Required result |
|---|---|
| New signup confirmation | One message arrives; newest link confirms once and opens the correct app/browser destination |
| Confirmation replay | Used link produces a clear non-success outcome and no extra account/session |
| Expired confirmation | Clear expiry state plus a working resend path |
| Resend/rate limit | Bounded response; no uncontrolled message burst or address enumeration |
| Password reset | Newest reset link opens the intended recovery screen and completes once |
| Reset replay/expiry | No password change; clear recovery path |
| Household invitation | Intended recipient can review and accept once; wrong/signed-out identity remains fail-closed |
| Invitation replay/expiry | No duplicate membership; clear status |
| Two mailbox providers | Confirmation, reset, and invite arrive at two unrelated providers |
| Spam placement | Placement recorded; sender/domain reputation issue escalated before launch |
| Bounce/suppression | Hard bounce is visible, suppressed state is understood, and support has a recovery procedure |
| Complaint | Complaint event reaches the provider dashboard and suppression policy applies |
| Provider outage | User sees a retryable outcome; event is monitored; default SMTP is not exposed as fallback |
| Deep link unavailable | Owned HTTPS browser fallback remains usable and does not leak tokens |
| Redirect manipulation | Unapproved redirect target is rejected |
| Header authentication | Redacted raw headers show aligned DKIM, SPF, and DMARC passes |
| Template privacy | Subject/body/logs contain no asset, household, location, value, filename, or document content |

Acceptance record:

```text
EMAIL_TEST_BUILD_OR_COMMIT=
EMAIL_TEST_STARTED_AT_UTC=
EMAIL_TEST_COMPLETED_AT_UTC=
MAILBOX_PROVIDER_A=
MAILBOX_PROVIDER_B=
SMTP_CONFIGURATION_EVIDENCE_PATH=
DNS_BEFORE_EVIDENCE_PATH=
DNS_AFTER_EVIDENCE_PATH=
DELIVERED_HEADER_EVIDENCE_PATH=
BOUNCE_AND_COMPLAINT_EVIDENCE_PATH=
AUTH_FLOW_TEST_REPORT_PATH=
EMAIL_GATE_REVIEWER_NAME_AND_DATE=
EMAIL_GATE_DECISION=GO|NO_GO
```

## Monitoring and operating limits

Before public enrollment:

- [ ] Provider quota/credits and Supabase Auth rate limits have warning and
      stop-enrollment thresholds.
- [ ] Delivery latency, hard-bounce rate, complaint rate, suppressions, and
      provider availability have a named owner and daily pilot review.
- [ ] DMARC aggregate reports go to an approved monitored destination and are
      reviewed before policy enforcement changes.
- [ ] Support can identify a delayed/suppressed message without exposing the
      recipient address or token in shared logs.
- [ ] Auth event logs retain only the approved metadata for
      `[AUTH_EVENT_LOG_RETENTION]`.
- [ ] The capacity plan covers `[AUTH_PEAK_HOURLY_VOLUME_ESTIMATE]` without
      relying on Supabase default SMTP.
- [ ] A provider-spend alert and a documented enrollment-stop action exist.

Recommended launch alarms:

| Signal | Initial trigger requiring review |
|---|---|
| Provider quota/credit remaining | 30%, then enrollment stop at 10% |
| Hard-bounce rate | Provider warning threshold or 2%, whichever is lower |
| Complaint rate | Any complaint during the closed pilot; provider threshold for production |
| Median delivery latency | `[APPROVED_MEDIAN_DELIVERY_TARGET]` |
| 95th-percentile delivery latency | `[APPROVED_P95_DELIVERY_TARGET]` |
| Auth delivery failure | Any sustained 5-minute failure window |

The owner may tune these values after baseline evidence; record the chosen
thresholds and reason.

## Incident and rollback procedure

1. Pause new public enrollment and invitation creation while preserving
   existing signed-in sessions and locally saved work.
2. Record `[EMAIL_INCIDENT_ID]`, UTC start time, affected flow, provider status,
   and redacted error class.
3. Check Brevo availability/quota/suppression, Supabase Auth logs/rate limits,
   DNS authentication, redirect allowlist, and recent template/config changes.
4. Roll back only the most recent known email/DNS/config change using the
   captured before-state. Preserve the single-DMARC and single-SPF rules.
5. Do not switch public users to Supabase default SMTP.
6. Re-run confirmation, reset, invite, and header-authentication tests at two
   mailbox providers.
7. Resume enrollment after the named on-call owner records a `GO` decision and
   the monitoring window remains clean for `[POST_ROLLBACK_OBSERVATION_WINDOW]`.
8. Write a short incident record without recipient addresses, tokens, message
   bodies, or credentials.

## Launch exit gate

- [ ] Every non-secret owner input is resolved.
- [ ] Brevo provider identity/profile and sending identity are approved.
- [ ] DNS before/after evidence is archived; one DMARC record, no duplicate SPF
      policy, and only provider-supplied authentication records are confirmed.
- [ ] Brevo domain authentication passes.
- [ ] Delivered headers show aligned DKIM, SPF, and DMARC passes.
- [ ] Supabase custom SMTP is active and default SMTP is outside the public
      path.
- [ ] Click tracking is disabled or rewriting is verified to preserve the
      intended target and authentication parameters.
- [ ] The full test matrix passes for the exact production candidate.
- [ ] Redirect/deep-link fallbacks pass on Android, iOS, and web.
- [ ] Monitoring, quota alerts, support escalation, and outage response have
      named owners.
- [ ] Evidence is redacted, dated, independently reviewed, and referenced from
      the release decision.

## Official references

- [Supabase custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp)
- [Supabase production checklist](https://supabase.com/docs/guides/deployment/going-into-prod)
- [Brevo domain authentication](https://help.brevo.com/hc/en-us/articles/12163873383186-Authenticate-your-domain-with-Brevo-Brevo-code-DKIM-DMARC)
- [Brevo transactional SMTP](https://help.brevo.com/hc/en-us/articles/7924908994450-Send-transactional-emails-using-Brevo-SMTP)
