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


@lru_cache
def get_settings() -> Settings:
    return Settings()
