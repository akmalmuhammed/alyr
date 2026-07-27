# ALYR native account and first-use contract

## Route contract

| Route | Purpose | Entry requirement | Successful next route |
|---|---|---|---|
| `/(auth)` | Product promise and account choice | None | Create account or sign in |
| `/(auth)/create-account` | Email/password creation | None | Confirmation or household |
| `/(auth)/sign-in` | Existing account access | None | Household or existing workspace |
| `/(auth)/forgot-password` | Privacy-preserving recovery request | None | Email sent state or local preview reset |
| `/(auth)/reset-password?code=` | PKCE recovery exchange and password update | One-use provider `PASSWORD_RECOVERY` event/grant or preview request | Sign in |
| `/(auth)/confirm-email` | Truthful provider/preview confirmation state | Pending identity | Household |
| `/(auth)/callback?code=` | Supabase PKCE code exchange | Provider callback code | Household |
| `/(auth)/household` | Create a private ownership boundary or join one with a one-time code | Active session | Privacy and capture, or the joined workspace |
| `/(auth)/privacy` | Explain access/location behavior and choose the first useful record | Session and household name | Item/place capture |
| `/invite-member` | Owner-only role, expiry and one-time-code creation | Provider-confirmed owner membership | Explicit system share sheet |

`AUTH_ROUTES` is the canonical internal route map. The public deep-link target
for the route group is `/callback`; with the configured scheme it is
`alyr://callback`. Password recovery returns through
`alyr://reset-password`.

Verified signed sessions never reopen Welcome, account creation, sign-in or
forgot-password forms. Deep links resume household setup when onboarding or
the active membership tuple is incomplete; otherwise they pass through `/` so
device unlock and encrypted workspace bootstrap still run. Reset-password is
the only exception while the provider-backed recovery session is active.

## Adapter contract

`AccountAuthGateway` deliberately exposes only account-level operations:

- current session
- short-lived user access token retrieval for transport injection
- account-provider session change subscription
- sign in
- sign up
- resend confirmation
- request password recovery
- exchange a recovery PKCE code for a one-use `PASSWORD_RECOVERY` grant
- cancel and invalidate a recovery exchange/session
- update a password by consuming that grant exactly once
- PKCE code exchange
- explicit preview-session activation
- sign out

The Supabase adapter receives a user-scoped client that the host application
created with a publishable/anon key. It does not accept a URL, a secret or a
service-role credential. The host owns secure refresh-token storage and
Supabase client lifecycle.

Call `configureAuthGatewayFactory` before the root `AuthFlowProvider` mounts:

```ts
configureAuthGatewayFactory(() =>
  createSupabaseAuthGateway(userScopedSupabaseClient, {
    emailRedirectTo: "alyr://callback",
    passwordRecoveryRedirectTo: "alyr://reset-password"
  })
);
```

The signed native entry point now performs this composition through
`installSignedSupabaseRuntimeFromEnvironment()`. Configure only public client
values:

```dotenv
EXPO_PUBLIC_SUPABASE_URL=https://PROJECT_REF.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=PUBLIC_PUBLISHABLE_KEY
```

Legacy projects may use an `anon`-role JWT in
`EXPO_PUBLIC_SUPABASE_ANON_KEY`; `service_role` JWTs and `sb_secret_` keys are
rejected. The URL must use HTTPS. The API base is derived as
`/functions/v1/api`, and the confirmation redirect remains
`alyr://callback`; the password recovery redirect is
`alyr://reset-password`.

The production client follows the Supabase React Native lifecycle:

- `persistSession`, `autoRefreshToken`, and PKCE are enabled;
- URL session detection is disabled because Expo Router owns the callback;
- auth operations use the Supabase process lock;
- a regular signed-in session or ordinary PKCE confirmation code never enables
  the reset form;
- the recovery grant exists only in process, is claimed before the provider
  update, and is revoked before every reset-route exit;
- a separate in-process recovery-session marker keeps the truthful completion
  screen available after the one-use grant is consumed, until sign-out succeeds;
- pending exchanges settle before provider sign-out, and a failed sign-out
  leaves the user on the recovery surface with a visible error;
- one `AppState` listener runs refresh only while the app is active;
- provider session JSON is split into small, checksummed records in
  device-bound Expo SecureStore;
- no provider token is written to AsyncStorage, React context, analytics or
  logs.

If either public value is absent or unsafe, a signed build stays in
`mode: "unavailable"`. Expo Go, web, and tests use their explicit preview
profile and never construct this network client.

Without a configured factory, Expo Go, web and test runtimes use the preview
gateway. It is intentionally memory-only: it sends no email, marks no email as
verified, returns no access token, creates no session until the user explicitly
chooses a test session, and loses all identities when the JavaScript session
ends. A signed runtime fails closed with `mode: "unavailable"` instead of
silently falling back to preview identity or device-global storage.

`AuthFlowProvider` mounts once at the application root. It restores the current
provider session before routing, listens for provider sign-out/account changes,
and never puts the bearer token into React state. Transports request the bearer
directly from `AccountAuthGateway.currentAccessToken()` at request time.
`createUserAccessTokenProvider()` adapts that result to the callback required
by `HttpSyncTransport` and `HttpHouseholdAccess`.

The global `AuthBootstrapBoundary` keeps every route closed while session state
is unknown. A restore failure shows a localized, privacy-safe error with Retry
and Sign out actions; it does not silently fall through to Welcome. Retry asks
the provider for the current session again, while successful sign-out returns
to the real signed-out route state.

The provider also coordinates `HouseholdAccessPort`: only a session whose
provider metadata says `owner` can create an invitation, and a recipient is
routed into the household only after the refreshed provider tuple exactly
matches the accepted membership.

## Integration gates

The root app must:

1. register the auth route group and direct a signed-out first user to
   `/(auth)`;
2. allow-list `alyr://callback` in Supabase Auth redirect URLs;
3. allow-list `alyr://reset-password` for password recovery;
4. use a user-scoped Supabase client with secure refresh-token persistence in a
   signed build;
5. resolve the selected active membership from reviewed membership data and
   expose `active_household_id`, `active_membership_id`, and
   `active_household_role` together in server-controlled `app_metadata`;
   partial tuples and user-editable metadata are never authorization sources;
6. complete cloud membership/workspace reconciliation before declaring a
   returning account's workspace ready;
7. inject `currentAccessToken()` into sync/invite transports without logging,
   persisting or placing the token in analytics.

The local boundary now derives an opaque account+household scope for the
SQLCipher database, outbox, key names, protected attachments and temporary
materializations. Changing account or household remounts the workspace
boundary and locks both previous resources. A loaded snapshot whose household
does not match the selected scope is rejected. The legacy device scope remains
available only to preview/test runtimes.

## Truth states

- `delivery: "requested"` means Supabase accepted the request; it does not
  assert inbox delivery.
- `delivery: "none"` means the preview did not send email.
- `assurance: "verified-email"` is returned only from a provider session whose
  email is confirmed.
- `assurance: "preview"` always keeps `emailVerified: false`.
- Signed record routes require verified email, completed onboarding, and the
  full provider-controlled household, membership, and role tuple.
- Invitation codes exist only in the invite screen state long enough for an
  explicit share action. They are not persisted, logged, or sent to analytics.
- Expo Go can review the same journey with an explicit session-only fixture;
  it creates no cloud membership.
- Household setup ends with the first real capture rather than a decorative
  success screen.
