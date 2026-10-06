from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="ALYR_", env_file=".env", extra="ignore")

    env: str = "local"
    database_url: str = ""
    redis_url: str = ""

    meta_app_secret: str = ""
    meta_verify_token: str = ""
    meta_access_token: str = ""
    meta_phone_number_id: str = ""
    meta_graph_version: str = "v21.0"


@lru_cache
def get_settings() -> Settings:
    return Settings()
