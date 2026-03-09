from datetime import datetime

import pytest

from tests.conftest import require_admin_session, require_database
from tests.helpers.api_client import ApiClient, try_json
from tests.helpers.db_checks import connect, fetch_one, resolve_table


@pytest.mark.quick
def test_sms_upload_rejects_invalid_basic_auth(settings):
    client = ApiClient(settings.base_url)
    response = client.post(
        "/upload/sms",
        auth=("invalid", "invalid"),
        json={"device_id": settings.device_id},
    )
    assert response.status_code == 401


@pytest.mark.quick
def test_sms_upload_rejects_missing_required_fields(settings, basic_auth):
    client = ApiClient(settings.base_url)
    response = client.post("/upload/sms", auth=basic_auth, json={"device_id": settings.device_id})
    body = try_json(response)

    assert response.status_code == 400
    assert "error" in body


@pytest.mark.quick
def test_call_upload_rejects_missing_required_fields(settings, basic_auth):
    client = ApiClient(settings.base_url)
    response = client.post("/upload/call", auth=basic_auth, json={"device_id": settings.device_id})
    body = try_json(response)

    assert response.status_code == 400
    assert "error" in body


@pytest.mark.quick
def test_location_rejects_missing_coordinates(settings):
    client = ApiClient(settings.base_url)
    response = client.post(
        "/api/location",
        json={"device_id": settings.device_id, "location": {"lat": None, "lng": None}},
    )
    body = try_json(response)

    assert response.status_code == 400
    assert "error" in body


@pytest.mark.quick
def test_audio_upload_rejects_missing_file(settings):
    client = ApiClient(settings.base_url)
    response = client.post(f"/api/upload/audio/{settings.device_id}", data={"platform": "android"})
    body = try_json(response)

    assert response.status_code == 400
    assert "error" in body


@pytest.mark.full
def test_download_rejects_directory_traversal_filename(settings, admin_session):
    require_admin_session(admin_session)

    response = admin_session.get(f"{settings.base_url}/api/uploads/..%2Fevil.wav", timeout=20)
    assert response.status_code in (400, 404)


@pytest.mark.full
def test_command_complete_rejects_device_mismatch(settings, db_available):
    require_database(db_available, settings)
    client = ApiClient(settings.base_url)

    with connect(settings.db_path) as conn:
        command_table = resolve_table(conn, ["device_command", "device_commands"])
        assert command_table is not None

        conn.execute(
            f"""
            INSERT INTO {command_table} (device_id, command, status, created_at, created_by)
            VALUES (?, ?, ?, ?, ?)
            """,
            (settings.device_id, "start", "pending", datetime.utcnow().isoformat(), "pytest_negative"),
        )
        conn.commit()
        row = fetch_one(
            conn,
            f"SELECT id FROM {command_table} WHERE device_id = ? ORDER BY id DESC LIMIT 1",
            (settings.device_id,),
        )
        assert row is not None
        command_id = int(row["id"])

    response = client.post(
        f"/api/command/{command_id}/complete",
        json={"device_id": "TST_MISMATCH_DEVICE"},
    )
    body = try_json(response)

    assert response.status_code == 403
    assert body.get("success") is False
