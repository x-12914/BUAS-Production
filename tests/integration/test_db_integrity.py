import pytest

from tests.conftest import require_database
from tests.helpers.db_checks import connect, fetch_all, fetch_one, list_tables, resolve_table


@pytest.mark.quick
def test_required_table_groups_exist(settings, db_available):
    require_database(db_available, settings)

    required_groups = {
        "upload": ["upload", "uploads"],
        "device_info": ["device_info"],
        "sms_messages": ["sms_messages"],
        "call_logs": ["call_logs"],
        "device_location": ["device_location", "device_locations"],
        "device_command": ["device_command", "device_commands"],
    }

    with connect(settings.db_path) as conn:
        tables = list_tables(conn)
        for group, candidates in required_groups.items():
            assert any(candidate in tables for candidate in candidates), f"Missing table group: {group}"


@pytest.mark.full
def test_sms_unique_invariant(settings, db_available):
    require_database(db_available, settings)

    with connect(settings.db_path) as conn:
        duplicates = fetch_all(
            conn,
            """
            SELECT device_id, sms_id, COUNT(*) AS cnt
            FROM sms_messages
            GROUP BY device_id, sms_id
            HAVING COUNT(*) > 1
            LIMIT 10
            """,
        )
        assert len(duplicates) == 0, f"Duplicate SMS records detected: {duplicates}"


@pytest.mark.full
def test_call_unique_invariant(settings, db_available):
    require_database(db_available, settings)

    with connect(settings.db_path) as conn:
        duplicates = fetch_all(
            conn,
            """
            SELECT device_id, call_id, COUNT(*) AS cnt
            FROM call_logs
            GROUP BY device_id, call_id
            HAVING COUNT(*) > 1
            LIMIT 10
            """,
        )
        assert len(duplicates) == 0, f"Duplicate call log records detected: {duplicates}"


@pytest.mark.quick
def test_location_coordinate_ranges(settings, db_available):
    require_database(db_available, settings)

    with connect(settings.db_path) as conn:
        location_table = resolve_table(conn, ["device_location", "device_locations"])
        assert location_table is not None

        invalid_rows = fetch_all(
            conn,
            f"""
            SELECT id, device_id, latitude, longitude
            FROM {location_table}
            WHERE latitude < -90 OR latitude > 90 OR longitude < -180 OR longitude > 180
            LIMIT 20
            """,
        )
        assert len(invalid_rows) == 0, f"Invalid location rows found: {invalid_rows}"


@pytest.mark.full
def test_recent_upload_rows_have_files(settings, db_available):
    require_database(db_available, settings)

    with connect(settings.db_path) as conn:
        upload_table = resolve_table(conn, ["upload", "uploads"])
        assert upload_table is not None

        rows = fetch_all(
            conn,
            f"SELECT filename FROM {upload_table} ORDER BY id DESC LIMIT 50",
        )

    missing = []
    for row in rows:
        filename = row["filename"]
        file_path = settings.upload_dir / filename
        if not file_path.exists():
            missing.append(filename)

    assert len(missing) == 0, f"Missing upload files on disk: {missing[:10]}"
