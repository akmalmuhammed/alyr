# ALYR native

The real iOS and Android client for ALYR Asset Continuity. It is an Expo Router
application, not a WebView wrapper and not the existing phone-frame prototype.

## Current vertical slice

- Sample or personal onboarding
- Home, Assets, Family, and Vault native tabs
- Offline Quick Passport capture
- Place and room assignment
- Photo/document attachment metadata
- Derived Passport readiness
- Local search and retrieval
- SQLite/SQLCipher repository on native development builds
- SHA-256 + AES-GCM attachment ingestion into app document storage on native
- Deterministic memory repository on tests and web preview
- SecureStore-backed secret adapter
- Durable sync outbox with explicit verified-blob prerequisites
- Authenticated provider-neutral HTTP sync transport with strict response checks

The web build is a developer preview only. Camera, encrypted SQLite, secure
storage, biometric unlock, and background behavior must be verified in signed
native development builds.

## Commands

```bash
npm run start:go
npm run android
npm run typecheck
npm test
npm run config:check
npm run build:preview
```

The SQLCipher and native AES modules require an Expo development build for the
security acceptance gate. Expo Go can be used for visual work, but ALYR labels
any memory fallback as session-only. The web preview intentionally does not
claim encrypted persistence.

Cloud authentication and attachment upload orchestration are still release
gates. The client will not send an evidence-version operation until its blob
has been uploaded and acknowledged as stored.
