# Rotating a secret

Do this when a secret may have leaked, when someone with access leaves, and once a year for
long-lived tokens. Always: create the new one, put it in place, check it works, then revoke
the old one (except after a leak: revoke first). Never paste the value into chat or a doc.

| Secret | Where it lives | Create a new one | Check |
|---|---|---|---|
| Meta system-user token (`ALYR_META_ACCESS_TOKEN`) | `apps/api/.env` | Meta Business settings → System users → `alyradmin` → Generate token (whatsapp_business_messaging, whatsapp_business_management) | `scripts/demo.sh check` shows the number |
| Meta app secret (`ALYR_META_APP_SECRET`) | `apps/api/.env` | Meta app → Settings → Basic → Reset app secret | Send "hello" from a test phone; a reply means signatures verify |
| Webhook verify token (`ALYR_META_VERIFY_TOKEN`) | `apps/api/.env` and Meta webhook settings | Any new random string, set in both places | Meta's "Verify and save" succeeds |
| Resend app key (`ALYR_EMAIL_API_KEY`) | `apps/api/.env` | `resend api-keys create --name ... --permission sending_access --domain-id <alyr.qa>`, written straight into `.env` | Sign in at `/login`; the code arrives by email |
| Paddle API key (`ALYR_PADDLE_API_KEY`) and notification secret (`ALYR_PADDLE_WEBHOOK_SECRET`) (ALY-180) | Production in Secret Manager (`paddle-api-key`, `paddle-webhook-secret`); `infra/gcp/setup.sh set-secret <name>` | Paddle → Developer tools → Authentication (new API key, then revoke the old one); Notifications → the destination → rotate the secret (Paddle signs with both for a while, and ALYR accepts either `h1`) | Start a card checkout from a test client's go-live list in the sandbox; pay with a test card; `/ops` shows the card payment |
| Resend CLI key | `~/.config/resend/credentials.json` | Resend → API keys → Full access, then `resend login` | `resend domains list` |
| Cloudflare DNS token (`CLOUDFLARE_API_TOKEN`) | `apps/api/.env` | Cloudflare → My Profile → API Tokens → "Edit zone DNS", zone alyr.qa only | A read of the zone's DNS records works |
| Cloudflare token that publishes the site (GitHub secret `CLOUDFLARE_API_TOKEN` in the environment `production`; ALY-269) | GitHub → Settings → Environments → production. Not in `.env`: the same name there is the DNS token above, a different token | Cloudflare → My Profile → API Tokens → Roll (or the "Edit Cloudflare Workers" template, `docs/runbooks/site-deploy.md` step 1), then `gh secret set CLOUDFLARE_API_TOKEN --env production --repo akmalmuhammed/alyr` | The next approved `site deploy` run publishes and reads `/version.txt` back |
| Cloudflare token for site previews (GitHub secret `CLOUDFLARE_API_TOKEN` in the environment `preview`; ALY-269) | GitHub → Settings → Environments → preview | A custom token with Account → Workers Scripts → Edit only (`docs/runbooks/site-deploy.md` step 1), then `gh secret set CLOUDFLARE_API_TOKEN --env preview --repo akmalmuhammed/alyr` | A pull request that touches `apps/web` gets its preview address |
| Cloudflare R2 token (`ALYR_R2_ACCESS_KEY_ID`, `ALYR_R2_SECRET_ACCESS_KEY`) | `apps/api/.env`; production in the key vault | Cloudflare → R2 object storage → Manage API tokens → one token for the bucket `alyr-media` only, Object Read and Write. Take the Access Key ID and Secret Access Key (not the "token value", which the app does not use) | `ALYR_TEST_R2_LIVE=1 uv run pytest tests/test_media_r2_live.py` passes (see `photo-storage.md`) |
| Customer-link secret (`ALYR_LINK_SECRET`, signs order and booking links) | `apps/api/.env`; production in the key vault | A new random string of at least 32 characters (`python -c "import secrets; print(secrets.token_urlsafe(48))"`). **Changing it ends every order and booking link already sent** (a customer asks for a new one in their chat), which is also the answer to a leaked link: there is no way yet to end one customer's link alone. The API refuses to start outside `ALYR_ENV=local` without it | Ask for the order link and the booking link from a test phone; each page opens as that customer. Open an old link: the page says it is no longer valid and to ask the shop for a new one |
| Client-address key (`ALYR_CLIENT_IP_KEYS` on the API, `CLIENT_IP_KEY` on the edge Worker; signs the visitor's address, ALY-265) | Secret Manager `client-ip-key`; the Worker's secret | `infra/gcp/setup.sh client-ip-key rotate`, then `setup.sh edge-key`, then `setup.sh client-ip-key finish` (nothing breaks in between: the API accepts both keys until `finish`). After a leak run `finish` right after `edge-key` | `scripts/check-client-address.sh` passes; `client-address.md` |
| Customer-link secret, as the key to ALYR staff's authenticators (ALY-125, D-136) | the same `ALYR_LINK_SECRET` | The AES key that seals each staff member's authenticator secret and the HMAC key of their recovery codes are derived from it (HKDF), so **rotating it makes every staff authenticator and recovery code unreadable**, as well as ending every customer link. Before rotating: `staff-access.sh unrequire` if the second factor is required. After: each member of staff signs in with the mailbox code and sets the app up again (Security), or `reset-factor` then `open-enrolment`; then `ready` and `require` | `docs/runbooks/staff-sign-in.md` |
| Payment keys sealing key (`ALYR_PAYMENT_KEYS_KEY`, seals the keys shops paste from their payment provider) | `apps/api/.env`; production in the key vault | 32 new random bytes, base64 (`python -c "import base64, os; print(base64.b64encode(os.urandom(32)).decode())"`). **Changing it makes every connected payment account's keys unreadable**: webhooks for those accounts are refused, each account turns to "connect again" (`keys_unreadable`) the first time a job needs it, and its shop's links go back to the stand-in until the owner connects again, so tell the shops first. If it leaked, also ask each shop to roll its keys at the provider, since the sealed values in the database could be opened with it | Connect the test provider on a laptop, or a real provider's sandbox keys on staging; the account reads `connected` |
| Cloudflare tunnel credentials | `~/.cloudflared/<id>.json` | `cloudflared tunnel token` / recreate the tunnel | `scripts/demo.sh check` reaches `api.alyr.online/health` |
| Database passwords (production) | Key vault | Change the role password, update the vault, restart the API | `/health` and a sign-in |

Old values: revoke in the provider's dashboard and note the date in `docs/access.md`.
After rotation, restart what reads the value (`scripts/demo.sh down` then `up`). On Google a new
value goes in with `infra/gcp/setup.sh set-secret <name>`, which also restarts the API and the worker.

## Where production stands (30 Oct 2026, ALY-34; go-live audit CLD-15)

Read from Secret Manager's metadata only (names, versions, dates; no value was read) with
`infra/gcp/audit.sh secrets`. Run it again after any rotation: it lists what is left to tidy.

| Secret in Secret Manager | Made | Origin | Rotated since go-live? | What to do |
|---|---|---|---|---|
| `postgres-password`, `app-db-password`, `database-url`, `migration-url` | 27 Oct | Generated by `setup.sh secrets` straight into Secret Manager, never shown | No, and no need yet | Rotate on a leak or when someone with access leaves. **No script does it yet** (follow-up, below) |
| `link-secret` | 27 Oct | Generated the same way | No | Changing it ends every order and booking link already sent (row above) |
| `client-ip-key` | 30 Oct | Generated by `setup.sh client-ip-key` | New | `client-ip-key rotate`, `edge-key`, `finish` (row above) |
| `meta-app-secret`, `meta-verify-token`, `meta-phone-number-id`, `meta-waba-id` | 27 Oct | Copied in one batch from the laptop's `apps/api/.env` (`setup.sh env-secrets`) | **No** | The app secret and the verify token are development-era: rotate both (rows above), together, because the webhook uses both |
| `meta-access-token` | 27 Oct, 28 Oct | 3 versions. The 28 Oct one is the permanent system-user token made for production; the first came from the laptop | The 28 Oct token is production-era. **The laptop's `.env` may still hold the first one, valid at Meta** | Generate a new system-user token, store it, revoke every older token at Meta, and clear the laptop's `.env` |
| `email-api-key` | 27 Oct | Copied from the laptop | **No** | New send-only key for `alyr.qa`, revoke the old |
| `r2-access-key-id`, `r2-secret-access-key`, `r2-account-id` | 27 Oct, 28 Oct | Copied from the laptop; later versions set on 28 Oct | **Unproven**: versions changed, but nothing records that the token was rolled at Cloudflare | Make a new bucket-limited R2 token, store it, revoke the old one; keep it out of `apps/api/.env` or accept the laptop as a second holder |

Not in Secret Manager but in the same family, and **not rotated** (all in the laptop's `apps/api/.env` or
the founder's home folder): the Cloudflare DNS token, the Resend CLI key, the Cloudflare tunnel
credentials. The tunnel (`api.alyr.online`) stopped being the webhook on 28 Oct; **delete the tunnel and its
credentials file**, which removes a secret instead of rotating one. GitHub's two Cloudflare tokens are
`runbooks/release.md`'s to roll (go-live checklist, Releases).

**Superseded versions are still enabled** (CLD-15): `meta-access-token` (versions 1 and 2) and the three R2 secrets
(`r2-access-key-id`, `r2-secret-access-key`, `r2-account-id`, version 1 each) keep their old versions readable by anyone who
can read the secret (today only the project owner, ALY-268). **The founder decides when to disable them.** What was checked
on 30 Oct 2026 (ALY-34), and what each could still break:

- **Cloud Run:** all 40 revisions that exist (17 of `alyr-api`, 9 of `alyr-web`, 14 of `alyr-worker`) read their secrets as
  `:latest`; none pins a version number. A rollback to any of them (`rollback.md`) therefore reads the newest version and does
  not need the old ones. The jobs (`alyr-migrate`, `alyr-db-export`) and every script in `infra/` also read `:latest`.
- **`:latest` and a disabled version:** disabling an *older* version changes nothing for a reader of `:latest`. Disabling the
  *newest* breaks every reader at its next start (`FAILED_PRECONDITION`), so **never disable the newest** (tried on a scratch
  secret). Going back after a bad rotation is `setup.sh set-secret` with the old value (a new version), not a disable.
- **What disabling an old version could break:** only something that reads that version by number. None is known (Cloud
  Run and `infra/` were checked; the laptop's own scripts and anyone's notes were not). Disabling is reversible
  (`gcloud secrets versions enable <n> --secret=<name>`); destroying is not, so do not destroy.
- **What it does not do:** it does not revoke anything at Meta or Cloudflare. A token that was valid stays valid there until
  revoked in the provider's dashboard. Disable the old version after the old token is revoked, or the old version is the
  only copy you could use to undo a bad revocation.

The commands, one per version (also printed by `infra/gcp/audit.sh secrets`), each safe to run at any time for the reasons
above and each undone by `enable`:

```bash
gcloud secrets versions disable 1 --secret=meta-access-token --project=alyr-prod
gcloud secrets versions disable 2 --secret=meta-access-token --project=alyr-prod
gcloud secrets versions disable 1 --secret=r2-access-key-id --project=alyr-prod
gcloud secrets versions disable 1 --secret=r2-secret-access-key --project=alyr-prod
gcloud secrets versions disable 1 --secret=r2-account-id --project=alyr-prod
```

Never destroy a version until the rotation has held for a week.

**No rotation schedule exists** (CLD-15). Put the date of each rotation in this table and in `docs/access.md`,
and rotate the long-lived tokens at least once a year (the first line of this page). The quarterly review
(`docs/hygiene.md`, section 8) runs `infra/gcp/audit.sh` and reads the "has not changed for over a year" notes.

**Follow-up (a new issue, not this one):** a `setup.sh db-password` that rotates the application role's
password in Cloud SQL and the two URLs together, with the apps restarted in the same minute, so rotating the
database passwords is one command and not a hand-written sequence.
