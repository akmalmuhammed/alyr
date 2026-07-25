# Continuity local API

This is a real, restart-persistent **local development service**. It provides
password authentication, an HttpOnly session cookie, synchronizer-token CSRF
protection, household role enforcement, and storage of the existing
client-encrypted recovery-kit format.

It is intentionally not described as cloud backup or production identity:

- state and encrypted kit files live under `server/data/` by default;
- the process binds to `127.0.0.1` by default;
- one process owns a data directory at a time; this local slice is not a
  clustered database;
- local HTTP cookies omit `Secure`; set `ALYR_LOCAL_SECURE_COOKIES=true` only
  behind HTTPS;
- there is no email verification, password reset, MFA/passkey, malware
  processing, remote replication, key escrow, monitoring, or restore drill;
- the server never receives the recovery-kit passphrase or decrypted workspace.

Run `npm run dev:api`. The web development server should proxy `/api` to
`http://127.0.0.1:8788` so authentication remains same-origin. Do not enable
permissive CORS as a shortcut.

Environment options:

- `ALYR_LOCAL_PORT` (default `8788`)
- `ALYR_LOCAL_HOST` (default `127.0.0.1`)
- `ALYR_LOCAL_DATA_DIR` (default `server/data`)
- `ALYR_LOCAL_APP_ORIGINS` (comma-separated; default
  `http://localhost:4173,http://127.0.0.1:4173`; both explicit loopback
  development origins are accepted, while every other origin remains denied)
- `ALYR_LOCAL_SECURE_COOKIES` (`true` only when HTTPS is actually present)

The latest kit is content-addressed by its exact SHA-256. A new object is
fsynced and atomically renamed before the atomically replaced state pointer is
acknowledged. A crash can therefore leave an unreferenced immutable object, but
cannot overwrite the previously acknowledged latest kit.
