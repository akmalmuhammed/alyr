# Hosted Auth configuration snapshot — 2026-08-01

## Scope

A single authenticated, read-only Management API request inspected the linked
Supabase project's Auth configuration. The existing CLI credential stayed in
memory, no secret values were printed or written, and no hosted setting was
changed.

| Item | Evidence |
|---|---|
| Project ref | `ifiyragzeizaxdqzxvpk` |
| Method | `GET /v1/projects/{ref}/config/auth` |
| HTTP result | `200` |
| Redacted snapshot | `D:\HeldatValidation\auth-config-snapshot-20260801\redacted-auth-config.json` |
| Snapshot SHA-256 | `B28C7719FD6DDAE75CA730AAA0FB3833789E3A95D366E9CFA0FB62F2789F09E5` |
| Secret values included | No |

## Confirmed configuration

- Site URL is `https://heldat.app`.
- Email/password auth is enabled, email autoconfirm is disabled, anonymous auth
  is disabled, and the Auth-level signup switch remains open.
- Ten redirect entries cover `heldat://` callbacks, the owned HTTPS callback,
  join and reset routes, plus two `http://localhost:8081` development routes.
- Google auth is enabled and its protected credential field is populated;
  phone auth is disabled.
- JWT expiry is 3,600 seconds and refresh-token rotation is enabled.
- Observed rate limits were email `2`, token refresh `150`, verification `30`,
  and anonymous users `30` in the units returned by the Management API.

## Open launch gates

- Custom SMTP host, credentials, and sender are not configured.
- CAPTCHA is disabled and no CAPTCHA secret is configured.
- The two localhost redirect entries must be reviewed and removed from the
  public production allow-list unless a named release owner documents why they
  remain necessary.
- Opening Auth signup is not evidence that the product enrollment control plane
  is ready for public acquisition.

Public DNS separately showed Cloudflare Email Routing MX records and the SPF
record `v=spf1 include:_spf.mx.cloudflare.net ~all`. No `_dmarc.heldat.app` TXT
record was returned. These public records do not replace the missing Supabase
custom-SMTP and delivery tests.
