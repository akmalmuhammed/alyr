from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="ALYR_", env_file=".env", extra="ignore")

    # Fails safe: anything that is not explicitly "local" gets sign-in, Secure cookies, no
    # simulator and no stand-in payments. Local tooling (scripts/api-in-docker.sh, tests,
    # CI) sets ALYR_ENV=local on purpose (ALY-114).
    env: str = "production"

    # The app connects as a role that cannot bypass Row-Level Security.
    database_url: str = "postgresql://alyr_app:alyr_app_local@localhost:5432/alyr"
    # Migrations and demo-tenant setup connect as the owner.
    migration_url: str = "postgresql://alyr:alyr_local@localhost:5432/alyr"
    redis_url: str = "redis://localhost:6379/0"
    # The read-only role the nightly backup signs in as (scripts/backup). Only migrations
    # use this setting, to create the role; the app never connects with it. Empty: no
    # backup role is created.
    backup_url: str = ""

    # Run queued jobs inside the API process after each request. Convenient locally
    # and in tests. In production set this to false and run `python -m alyr.worker`.
    jobs_inline: bool = True
    # First retry delay; it doubles on each further attempt.
    jobs_backoff_seconds: float = 5.0
    # /health/worker answers 503 when the worker has not checked in for this long.
    worker_stale_seconds: int = 120

    # Local only: let the workspace be used without signing in, as the demo shop.
    # Ignored everywhere except env "local".
    demo_open: bool = True

    # Self-serve sign-up at /start (D-031). Unset: open on a local machine, closed
    # everywhere else until the founder decides to open it.
    signup_open: bool | None = None
    # Prices and the promise are set in the back office, not here (D-032).

    # Local only: read the ALYR Agent as if it were this moment (ISO 8601, with an offset),
    # to look at the samples on a weekday (ALY-99). Ignored everywhere except env "local".
    agent_clock: str = ""

    # Where payment links point. The web app serves /pay/...
    public_web_url: str = "http://localhost:3100"

    # Signs the order links sent to one customer (HMAC-SHA256, core/links.py, ALY-112). Only
    # a local machine may leave it empty (a built-in development value is used); anywhere
    # else the API refuses to start and refuses to make or read a link without it. At least
    # 32 characters, random, never in git. Changing it ends every link already sent.
    link_secret: str = ""
    # How long an order link works. A customer who opens an older one is told how to get a
    # new one (they ask for one in their chat, as they did for the first).
    link_days: int = 60
    # How long the link to an issued document works (ALY-139). A receipt is something people
    # look for months later, so its link lives longer than an order link; an older link is
    # answered with a page that says so, and the shop sends the document again.
    document_link_days: int = 90

    meta_app_secret: str = ""
    meta_verify_token: str = ""
    meta_access_token: str = ""
    meta_phone_number_id: str = ""
    meta_waba_id: str = ""
    meta_graph_version: str = "v21.0"
    # The Meta app's ID. Only `templates_sync` needs it, to upload the sample image a
    # template with an image header is reviewed with (Resumable Upload API).
    meta_app_id: str = ""

    # The weekly report card (ALY-99). Off: outside the 24-hour window the report goes as
    # the text-only `weekly_report` template, and REPORT brings the card. On (once Meta
    # has approved `weekly_report_card` in both languages): the card goes as the
    # template's image header. Inside the window the card goes either way.
    report_card_template: bool = False

    # The three document templates (`document_receipt`, `document_invoice`,
    # `document_credit_note`) are written and not yet submitted to Meta, so a document cannot be
    # sent outside the customer's 24-hour window. Off: such a send is recorded as "not
    # delivered: template not approved" at once, and falls back to email or the hosted link,
    # instead of failing at Meta six times. Switch it on only after Meta approves all three in
    # both languages (the founder does that; ALY-139, ALY-142). Inside the window a document
    # always goes as the PDF itself, whatever this says.
    document_templates_approved: bool = False

    # Webhooks (ALY-142): send to a shop's address on this machine (http, localhost, a private
    # address). Only read when ALYR_ENV is "local", for tests and for a developer's own
    # receiver; in any other environment the guard in `connect/ssrf.py` always applies.
    webhook_allow_local: bool = False

    # Email ALYR sends (sign-in codes) goes through Resend (D-029). Empty key: no email
    # is sent, and on a local machine the sign-in page shows the code instead.
    email_api_key: str = ""
    email_from: str = "ALYR <no-reply@alyr.qa>"
    email_reply_to: str = "hello@alyr.qa"

    # Product photos (D-039, ALY-103). With the account ID and both keys set, photos go to
    # Cloudflare R2 and are served from `media_base_url`. With any of the three missing
    # they go to local disk under `media_local_dir` and the API serves them itself, so a
    # developer machine, a test run and a half-configured server all keep working.
    r2_account_id: str = ""
    r2_access_key_id: str = ""
    r2_secret_access_key: str = ""
    r2_bucket: str = "alyr-media"
    media_base_url: str = "https://media.alyr.qa"
    media_local_dir: str = ".media"

    # What one upload may be. The web page shrinks a photo before sending it, so these
    # only stop a damaged or hostile file. A 12-megapixel phone photo is about 4 MB.
    media_max_upload_bytes: int = 15 * 1024 * 1024
    media_max_pixels: int = 40_000_000

    # The Catalog is on (ALY-113, D-039). With this on, a business created from now on starts
    # with its type's own catalog (ALY-107, `presets_catalog.py`: the `catalog` module, the
    # type's starting values and categories, and a few sample items), and the three types that
    # exist only for the Catalog are offered; travel and documents have none. Set it to false
    # (`ALYR_CATALOG_FOR_NEW_SHOPS=false`) and a new business is created exactly as it was
    # before the Catalog. It decides for businesses created from now on; the shops that
    # already existed got the module from migration 0032, and the back office can switch it
    # off for any one shop.
    catalog_for_new_shops: bool = True

    # Per shop, to start (D-039; our estimate). A cap stops new items or photos with a
    # clear message and never deletes anything.
    catalog_max_items: int = 1000
    catalog_max_photos: int = 3000

    # Importing a spreadsheet (ALY-108): the largest sheet, and the largest zip of photos
    # that goes with it. Both are read into memory, so they are bounded; a sheet of 500
    # items is about 100 KB.
    catalog_import_max_bytes: int = 5 * 1024 * 1024
    catalog_import_max_zip_bytes: int = 40 * 1024 * 1024

    # R2's free tier is 10 GB-month of storage (checked 17 Oct 2026). Gigabytes here are
    # decimal, which is the smaller reading, so the alert comes early rather than late.
    media_free_bytes: int = 10_000_000_000
    media_alert_percent: int = 80


@lru_cache
def get_settings() -> Settings:
    return Settings()
