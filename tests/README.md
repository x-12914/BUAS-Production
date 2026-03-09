# BUAS Manual Test Suite (VPS)

This suite is designed for **manual execution on VPS** (no Docker required), using your existing Python `venv`.

## Structure

- `tests/unit`: Pure logic tests (fast)
- `tests/integration`: API + database/storage consistency tests
- `tests/workflows`: End-to-end workflow checks (SMS, call logs, location, audio, command flow)
- `tests/helpers`: Shared clients, payload builders, and DB check helpers
- `tests/scripts`: VPS runner scripts (`quick`, `full`, `release`)
- `tests/reports`: Generated reports/logs from script runs

## Prerequisites

1. Backend is running and reachable (default: `http://127.0.0.1:5000`)
2. VPS Python environment is active:
   - `source .venv/bin/activate`
3. Install test dependencies:
   - `pip install -r tests/requirements-test.txt`

## Optional Environment Variables

Set these when you want authenticated checks and DB-level assertions:

- `TEST_BASE_URL` (default: `http://127.0.0.1:5000`)
- `TEST_ADMIN_USERNAME` (for session-protected endpoints)
- `TEST_ADMIN_PASSWORD` (for session-protected endpoints)
- `TEST_BASIC_USERNAME` (default: `admin`)
- `TEST_BASIC_PASSWORD` (default: `supersecret`)
- `TEST_DEVICE_ID` (default: generated `TST_DEVICE_...`)
- `TEST_DB_PATH` (default: `uploads.db`)
- `TEST_UPLOAD_DIR` (default: `uploads`)
- `TEST_APP_LOG_PATH` (optional: app log file path for traceback scan test)
- `TEST_STREAM_URL` (optional: stream server URL for WebSocket resilience test)
- `TEST_STREAM_ANDROID_ID` (optional: device android_id for stream auth)
- `TEST_STREAM_DEVICE_TOKEN` (optional: device token for stream auth)
- `TEST_RBAC_CREDENTIALS` (optional JSON for role-matrix tests), example:

```json
{
  "super_super_admin": {"username": "ssa_user", "password": "..."},
  "super_user": {"username": "su_user", "password": "..."},
  "analyst": {"username": "analyst_user", "password": "..."},
  "operator": {"username": "operator_user", "password": "..."}
}
```

## Run Modes

### Quick (pre-deploy smoke)
`pytest -m quick -q`

### Full (regular validation)
`pytest -m "quick or full" -q`

### Release (deep checks)
`pytest -m "quick or full or heavy" -q`

## VPS Helper Scripts

- Linux/macOS shell:
  - `bash tests/scripts/run_vps_checks.sh quick`
  - `bash tests/scripts/run_vps_checks.sh full`
  - `bash tests/scripts/run_vps_checks.sh release`

- PowerShell:
  - `./tests/scripts/run_vps_checks.ps1 -Mode quick`
  - `./tests/scripts/run_vps_checks.ps1 -Mode full`
  - `./tests/scripts/run_vps_checks.ps1 -Mode release`

## Notes

- Tests use `TST_` identifiers to reduce collision with production-like data.
- Some checks are skipped automatically when credentials/DB path are not provided.
- This suite does not require CI and is intended for manual confidence validation.

## Combined Hardening Coverage

- RBAC role-vs-endpoint matrix checks (`tests/integration/test_rbac_matrix.py`)
- Negative payload/auth/validation checks (`tests/integration/test_negative_contracts.py`)
- Concurrency and idempotency checks (`tests/workflows/test_concurrency_hardening.py`)
- Optional stream reconnect resilience check (`tests/workflows/test_stream_resilience.py`)
