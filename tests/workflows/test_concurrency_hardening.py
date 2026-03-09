from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime

import pytest
import requests

from tests.conftest import require_database
from tests.helpers.db_checks import connect, fetch_one, resolve_table
from tests.helpers.payloads import call_payload, sms_payload


@pytest.mark.heavy
def test_concurrent_sms_duplicate_ingest_is_idempotent(settings, basic_auth, db_available):
    require_database(db_available, settings)

    sms_id = int(datetime.utcnow().timestamp() * 1000)
    payload = sms_payload(settings.device_id, sms_id=sms_id)

    def send_one():
        return requests.post(
            f"{settings.base_url}/upload/sms",
            auth=basic_auth,
            json=payload,
            timeout=25,
        )

    responses = []
    with ThreadPoolExecutor(max_workers=8) as pool:
        futures = [pool.submit(send_one) for _ in range(8)]
        for future in as_completed(futures):
            responses.append(future.result())

    assert all(r.status_code in (200, 201) for r in responses), [r.status_code for r in responses]

    with connect(settings.db_path) as conn:
        row = fetch_one(
            conn,
            "SELECT COUNT(*) AS cnt FROM sms_messages WHERE device_id = ? AND sms_id = ?",
            (settings.device_id, sms_id),
        )
        assert row is not None
        assert int(row["cnt"]) == 1


@pytest.mark.heavy
def test_concurrent_call_duplicate_ingest_is_idempotent(settings, basic_auth, db_available):
    require_database(db_available, settings)

    call_id = str(int(datetime.utcnow().timestamp() * 1000))
    payload = call_payload(settings.device_id, call_id=call_id)

    def send_one():
        return requests.post(
            f"{settings.base_url}/upload/call",
            auth=basic_auth,
            json=payload,
            timeout=25,
        )

    responses = []
    with ThreadPoolExecutor(max_workers=8) as pool:
        futures = [pool.submit(send_one) for _ in range(8)]
        for future in as_completed(futures):
            responses.append(future.result())

    assert all(r.status_code in (200, 201) for r in responses), [r.status_code for r in responses]

    with connect(settings.db_path) as conn:
        row = fetch_one(
            conn,
            "SELECT COUNT(*) AS cnt FROM call_logs WHERE device_id = ? AND call_id = ?",
            (settings.device_id, call_id),
        )
        assert row is not None
        assert int(row["cnt"]) == 1


@pytest.mark.heavy
def test_concurrent_command_poll_delivers_single_pending_command(settings, db_available):
    require_database(db_available, settings)

    with connect(settings.db_path) as conn:
        command_table = resolve_table(conn, ["device_command", "device_commands"])
        assert command_table is not None
        conn.execute(
            f"""
            INSERT INTO {command_table} (device_id, command, status, created_at, created_by)
            VALUES (?, ?, ?, ?, ?)
            """,
            (settings.device_id, "start", "pending", datetime.utcnow().isoformat(), "pytest_concurrency"),
        )
        conn.commit()

    def poll_once():
        return requests.get(f"{settings.base_url}/api/command?device_id={settings.device_id}", timeout=25)

    responses = []
    with ThreadPoolExecutor(max_workers=6) as pool:
        futures = [pool.submit(poll_once) for _ in range(6)]
        for future in as_completed(futures):
            responses.append(future.result())

    status_codes = [r.status_code for r in responses]
    assert all(code == 200 for code in status_codes), status_codes

    payloads = [r.json() for r in responses]
    served = [p for p in payloads if p.get("command") == "start"]
    assert len(served) <= 1, f"Command served multiple times under concurrent polling: {payloads}"
