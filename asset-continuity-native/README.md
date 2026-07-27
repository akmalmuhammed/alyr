# ALYR native

The real iOS and Android client for ALYR Asset Continuity. It is an Expo Router
application, not a WebView wrapper and not the existing phone-frame prototype.

## Current vertical slice

- Sample or personal onboarding
- Today, Items, Family, and Vault native tabs
- Search opens contextually from Items instead of consuming a primary tab
- Household access and invitations in Family, with recovery, privacy, proof,
  and sync diagnostics kept in Vault
- Offline Quick Passport capture
- Place and room assignment
- Photo/document attachment metadata
- Derived Passport readiness
- Local search and retrieval
- SQLite/SQLCipher repository on native development builds
- SHA-256 + AES-GCM attachment ingestion into app document storage on native
- Deterministic memory repository on tests and web preview
- SecureStore-backed secret adapter
- Global account-session bootstrap and provider sign-out listener
- Opaque account+household vault scopes for database, outbox, keys and files
- Stable SecureStore-backed installation identity reused across sync retries
- Automatic locking when the selected account or household changes
- Fail-closed owner/editor/viewer capability checks in UI and mutation commands
- Closed-pilot access preflight before signed account creation
- Signed account deletion plus a separate session-only preview reset
- Request-time user access-token boundary that never enters UI state
- Durable sync outbox with explicit verified-blob prerequisites
- Authenticated provider-neutral HTTP sync transport with strict response checks
- Cross-device Evidence retrieval with SHA-256 verification and encrypted
  local-vault persistence before the restored record becomes openable

The web build is a developer preview only. Camera, encrypted SQLite, secure
storage, biometric unlock, and background behavior must be verified in signed
native development builds.

## Commands

```bash
npm run android
npm run typecheck
npm test
npm run config:check
npm run build:preview
```

The SQLCipher and native AES modules require an Expo development build for the
security acceptance gate. Expo Go and the sibling
`asset-continuity-ios-preview` companion remain visual/session-only previews;
neither proves encrypted persistence.

The signed runtime now has fail-closed Supabase configuration, device-bound
refresh-token persistence, reviewed household access, foreground
reconciliation, Evidence upload verification, and clean-device
download/verification/encryption. These
paths still need a signed physical-iPhone acceptance run before they are called
release-ready. The linked iOS packaging profile, remaining Apple-account gate,
and exact test sequence are recorded in
[`IOS_SIGNED_TEST_READINESS.md`](./IOS_SIGNED_TEST_READINESS.md).
