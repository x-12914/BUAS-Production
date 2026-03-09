import pytest

from tests.helpers.api_client import ApiClient, try_json


@pytest.mark.heavy
def test_repeated_health_check_has_no_spikes(settings):
    client = ApiClient(settings.base_url, timeout=15)

    for _ in range(15):
        response = client.get("/api/health")
        body = try_json(response)
        assert response.status_code == 200
        assert body.get("status") == "healthy"
