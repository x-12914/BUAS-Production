import pytest


@pytest.mark.full
def test_app_log_has_no_unhandled_traceback(settings):
    if not settings.app_log_path:
        pytest.skip("TEST_APP_LOG_PATH not set; skipping log integrity check")
    if not settings.app_log_path.exists():
        pytest.skip(f"Log file not found at {settings.app_log_path}")

    content = settings.app_log_path.read_text(encoding="utf-8", errors="ignore")
    assert "Traceback (most recent call last)" not in content
