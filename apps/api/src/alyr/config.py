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

    # Run queued jobs inside the API process after each request. Convenient locally
    # and in tests. In production set this to false and run `python -m alyr.worker`.
    jobs_inline: bool = True
    # First retry delay; it doubles on each further attempt.
    jobs_backoff_seconds: float = 5.0

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

    # The Catalog is hidden for every shop until the go-live sweep (ALY-113, D-039). This is
    # the one switch that sweep flips: with it off, onboarding gives every type of business
    # exactly the setup it gave before the Catalog (no `catalog` module, no samples, and the
    # three types that exist only for the Catalog are not offered); with it on, each type
    # starts with its own catalog (ALY-107, `presets_catalog.py`). It decides for businesses
    # created from now on. It never switches anything on for a shop that already exists.
    catalog_for_new_shops: bool = False

    # Per shop, to start (D-039; our estimate). A cap stops new items or photos with a
    # clear message and never deletes anything.
    catalog_max_items: int = 1000
    catalog_max_photos: int = 3000

    # R2's free tier is 10 GB-month of storage (checked 17 Oct 2026). Gigabytes here are
    # decimal, which is the smaller reading, so the alert comes early rather than late.
    media_free_bytes: int = 10_000_000_000
    media_alert_percent: int = 80


@lru_cache
def get_settings() -> Settings:
    return Settings()
