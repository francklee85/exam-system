from functools import lru_cache
from typing import Annotated, Literal, Self

from pydantic import AnyHttpUrl, Field, SecretStr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=("../.env", ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "Online Exam System API"
    environment: Literal["local", "test", "production"] = "local"
    debug: bool = False
    api_v1_prefix: str = "/api/v1"
    database_url: str = (
        "mysql+asyncmy://exam_user:change_me@127.0.0.1:3306/exam_system?charset=utf8mb4"
    )
    backend_cors_origins: list[AnyHttpUrl] = [AnyHttpUrl("http://localhost:5173")]
    jwt_secret_key: Annotated[SecretStr, Field(min_length=32)]
    jwt_algorithm: Literal["HS256", "HS384", "HS512"] = "HS256"
    jwt_access_token_expire_minutes: Annotated[int, Field(gt=0)] = 30
    initial_admin_username: Annotated[str, Field(min_length=1, max_length=50)] | None = None
    initial_admin_password: Annotated[SecretStr, Field(min_length=12)] | None = None

    @model_validator(mode="after")
    def validate_initial_admin_credentials(self) -> Self:
        username_is_set = self.initial_admin_username is not None
        password_is_set = self.initial_admin_password is not None
        if username_is_set != password_is_set:
            raise ValueError(
                "INITIAL_ADMIN_USERNAME and INITIAL_ADMIN_PASSWORD must be set together"
            )

        if self.environment == "production":
            if self.debug:
                raise ValueError("DEBUG must be false in production")

            jwt_secret = self.jwt_secret_key.get_secret_value().lower()
            weak_markers = ("change-this", "change_me", "changeme", "replace-with", "dev-only")
            if any(marker in jwt_secret for marker in weak_markers):
                raise ValueError("JWT_SECRET_KEY must be replaced for production")

            if self.initial_admin_password is not None:
                admin_password = self.initial_admin_password.get_secret_value().lower()
                if any(marker in admin_password for marker in weak_markers):
                    raise ValueError("INITIAL_ADMIN_PASSWORD must be replaced for production")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
