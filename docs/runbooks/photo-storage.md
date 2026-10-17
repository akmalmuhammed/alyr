# Product photos: storage, outages and takedowns

Written 17 Oct 2026 (ALY-103, D-039). Photos are checked and cleaned by the API, then kept in
the Cloudflare R2 bucket `alyr-media` and served from `https://media.alyr.qa`. Without the R2
settings the API keeps them on local disk (`apps/api/.media/`), which is right for a
developer machine and wrong for a server: the API logs a warning at start-up if it happens in
production.

The five settings: `ALYR_R2_ACCOUNT_ID`, `ALYR_R2_ACCESS_KEY_ID`, `ALYR_R2_SECRET_ACCESS_KEY`,
`ALYR_R2_BUCKET` (`alyr-media`), `ALYR_MEDIA_BASE_URL` (`https://media.alyr.qa`). The first
three are secrets: `apps/api/.env` locally, the key vault in production, never anywhere else.

## Check that R2 works (live smoke test, opt-in)

From `apps/api`, with the settings in `.env`:

```
ALYR_TEST_R2_LIVE=1 uv run pytest tests/test_media_r2_live.py -v -s
```

Where Windows blocks the database driver:
`ALYR_DOCKER_FLAGS="-e ALYR_TEST_R2_LIVE=1" scripts/api-in-docker.sh uv run pytest tests/test_media_r2_live.py -v -s`

It writes one small object under `_check/`, reads it back through R2 and through
`media.alyr.qa`, and deletes it. It never touches a shop's photos. The ordinary test suite
never reaches R2, whatever `.env` holds.

| It fails with | It means |
|---|---|
| "the R2 settings are incomplete" | One of the three secrets is missing from `.env` |
| "the store refused the request (403, ...)" | Wrong key, a token for another bucket, or the token was revoked: make a new one (`secret-rotation.md`) |
| the public address answered 404 | The bucket's custom domain `media.alyr.qa` is off or not yet active |
| `cache-control` is not `immutable` | A Cloudflare cache rule on `media.alyr.qa` is overriding the header photos are stored with; photos still work, but load slower for repeat visitors |

## Photos stay as grey placeholders (R2 down, or the keys are wrong)

Nothing else breaks: orders, the order page and chat carry on. An uploaded photo is accepted
and kept in the database (`media_ops`) until R2 takes it; the job `media.sync` tries again,
doubling the wait up to an hour, for up to 48 tries.

1. Is R2 itself down? <https://www.cloudflarestatus.com>. If so, wait: nothing is lost.
2. Is the key wrong? The job's last error says `the store refused the request (403 ...)`.
   Fix the setting, restart the API and the worker, then retry (3).
3. After the tries run out the photo shows as `failed` and the job is parked. Send it round
   again: `GET /api/jobs/failed`, then `POST /api/jobs/{id}/retry` (workspace session), or
   upload the same photo again (it is recognised and re-queued, not stored twice).
4. How much is waiting? As the database owner: `select count(*), min(created_at) from media_ops;`.
   A backlog older than an hour means something is wrong.

## The 80% alert (R2's free tier is 10 GB)

`GET /api/admin/media/usage` (ALYR staff) returns `alert.level`: `ok`, `warn` from 80% and
`over` from 100%, with the figures per business. The API also logs "photo storage passed 80%
of the free tier" once. R2 does not stop at 10 GB: it keeps working and charges
USD 0.015 per GB-month (D-039), so this is a heads-up, not an outage. Whether to ask a business
to remove photos, raise a price or accept the cost is the founder's decision. The screen for
this comes with ALY-109.

## Taking down a reported photo (the listing policy)

A report arrives by email (hello@ or security@alyr.qa) with the photo's address, or the page
it appears on. The address of a photo is `https://media.alyr.qa/shops/<shop>/<hash>-<size>.webp`.

1. Look at the photo. Decide with the founder if it is not obvious (counterfeit goods and
   prohibited items are not allowed; the terms are ALY-68).
2. `POST /api/admin/media/remove` with `{"ref": "<the address>", "reason": "<why, in a sentence>"}`
   from a back-office session. There is no screen yet (ALY-109).
3. It answers `{"removed": true, "business": "..."}`. The photo disappears from every item at
   once, its files are deleted from R2 (waiting if R2 is down), the shop cannot upload the same
   file again, and the audit log (`GET /api/admin/audit`) gets a `photo.removed` entry with the
   reason.
4. Tell the owner, in person or by email. ALYR never messages a business owner from this route.

A photo already cached by a visitor's browser, or by Cloudflare's edge, can keep showing for a
while after the file is deleted. If it must go at once, purge the address in the Cloudflare
dashboard (Caching, Purge cache, custom URL).

## Moving to another store

The API talks to any S3-compatible store. Copy the objects (`shops/...`), change the five
settings, restart. Names never change, so photos keep their addresses if the media address
points at the new store.
