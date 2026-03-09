import pytest

from tests.conftest import require_admin_session
from tests.helpers.api_client import ApiClient, try_json


@pytest.mark.quick
def test_health_endpoint(settings):
    client = ApiClient(settings.base_url)
    response = client.get("/api/health")
    body = try_json(response)

    assert response.status_code == 200
    assert body.get("status") == "healthy"
    assert "timestamp" in body
    assert "version" in body


@pytest.mark.quick
def test_admin_login_status_logout_flow(settings, admin_session):
    require_admin_session(admin_session)

    status_before = admin_session.get(f"{settings.base_url}/api/auth/status", timeout=20)
    status_body = try_json(status_before)

    assert status_before.status_code == 200
    assert status_body.get("authenticated") is True

    logout_response = admin_session.post(f"{settings.base_url}/api/auth/logout", timeout=20)
    logout_body = try_json(logout_response)
    assert logout_response.status_code == 200
    assert logout_body.get("success") is True

    status_after = admin_session.get(f"{settings.base_url}/api/auth/status", timeout=20)
    status_after_body = try_json(status_after)
    assert status_after.status_code == 200
    assert status_after_body.get("authenticated") is False
