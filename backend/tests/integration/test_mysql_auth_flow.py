import asyncio
import os

import pytest
from httpx import ASGITransport, AsyncClient

from app.db.session import engine
from app.main import app

RUN_MYSQL_TESTS = os.getenv("RUN_MYSQL_TESTS") == "1"
AUTH_TEST_USERNAME = os.getenv("MYSQL_AUTH_TEST_USERNAME")
AUTH_TEST_PASSWORD = os.getenv("MYSQL_AUTH_TEST_PASSWORD")
AUTH_TEST_IS_CONFIGURED = AUTH_TEST_USERNAME is not None and AUTH_TEST_PASSWORD is not None


@pytest.mark.skipif(
    not RUN_MYSQL_TESTS or not AUTH_TEST_IS_CONFIGURED,
    reason="set RUN_MYSQL_TESTS and MYSQL_AUTH_TEST credentials",
)
def test_mysql_login_then_get_current_user() -> None:
    async def exercise_auth_flow() -> None:
        assert AUTH_TEST_USERNAME is not None
        assert AUTH_TEST_PASSWORD is not None

        try:
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                login_response = await client.post(
                    "/api/v1/auth/login",
                    json={
                        "username": AUTH_TEST_USERNAME,
                        "password": AUTH_TEST_PASSWORD,
                    },
                )
                assert login_response.status_code == 200
                token = login_response.json()["access_token"]

                me_response = await client.get(
                    "/api/v1/auth/me",
                    headers={"Authorization": f"Bearer {token}"},
                )
                assert me_response.status_code == 200
                current_user = me_response.json()
                assert set(current_user) == {"id", "username", "real_name", "roles"}
                assert isinstance(current_user["id"], int)
                assert current_user["username"] == AUTH_TEST_USERNAME
                assert current_user["real_name"] == "系统管理员"
                assert current_user["roles"] == ["admin"]
        finally:
            await engine.dispose()

    asyncio.run(exercise_auth_flow())
