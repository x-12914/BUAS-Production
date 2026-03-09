from pathlib import Path

import pytest

from tests.conftest import require_admin_session, require_database
from tests.helpers.api_client import ApiClient, try_json
from tests.helpers.db_checks import connect, fetch_one, resolve_table


@pytest.mark.quick
def test_audio_upload_and_storage_linkage(settings, db_available, run_id):
    require_database(db_available, settings)
    client = ApiClient(settings.base_url)

    filename = f"tst_{run_id}.m4a"
    fake_audio = b"\x00\x11\x22\x33" * 1024

    response = client.post(
        f"/api/upload/audio/{settings.device_id}",
        files={"file": (filename, fake_audio, "audio/mp4")},
        data={"platform": "android"},
    )
    body = try_json(response)

    assert response.status_code == 200
    assert body.get("status") == "success"
    stored_filename = body.get("filename")
    assert stored_filename

    with connect(settings.db_path) as conn:
        upload_table = resolve_table(conn, ["upload", "uploads"])
        assert upload_table is not None
        row = fetch_one(
            conn,
            f"SELECT filename FROM {upload_table} WHERE device_id = ? AND filename = ?",
            (settings.device_id, stored_filename),
        )
        assert row is not None

    saved_file = settings.upload_dir / stored_filename
    assert saved_file.exists(), f"Expected uploaded file at {saved_file}"
    assert saved_file.stat().st_size > 0


@pytest.mark.full
def test_audio_listing_and_download(settings, admin_session):
    require_admin_session(admin_session)

    list_response = admin_session.get(f"{settings.base_url}/api/device/{settings.device_id}/audio-files", timeout=20)
    list_body = try_json(list_response)

    assert list_response.status_code == 200
    assert "audio_files" in list_body
    assert isinstance(list_body["audio_files"], list)

    if not list_body["audio_files"]:
        pytest.skip("No audio files available for download check")

    latest = list_body["audio_files"][0]["filename"]
    download_response = admin_session.get(f"{settings.base_url}/api/uploads/{latest}", timeout=20)
    assert download_response.status_code == 200
    assert len(download_response.content) > 0
