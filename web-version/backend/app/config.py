import os
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    google_api_key: str = ""
    
    cloudinary_cloud_name: str = ""
    cloudinary_api_key: str = ""
    cloudinary_api_secret: str = ""
    
    qdrant_url: str = ""
    qdrant_api_key: str = ""
    gemini_embed_url: str = ""
    
    database_url: str = "sqlite:///./lipi_app.db"
    
    # Auth
    secret_key: str = ""
    access_token_expire_minutes: int = 60 * 24 * 7 # 7 days

    cors_origins: str = ""
    max_upload_size_mb: int = 20
    user_storage_limit_mb: int = 20
    user_ai_call_limit: int = 20

    @property
    def user_storage_limit_bytes(self) -> int:
        return self.user_storage_limit_mb * 1024 * 1024

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

settings = Settings()

if not settings.secret_key:
    raise RuntimeError("SECRET_KEY must be configured")
if not settings.qdrant_url or not settings.gemini_embed_url or not settings.cors_origins:
    raise RuntimeError("QDRANT_URL, GEMINI_EMBED_URL, and CORS_ORIGINS must be configured")
