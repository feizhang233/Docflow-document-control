from typing import Literal
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    app_name: str = "DocFlow API"
    api_prefix: str = "/api"
    database_url: str = "mysql+pymysql://docflow:docflow@localhost:3306/docflow"
    cors_origins: str = "http://localhost:5173,http://localhost:3000"
    seed_demo_data: bool = True
    external_api_key: str = "change-me-in-production"
    auth_secret: str = "change-me-in-development-docflow-auth"
    auth_access_minutes: int = 30
    auth_refresh_days: int = 7
    auth_cookie_secure: bool | None = None
    auth_cookie_samesite: Literal["lax", "strict", "none"] = "lax"
    auth_bcrypt_rounds: int = 12
    bootstrap_admin_username: str = "admin"
    bootstrap_admin_password: str = ""
    bootstrap_admin_name: str = "Administrator"
    bootstrap_admin_email: str = ""
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    @property
    def cors_origin_list(self) -> list[str]: return [v.strip() for v in self.cors_origins.split(",") if v.strip()]

settings = Settings()
