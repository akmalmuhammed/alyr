# 025 · The onboarding funnel in the back office

Linear ALY-169 · Builds on spec 018 (the onboarding engine, D-049: the append-only `onboarding_events`)

## What it is for

The engine has recorded every step change since it merged, for exactly this: to see where
businesses stop. This is the view. It answers four questions without opening each business:
how many started and how many are live; which step loses people; how long a step takes; and
how many needed ALYR's hand (the "no support" promise, measured).

## What it shows

On `/ops` Onboarding, above the board:

- Started, ready, live, the typical hours from sign-up to ready and to live, how many needed ALYR's
  hand at least once (a person from ALYR changed something for them), and how many are quiet (not live,
  nothing moved for seven days).
- A table of steps, in the order people reach them: how many businesses reached the step (and the
  share of those who started), the typical time from sign-up to first passing it, and how many are
  not past it now.

Only businesses the readiness check has looked at are counted, so the demo shops and shops made before
the engine do not skew it. With a handful of businesses the share is a handful, not a trend; the table
says "3 of 8" beside the percentage for that reason.

## How

`admin_onboarding_funnel()` (migration 0051, staff only) counts from `onboarding_events`,
`onboarding_steps` and `tenants`; `GET /api/admin/onboarding/funnel` shapes it
(`core/readiness.funnel`). Steps are taken from the record as written, so a step added or removed by a
later change to the flow shows up without touching this. Like `admin_onboarding()`, the function
reads every business's record as the table owner, and migration 0051 adds no policy to the onboarding
tables: a policy that let staff see all businesses would also show every business's rows to queries
that rely on the tenant policy, in a back-office connection scoped to one business.

No customer data is read or shown: step names, times, counts.

## Checked

`tests/test_onboarding_funnel.py`: a new business is counted as started with its steps reached; a
business ALYR helped is counted apart; a business gone quiet and the hours to a step are right; only
staff may read it. Not checked: the view in a browser.

## Not here

"Time to the first real order" (ALY-169 asked for it): an order does not say whether it came from the test
line, so it cannot be told from a real one yet; it needs a flag on the order, as its own issue. A chart over
time, and a funnel by business type, wait until there are enough businesses for them to mean anything.
