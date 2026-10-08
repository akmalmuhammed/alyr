from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="ALYR_", env_file=".env", extra="ignore")

    env: str = "local"

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

    # Where payment links point. The web app serves /pay/...
    public_web_url: str = "http://localhost:3100"

    meta_app_secret: str = ""
    meta_verify_token: str = ""
    meta_access_token: str = ""
    meta_phone_number_id: str = ""
    meta_waba_id: str = ""
    meta_graph_version: str = "v21.0"


@lru_cache
def get_settings() -> Settings:
    return Settings()
