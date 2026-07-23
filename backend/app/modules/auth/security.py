from datetime import UTC, datetime, timedelta

import jwt
from jwt import ExpiredSignatureError
from jwt import InvalidTokenError as PyJWTInvalidTokenError
from pwdlib import PasswordHash
from pwdlib.exceptions import UnknownHashError
from pydantic import BaseModel, ConfigDict, ValidationError

from app.core.config import get_settings

_password_hash = PasswordHash.recommended()
_dummy_password_hash = _password_hash.hash("authentication-timing-placeholder")


class TokenError(Exception):
    """Base exception for access-token validation failures."""


class ExpiredTokenError(TokenError):
    """Raised when an access token has expired."""


class InvalidTokenError(TokenError):
    """Raised when an access token is malformed or fails validation."""


class TokenClaims(BaseModel):
    model_config = ConfigDict(extra="ignore")

    sub: str
    exp: int
    iat: int


def hash_password(password: str) -> str:
    return _password_hash.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return _password_hash.verify(password, password_hash)
    except UnknownHashError:
        return False


def verify_password_for_missing_user(password: str) -> None:
    """Perform equivalent password work when a username does not exist."""
    _password_hash.verify(password, _dummy_password_hash)


def create_access_token(
    subject: int | str,
    *,
    expires_delta: timedelta | None = None,
) -> str:
    settings = get_settings()
    issued_at = datetime.now(UTC)
    expires_at = issued_at + (
        expires_delta
        if expires_delta is not None
        else timedelta(minutes=settings.jwt_access_token_expire_minutes)
    )
    payload = {
        "sub": str(subject),
        "iat": issued_at,
        "exp": expires_at,
    }
    return jwt.encode(
        payload,
        settings.jwt_secret_key.get_secret_value(),
        algorithm=settings.jwt_algorithm,
    )


def decode_access_token(token: str) -> TokenClaims:
    settings = get_settings()
    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret_key.get_secret_value(),
            algorithms=[settings.jwt_algorithm],
            options={"require": ["sub", "exp", "iat"]},
        )
        return TokenClaims.model_validate(payload)
    except ExpiredSignatureError as exc:
        raise ExpiredTokenError from exc
    except (PyJWTInvalidTokenError, ValidationError) as exc:
        raise InvalidTokenError from exc
