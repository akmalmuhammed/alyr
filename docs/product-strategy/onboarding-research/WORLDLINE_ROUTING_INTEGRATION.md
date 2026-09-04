# Worldline routing integration

**Reviewed:** 2026-07-30
**Scope:** Expo Router entry, authentication, local sample workspace, and first-record handoff
**Decision:** Gate Worldline at the canonical `/` decision route, not inside the auth flow.

## Why this wiring is safest

The current app already has one authoritative entry decision in `app/index.tsx`:

1. wait for auth bootstrap;
2. honor an undeferred household invite;
3. restore preview or signed-out sample workspaces;
4. send signed-out users to Auth Welcome;
5. resume incomplete verified accounts at Household;
6. restore complete signed accounts and their encrypted workspace.

Worldline is a device-local product introduction, not an auth or workspace state.
Insert it only where an empty signed-out installation currently redirects to
Auth Welcome. This includes Expo Go/web Preview with no workspace as well as
Supabase/unavailable mode with no session. This preserves invite deep links,
verified-session restoration, the Household/Privacy activation sequence, device
authorization, and the durable first-record handoff.

Do **not** gate inside `app/(auth)/_layout.tsx`. That layout protects account
entry and password recovery, and an intro preference must never delay or
override those security-sensitive redirects.

## Required local state

Add a small `OnboardingIntroProvider` under `src/onboarding/` and mount it once
above the router. Its public contract should be:

```ts
type IntroStatus = "loading" | "unseen" | "seen" | "unavailable";

interface OnboardingIntroValue {
  readonly status: IntroStatus;
  readonly markSeen: () => Promise<void>;
}
```

Persistence rules:

- Use the app sandbox, not the account session. A suitable implementation is
  `expo-sqlite/kv-store` on native and `localStorage` on web.
- Suggested stable key: `asset-continuity.first-run-intro.v1`.
- Store only the literal value `seen`.
- Unknown or missing data means `unseen`.
- Read failure means `unavailable`, which fails open to Auth Welcome.
- `markSeen()` updates in-memory state immediately, attempts persistence, and
  never blocks account entry if persistence is unavailable.
- Sign-out, sample exit, account deletion, and auth reset must not clear this
  preference.
- Keep test/dev replay as an injected-store operation; do not expose reset in
  the production onboarding UI.

`expo-secure-store` is not the preferred driver for this non-sensitive flag:
on iOS, Keychain values can outlive an uninstall, which is not precise
once-per-install behavior.

## Exact route changes

### `app/_layout.tsx`

Mount `OnboardingIntroProvider` inside the existing top-level
`SafeAreaProvider`, but outside `AuthFlowProvider`:

```tsx
<SafeAreaProvider>
  <OnboardingIntroProvider>
    <AuthFlowProvider {...authProps}>
      <AuthBootstrapBoundary>
        <SignedWorkspaceBoundary />
      </AuthBootstrapBoundary>
    </AuthFlowProvider>
  </OnboardingIntroProvider>
</SafeAreaProvider>
```

Why here:

- both `/` and `/(onboarding)` receive one hydrated value;
- changing scenes does not reload storage;
- the intro lifecycle stays independent of signed sessions;
- existing Workspace and DeviceAuth providers remain untouched.

Keep the existing `Stack.Screen name="(onboarding)"`. Give it
`animation: "none"` because Worldline owns its internal, reduced-motion-aware
scene transitions:

```tsx
<Stack.Screen
  name="(onboarding)"
  options={{ animation: "none", headerShown: false }}
/>
```

### `app/index.tsx`

Read `status` from `useOnboardingIntro()`. Create one local render helper for the
public empty-installation entry:

```tsx
const publicEntry = () => {
  if (introStatus === "loading") {
    return (
      <View style={styles.loading} testID="onboarding-intro-bootstrap">
        <ActivityIndicator color={colors.action} size="small" />
      </View>
    );
  }
  if (introStatus === "unseen") {
    return <Redirect href="/(onboarding)" />;
  }
  return <Redirect href={AUTH_ROUTES.welcome} />;
};
```

Use that helper in both existing empty-entry branches:

```tsx
if (mode === "preview") {
  return workspace ? <Redirect href="/(tabs)" /> : publicEntry();
}

// Keep signedOutSampleWorkspaceReady(...) before this branch.
if (mode !== "supabase" || !session) {
  return publicEntry();
}
```

The Preview branch must remain after pending-invite handling. The second
public-entry call must remain after:

- `signedOutSampleWorkspaceReady(...)`.

Consequences:

- first ordinary launch enters Worldline, including Expo Go and web preview;
- a direct Sign in, recovery, callback, invite, or Household route is not
  intercepted;
- sign-out returns to Auth Welcome because the installation flag remains seen;
- an existing sample or signed workspace never flashes the intro.

### `app/(auth)/index.tsx`

Do not add an intro redirect or intro storage hook here. Keep this screen as the
canonical action surface for Create, Explore sample, language, and Sign in.
Its existing `prepareAccountEntry()` behavior remains the source of truth for
preview-session reset.

If Worldline sends users directly to Create account or Sign in, extract and
export a small auth entry helper instead of silently omitting the current
preview reset:

```ts
function prepareAccountEntry() {
  clearAuthError();
  clearStatus();
  if (mode === "preview") reset();
}
```

No product name should be added while naming is pending.

### `app/(onboarding)/index.tsx`

Replace `LegacyOnboardingRedirect` with `OnboardingExperience`. The route is
presentation plus orchestration only; it does not create an auth state machine.

Required completion behavior:

| Action | Order | Destination |
|---|---|---|
| Skip introduction | `await markSeen()`; replace | `AUTH_ROUTES.welcome` |
| Sign in | prepare account entry; `await markSeen()`; replace | `AUTH_ROUTES.signIn` |
| Add my first item | prepare account entry; `await markSeen()`; replace | `AUTH_ROUTES.createAccount` |
| Explore a sample | start local sample; `await markSeen()` after success; replace | `/(tabs)` |

Important details:

- do not mark the intro seen merely by reaching scene 4;
- if sample creation fails, remain on scene 4 and show the existing localized
  workspace error;
- navigation must use `replace`, not `push`, so Back cannot reopen a completed
  intro;
- hardware Back on scene 1 should stay in the app; on later scenes it should
  move to the previous scene;
- a persistence error must not trap the user;
- all synthetic globe content must be labeled as an example.

`app/(onboarding)/_layout.tsx` can remain a headerless Stack. Set its animation
to `none` if scene transitions are entirely internal.

## Stable automation selectors

Add these selectors before updating Maestro:

| Selector | Purpose |
|---|---|
| `onboarding-screen` | root introduction surface |
| `onboarding-scene-1` … `onboarding-scene-4` | deterministic scene assertions |
| `onboarding-progress` | named progress, e.g. “Step 2 of 4” |
| `onboarding-next` | scene 1–3 primary action |
| `onboarding-back` | scene 2–4 back action |
| `onboarding-skip` | skip to Auth Welcome |
| `onboarding-sign-in` | existing-user route |
| `onboarding-globe` | accessible globe summary; moving decoration hidden |
| `onboarding-start-first-item` | final create-account entry |
| `onboarding-explore-sample` | final sample entry |
| `onboarding-intro-bootstrap` | non-interactive preference hydration |

Selectors must remain on interactive `Pressable`/button nodes, not nested text.

## Tests that will change

### Jest/source contracts

1. Add store tests for missing, seen, invalid, read-failure, write-failure, and
   idempotent `markSeen`.
2. Add a pure entry-decision test covering:
   - unseen Preview with no workspace → Worldline;
   - seen Preview with no workspace → Auth Welcome;
   - unseen Supabase/unavailable signed-out → Worldline;
   - seen Supabase/unavailable signed-out → Auth Welcome;
   - unavailable preference → Auth Welcome;
   - pending invite → Join even when unseen;
   - signed-out sample → tabs even when unseen;
   - incomplete verified account → Household even when unseen;
   - complete verified account → `/` restoration even when unseen.
3. Update `onboardingDecision.contract.test.ts`:
   - retain every existing assertion about Auth Welcome, Privacy, and
     first-record handoff;
   - add assertions that the intro gate occurs only in the signed-out branch;
   - assert that `app/(auth)/_layout.tsx` does not import intro state.
4. `auth-route-hardening.test.tsx` should continue to pass without a new mock,
   because Auth Welcome does not consume intro state.
5. Update `visualSystemBoundary.contract.test.ts` only if needed to allow
   `expo-linear-gradient` inside `src/onboarding/**`; keep the prohibition
   everywhere else.

### Maestro

Every flow that launches with `clearState: true` currently waits immediately for
`auth-welcome-screen`; those flows will break:

- `flows/00-auth-entry-smoke.yaml`
- `flows/03-local-first-passport-restart.yaml`
- `flows/04-arabic-rtl-smoke.yaml`
- `flows/07-native-signup-confirmation.yaml`
- `flows/08-native-preconfirmed-activation.yaml`
- `subflows/start-sample-workspace.yaml` (and therefore flows 01, 02, 05, 06)

Add `subflows/complete-worldline-intro.yaml`. Existing non-onboarding journeys
should use `onboarding-skip` and then continue asserting Auth Welcome. Add one
dedicated Worldline journey that traverses all four scenes, verifies the globe,
backs up once, advances again, and ends at the existing Auth Welcome or account
entry.

Update `.maestro/validate.mjs` so its native-source corpus includes
`app/(onboarding)/index.tsx` and `src/onboarding/`, and require the selectors
listed above. Keep all current auth, device-preflight, capture, and Passport
selectors; Worldline supplements them rather than replacing them.

## Route truth table

| Existing state | Intro preference | Destination |
|---|---:|---|
| Auth bootstrapping | any | startup status |
| Undeferred invite | any | Join |
| Preview workspace ready | any | Tabs |
| Preview with no workspace | unseen | Worldline |
| Preview with no workspace | seen/unavailable | Auth Welcome |
| Signed-out sample ready | any | Tabs |
| Signed out, ordinary launch | unseen | Worldline |
| Signed out, ordinary launch | seen/unavailable | Auth Welcome |
| Verified account, setup incomplete | any | Household |
| Verified complete account, workspace ready | any | Tabs |
| Verified complete account, workspace restoring | any | signed workspace bootstrap |

This table is the acceptance contract. The intro preference never outranks
account, invitation, workspace, device-unlock, or first-record continuation
state.
