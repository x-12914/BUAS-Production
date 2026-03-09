from datetime import datetime

import pytest

from tests.conftest import require_admin_session, require_database
from tests.helpers.api_client import ApiClient, try_json
from tests.helpers.db_checks import connect, fetch_one, resolve_table
from tests.helpers.payloads import call_payload, location_payload, sms_payload


@pytest.mark.quick
def test_location_workflow_persists_data(settings, db_available):
    require_database(db_available, settings)
    client = ApiClient(settings.base_url)

    payload = location_payload(settings.device_id)
    response = client.post("/api/location", json=payload)
    body = try_json(response)

    assert response.status_code == 200
    assert body.get("status") == "success"
    assert body.get("phone_id") == settings.device_id

    with connect(settings.db_path) as conn:
        location_table = resolve_table(conn, ["device_location", "device_locations"])
        assert location_table is not None, "Location table not found"

        row = fetch_one(
            conn,
            f"SELECT device_id, latitude, longitude FROM {location_table} WHERE device_id = ? ORDER BY id DESC LIMIT 1",
            (settings.device_id,),
        )
        assert row is not None
        assert -90 <= float(row["latitude"]) <= 90
        assert -180 <= float(row["longitude"]) <= 180


@pytest.mark.quick
def test_sms_workflow_upload_and_deduplicate(settings, basic_auth, db_available, run_id):
    require_database(db_available, settings)
    client = ApiClient(settings.base_url)

    sms_id = int(datetime.utcnow().timestamp() * 1000)
    payload = sms_payload(settings.device_id, sms_id=sms_id, address=f"+23480{run_id[-8:]}")

    first = client.post("/upload/sms", json=payload, auth=basic_auth)
    first_body = try_json(first)
    assert first.status_code in (200, 201)
    assert "message" in first_body

    duplicate = client.post("/upload/sms", json=payload, auth=basic_auth)
    duplicate_body = try_json(duplicate)
    assert duplicate.status_code == 200
    assert "message" in duplicate_body

    with connect(settings.db_path) as conn:
        row = fetch_one(
            conn,
            "SELECT COUNT(*) AS cnt FROM sms_messages WHERE device_id = ? AND sms_id = ?",
            (settings.device_id, sms_id),
        )
        assert row is not None
        assert int(row["cnt"]) == 1


@pytest.mark.quick
def test_call_log_workflow_upload_and_deduplicate(settings, basic_auth, db_available, run_id):
    require_database(db_available, settings)
    client = ApiClient(settings.base_url)

    call_id = str(int(datetime.utcnow().timestamp() * 1000))
    payload = call_payload(settings.device_id, call_id=call_id, number=f"+23481{run_id[-8:]}")

    first = client.post("/upload/call", json=payload, auth=basic_auth)
    first_body = try_json(first)
    assert first.status_code in (200, 201)
    assert "message" in first_body

    duplicate = client.post("/upload/call", json=payload, auth=basic_auth)
    duplicate_body = try_json(duplicate)
    assert duplicate.status_code == 200
    assert "message" in duplicate_body

    with connect(settings.db_path) as conn:
        row = fetch_one(
            conn,
            "SELECT COUNT(*) AS cnt FROM call_logs WHERE device_id = ? AND call_id = ?",
            (settings.device_id, call_id),
        )
        assert row is not None
        assert int(row["cnt"]) == 1


@pytest.mark.full
def test_sms_and_call_retrieval_requires_session_and_returns_payload(settings, admin_session):
    require_admin_session(admin_session)

    sms_response = admin_session.get(f"{settings.base_url}/api/device/{settings.device_id}/sms", timeout=20)
    sms_body = try_json(sms_response)
    assert sms_response.status_code == 200
    assert "sms_messages" in sms_body
    assert "pagination" in sms_body

    call_response = admin_session.get(f"{settings.base_url}/api/device/{settings.device_id}/call_logs", timeout=20)
    call_body = try_json(call_response)
    assert call_response.status_code == 200
    assert "call_logs" in call_body
    assert "pagination" in call_body
