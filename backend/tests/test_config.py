import pytest
from pydantic import ValidationError

from app.core.config import Settings


def production_settings(**overrides: object) -> Settings:
    values: dict[str, object] = {
        "_env_file": None,
        "environment": "production",
        "debug": False,
        "jwt_secret_key": "a-secure-random-production-jwt-key-1234567890",
        "initial_admin_username": "admin",
        "initial_admin_password": "A-secure-production-admin-password-2026!",
    }
    values.update(overrides)
    return Settings(**values)


def test_production_configuration_accepts_non_default_secrets() -> None:
    settings = production_settings()

    assert settings.environment == "production"
    assert settings.debug is False


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("jwt_secret_key", "dev-only-change-this-to-a-random-secret-at-least-32-chars"),
        ("initial_admin_password", "replace-with-long-random-admin-password"),
    ],
)
def test_production_configuration_rejects_placeholder_secrets(
    field: str,
    value: str,
) -> None:
    with pytest.raises(ValidationError):
        production_settings(**{field: value})


def test_production_configuration_rejects_debug_mode() -> None:
    with pytest.raises(ValidationError):
        production_settings(debug=True)
