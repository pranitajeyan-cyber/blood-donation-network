"""Application settings.

Everything is overridable through environment variables prefixed with ``BDN_``
(see ``.env.example``). Defaults are safe for local development only.
"""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_prefix="BDN_",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "Blood Donation Network API"
    version: str = "0.1.0"
    api_prefix: str = "/api"

    # --- storage -----------------------------------------------------------
    # SQLite locally so the project runs with zero infrastructure.
    # Production: postgresql+psycopg://user:pass@host/db  (schema is Postgres-safe)
    database_url: str = "sqlite:///./bdn.db"

    # --- auth --------------------------------------------------------------
    secret_key: str = "dev-only-insecure-key-change-me-in-production"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24  # 1 day

    # --- domain rules ------------------------------------------------------
    donor_lock_days: int = 120          # legal gap between two donations
    request_ttl_hours: int = 6         # auto-expiry for an unfilled request
    escalation_tiers_minutes: list[int] = [0, 15, 30]
    escalation_radii_km: list[int] = [5, 15, 50]
    caregiver_escalation_minutes: int = 30

    # --- forecasting -------------------------------------------------------
    forecast_horizon_days: int = 7
    backtest_split: float = 0.8        # fraction of history used for training


@lru_cache
def get_settings() -> Settings:
    return Settings()
