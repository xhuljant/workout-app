"""Application configuration.

Every setting is read from an environment variable (docker-compose provides them;
see the project's .env file). We use pydantic-settings so the values are validated
and converted to the right types automatically, and so a missing required value
fails loudly at startup instead of silently later.
"""
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # How to reach Postgres. Format:
    #   postgresql+psycopg2://<user>:<password>@<host>:<port>/<database>
    database_url: str

    # Secret used to sign login tokens. MUST be long and random.
    # Generate one with:
    #   python -c "import secrets; print(secrets.token_urlsafe(64))"
    jwt_secret: str

    # JWT signing algorithm. HS256 = symmetric (signed and verified with jwt_secret).
    jwt_algorithm: str = "HS256"

    # How long a short-lived access token is valid, in minutes.
    access_token_expire_minutes: int = 15

    # How long a long-lived refresh token is valid, in days. Long, so a device
    # stays signed in between sessions; the client silently swaps it for a new
    # access token whenever the short one expires.
    refresh_token_expire_days: int = 90

    # --- Password reset -----------------------------------------------------
    # How long an emailed "forgot my password" link stays valid, in minutes.
    password_reset_token_expire_minutes: int = 30

    # Public origin of the running app, used to build the reset link in the
    # email. No trailing slash. In Docker/prod set this to the real URL.
    app_base_url: str = "http://localhost:8000"

    # --- Outbound email (SMTP) --------------------------------------------
    # If smtp_host is unset, password-reset emails are written to the server
    # log instead of being sent -- fine for local dev, NOT for production.
    smtp_host: str | None = None
    smtp_port: int = 587
    smtp_user: str | None = None
    smtp_password: str | None = None
    smtp_from: str = "Workout Log <no-reply@localhost>"
    smtp_tls: bool = True          # STARTTLS on the configured port
    smtp_timeout: int = 10         # seconds

    # Also read a local ".env" file if one exists (handy when running without Docker).
    # extra="ignore" means unrelated env vars won't cause an error.
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


# One shared settings instance that the rest of the app imports.
settings = Settings()
