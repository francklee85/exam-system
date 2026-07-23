from datetime import timedelta

import pytest

from app.modules.auth.security import (
    ExpiredTokenError,
    InvalidTokenError,
    create_access_token,
    decode_access_token,
    hash_password,
    verify_password,
)


def test_password_hash_and_verification() -> None:
    password = "correct horse battery staple"
    first_hash = hash_password(password)
    second_hash = hash_password(password)

    assert first_hash.startswith("$argon2id$")
    assert first_hash != password
    assert first_hash != second_hash
    assert verify_password(password, first_hash) is True
    assert verify_password("wrong password", first_hash) is False
    assert verify_password(password, "not-a-supported-hash") is False


def test_access_token_round_trip() -> None:
    token = create_access_token(42)
    claims = decode_access_token(token)

    assert claims.sub == "42"
    assert claims.exp > claims.iat


def test_expired_access_token_is_identified() -> None:
    token = create_access_token(42, expires_delta=timedelta(seconds=-1))

    with pytest.raises(ExpiredTokenError):
        decode_access_token(token)


def test_invalid_access_token_is_rejected() -> None:
    with pytest.raises(InvalidTokenError):
        decode_access_token("not-a-jwt")
