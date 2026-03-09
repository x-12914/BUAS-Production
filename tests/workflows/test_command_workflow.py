from datetime import datetime

import pytest

from tests.conftest import require_database
from tests.helpers.api_client import ApiClient, try_json
from tests.helpers.db_checks import connect, fetch_one, resolve_table


@pytest.mark.full
def test_command_poll_then_complete(settings, db_available):
    require_database(db_available, settings)
    client = ApiClient(settings.base_url)

    with connect(settings.db_path) as conn:
        command_table = resolve_table(conn, ["device_command", "device_commands"])
        assert command_table is not None, "Command table not found"

        conn.execute(
            f"""
            INSERT INTO {command_table} (device_id, command, status, created_at, created_by)
            VALUES (?, ?, ?, ?, ?)
            """,
            (settings.device_id, "start", "pending", datetime.utcnow().isoformat(), "pytest"),
        )
        conn.commit()

        inserted = fetch_one(
            conn,
            f"SELECT id FROM {command_table} WHERE device_id = ? ORDER BY id DESC LIMIT 1",
            (settings.device_id,),
        )
        assert inserted is not None
        inserted_id = int(inserted["id"])

    poll_response = client.get(f"/api/command?device_id={settings.device_id}")
    poll_body = try_json(poll_response)
    assert poll_response.status_code == 200
    assert poll_body.get("command") == "start"
    assert int(poll_body.get("command_id")) == inserted_id

    complete_response = client.post(
        f"/api/command/{inserted_id}/complete",
        json={"device_id": settings.device_id},
    )
    complete_body = try_json(complete_response)
    assert complete_response.status_code == 200
    assert complete_body.get("success") is True

    with connect(settings.db_path) as conn:
        command_table = resolve_table(conn, ["device_command", "device_commands"])
        row = fetch_one(conn, f"SELECT status FROM {command_table} WHERE id = ?", (inserted_id,))
        assert row is not None
        assert row["status"] == "executed"
