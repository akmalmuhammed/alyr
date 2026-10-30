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
| Resend CLI key | `~/.config/resend/credentials.json` | Resend → API keys → Full access, then `resend login` | `resend domains list` |
| Cloudflare DNS token (`CLOUDFLARE_API_TOKEN`) | `apps/api/.env` | Cloudflare → My Profile → API Tokens → "Edit zone DNS", zone alyr.qa only | A read of the zone's DNS records works |
| Cloudflare R2 token (`ALYR_R2_ACCESS_KEY_ID`, `ALYR_R2_SECRET_ACCESS_KEY`) | `apps/api/.env`; production in the key vault | Cloudflare → R2 object storage → Manage API tokens → one token for the bucket `alyr-media` only, Object Read and Write. Take the Access Key ID and Secret Access Key (not the "token value", which the app does not use) | `ALYR_TEST_R2_LIVE=1 uv run pytest tests/test_media_r2_live.py` passes (see `photo-storage.md`) |
| Customer-link secret (`ALYR_LINK_SECRET`, signs order and booking links) | `apps/api/.env`; production in the key vault | A new random string of at least 32 characters (`python -c "import secrets; print(secrets.token_urlsafe(48))"`). **Changing it ends every order and booking link already sent** (a customer asks for a new one in their chat), which is also the answer to a leaked link: there is no way yet to end one customer's link alone. The API refuses to start outside `ALYR_ENV=local` without it | Ask for the order link and the booking link from a test phone; each page opens as that customer. Open an old link: the page says it is no longer valid and to ask the shop for a new one |
| Payment keys sealing key (`ALYR_PAYMENT_KEYS_KEY`, seals the keys shops paste from their payment provider) | `apps/api/.env`; production in the key vault | 32 new random bytes, base64 (`python -c "import base64, os; print(base64.b64encode(os.urandom(32)).decode())"`). **Changing it makes every connected payment account's keys unreadable**: webhooks for those accounts are refused, each account turns to "connect again" (`keys_unreadable`) the first time a job needs it, and its shop's links go back to the stand-in until the owner connects again, so tell the shops first. If it leaked, also ask each shop to roll its keys at the provider, since the sealed values in the database could be opened with it | Connect the test provider on a laptop, or a real provider's sandbox keys on staging; the account reads `connected` |
| Cloudflare tunnel credentials | `~/.cloudflared/<id>.json` | `cloudflared tunnel token` / recreate the tunnel | `scripts/demo.sh check` reaches `api.alyr.online/health` |
| Database passwords (production) | Key vault | Change the role password, update the vault, restart the API | `/health` and a sign-in |

Old values: revoke in the provider's dashboard and note the date in `docs/access.md`.
After rotation, restart what reads the value (`scripts/demo.sh down` then `up`).
