import pytest

from tests.conftest import require_rbac_sessions


RBAC_MATRIX = [
    {
        "name": "dashboard_data",
        "method": "GET",
        "path": "/api/dashboard-data",
        "json": None,
        "allowed_roles": {"super_super_admin", "super_user", "analyst", "operator"},
    },
    {
        "name": "audit_logs",
        "method": "GET",
        "path": "/api/audit-logs",
        "json": None,
        "allowed_roles": {"super_super_admin", "super_user"},
    },
    {
        "name": "test_uploads_manage_system",
        "method": "GET",
        "path": "/api/test-uploads",
        "json": None,
        "allowed_roles": {"super_super_admin"},
    },
    {
        "name": "batch_recording_command",
        "method": "POST",
        "path": "/api/recording/batch-command",
        "json_builder": lambda settings: {
            "command": "start",
            "device_ids": [settings.device_id],
        },
        "allowed_roles": {"super_super_admin", "super_user", "operator"},
    },
]


@pytest.mark.full
@pytest.mark.parametrize("case", RBAC_MATRIX, ids=[case["name"] for case in RBAC_MATRIX])
def test_rbac_permission_matrix(case, settings, rbac_sessions):
    require_rbac_sessions(rbac_sessions)

    for role, session in rbac_sessions.items():
        payload = case.get("json")
        if payload is None and "json_builder" in case:
            payload = case["json_builder"](settings)

        if case["method"] == "GET":
            response = session.get(f"{settings.base_url}{case['path']}", timeout=25)
        else:
            response = session.post(f"{settings.base_url}{case['path']}", json=payload, timeout=25)

        if role in case["allowed_roles"]:
            assert response.status_code not in (401, 403), (
                f"Role '{role}' unexpectedly blocked on {case['name']} with status {response.status_code}"
            )
        else:
            assert response.status_code == 403, (
                f"Role '{role}' unexpectedly allowed on {case['name']} with status {response.status_code}"
            )
