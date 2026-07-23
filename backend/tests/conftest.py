import os

os.environ.setdefault(
    "JWT_SECRET_KEY",
    "test-only-jwt-secret-key-with-at-least-32-characters",
)
os.environ.setdefault("JWT_ALGORITHM", "HS256")
os.environ.setdefault("JWT_ACCESS_TOKEN_EXPIRE_MINUTES", "30")
