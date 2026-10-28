from typing import Literal
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    app_name: str = "DocFlow API"
    api_prefix: str = "/api"
    database_url: str = "mysql+pymysql://docflow:docflow@localhost:3306/docflow"
    cors_origins: str = "http://localhost:5173,http://localhost:3000"
    seed_demo_data: bool = True
    external_api_key: str = "change-me-in-production"
    auth_secret: str = "change-me-in-development-docflow-auth"
    auth_access_minutes: int = Field(default=30, ge=1)
    auth_session_hours: int = Field(default=24, ge=1)
    auth_cookie_secure: bool | None = None
    auth_cookie_samesite: Literal["lax", "strict", "none"] = "lax"
    auth_bcrypt_rounds: int = 12
    bootstrap_admin_username: str = "admin"
    bootstrap_admin_password: str = ""
    bootstrap_admin_name: str = "Administrator"
    bootstrap_admin_email: str = ""
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_username: str = ""
    smtp_password: str = ""
    smtp_from_email: str = ""
    smtp_security: Literal["starttls", "ssl", "plain"] = "starttls"
    smtp_timeout_seconds: int = 15
    email_poll_seconds: int = 30
    public_app_url: str = ""
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    @property
    def cors_origin_list(self) -> list[str]: return [v.strip() for v in self.cors_origins.split(",") if v.strip()]

    @property
    def mail_configured(self) -> bool:
        return bool(self.smtp_host and self.smtp_from_email)

settings = Settings()
