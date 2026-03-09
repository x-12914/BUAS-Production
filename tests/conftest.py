import os
import uuid
import json
from dataclasses import dataclass
from pathlib import Path

import pytest
import requests


@dataclass(frozen=True)
class TestSettings:
    base_url: str
    admin_username: str | None
    admin_password: str | None
    basic_username: str
    basic_password: str
    device_id: str
    db_path: Path
    upload_dir: Path
    app_log_path: Path | None
    rbac_credentials: dict


def pytest_addoption(parser):
    parser.addoption("--base-url", action="store", default=os.getenv("TEST_BASE_URL", "http://127.0.0.1:5000"))
    parser.addoption("--admin-username", action="store", default=os.getenv("TEST_ADMIN_USERNAME"))
    parser.addoption("--admin-password", action="store", default=os.getenv("TEST_ADMIN_PASSWORD"))
    parser.addoption("--basic-username", action="store", default=os.getenv("TEST_BASIC_USERNAME", "admin"))
    parser.addoption("--basic-password", action="store", default=os.getenv("TEST_BASIC_PASSWORD", "supersecret"))
    parser.addoption("--test-device-id", action="store", default=os.getenv("TEST_DEVICE_ID"))
    parser.addoption("--db-path", action="store", default=os.getenv("TEST_DB_PATH", "uploads.db"))
    parser.addoption("--upload-dir", action="store", default=os.getenv("TEST_UPLOAD_DIR", "uploads"))
    parser.addoption("--app-log-path", action="store", default=os.getenv("TEST_APP_LOG_PATH"))
    parser.addoption("--rbac-credentials", action="store", default=os.getenv("TEST_RBAC_CREDENTIALS"))


@pytest.fixture(scope="session")
def settings(pytestconfig):
    device_id = pytestconfig.getoption("test_device_id") or f"TST_DEVICE_{uuid.uuid4().hex[:10]}"
    raw_rbac = pytestconfig.getoption("rbac_credentials")
    parsed_rbac = {}
    if raw_rbac:
        try:
            parsed_rbac = json.loads(raw_rbac)
        except json.JSONDecodeError:
            parsed_rbac = {}

    return TestSettings(
        base_url=pytestconfig.getoption("base_url").rstrip("/"),
        admin_username=pytestconfig.getoption("admin_username"),
        admin_password=pytestconfig.getoption("admin_password"),
        basic_username=pytestconfig.getoption("basic_username"),
        basic_password=pytestconfig.getoption("basic_password"),
        device_id=device_id,
        db_path=Path(pytestconfig.getoption("db_path")).resolve(),
        upload_dir=Path(pytestconfig.getoption("upload_dir")).resolve(),
        app_log_path=Path(pytestconfig.getoption("app_log_path")).resolve() if pytestconfig.getoption("app_log_path") else None,
        rbac_credentials=parsed_rbac,
    )


@pytest.fixture(scope="session")
def run_id():
    return uuid.uuid4().hex[:10]


@pytest.fixture(scope="session")
def basic_auth(settings):
    return (settings.basic_username, settings.basic_password)


@pytest.fixture(scope="function")
def admin_session(settings):
    if not settings.admin_username or not settings.admin_password:
        return None

    session = requests.Session()
    response = session.post(
        f"{settings.base_url}/api/auth/login",
        json={
            "username": settings.admin_username,
            "password": settings.admin_password,
            "remember": False,
        },
        timeout=20,
    )
    if response.status_code != 200:
        return None
    return session


def _login_session(base_url: str, username: str, password: str):
    session = requests.Session()
    response = session.post(
        f"{base_url}/api/auth/login",
        json={
            "username": username,
            "password": password,
            "remember": False,
        },
        timeout=20,
    )
    if response.status_code != 200:
        return None
    return session


@pytest.fixture(scope="function")
def rbac_sessions(settings):
    sessions = {}
    for role, creds in settings.rbac_credentials.items():
        username = (creds or {}).get("username")
        password = (creds or {}).get("password")
        if not username or not password:
            continue
        session = _login_session(settings.base_url, username, password)
        if session is not None:
            sessions[role] = session
    return sessions


@pytest.fixture(scope="session")
def db_available(settings):
    return settings.db_path.exists()


def require_admin_session(admin_session):
    if admin_session is None:
        pytest.skip("Admin session unavailable. Set TEST_ADMIN_USERNAME/TEST_ADMIN_PASSWORD.")


def require_database(db_available, settings):
    if not db_available:
        pytest.skip(f"Database file not found at {settings.db_path}. Set TEST_DB_PATH.")


def require_rbac_sessions(rbac_sessions):
    if not rbac_sessions:
        pytest.skip("RBAC sessions unavailable. Set TEST_RBAC_CREDENTIALS JSON env var.")
