# BUAS API Documentation

This reference lists active and compatibility endpoints used by the current BUAS stack.

## Authentication

- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/status`
- `POST /api/auth/change-password`
- `GET /api/auth/profile`
- `POST /api/auth/check-password-strength`
- `GET /api/auth/password-requirements`

## User Management (`/api/users`)

- `GET /api/users`
- `POST /api/users`
- `GET /api/users/<user_id>`
- `POST /api/users/<user_id>/reset-password`
- `POST /api/users/<user_id>/deactivate`
- `POST /api/users/<user_id>/reactivate`
- `POST /api/users/<user_id>/assign-devices`
- `GET /api/users/<user_id>/devices`
- `GET /api/users/available-devices`
- `GET /api/users/roles`
- `GET /api/users/stats`

## Device Monitoring and Control

- `GET /api/dashboard-data`
- `GET /api/health`
- `GET /api/device/<device_id>/details`
- `GET /api/device/<device_id>/extended-info`
- `GET /api/device/<device_id>/location-history`
- `GET /api/device/<device_id>/recording-events`
- `GET /api/device/<device_id>/audio-files`
- `GET /api/device/<device_id>/recording/status`
- `POST /api/device/<device_id>/recording/command`
- `POST /api/recording/batch-command`
- `POST /api/start-listening/<user_id>`
- `POST /api/stop-listening/<user_id>`

## Data Ingestion (Device/BAT)

- `POST /api/upload/audio/<device_id>`
- `POST /api/upload/metadata/<device_id>`
- `POST /api/upload/device-info/<device_id>`
- `POST /api/upload/device-info/battery/<device_id>`
- `POST /api/upload/device-data/<device_id>`
- `POST /api/external/location`
- `POST /api/external/heartbeat`
- `POST /api/external/recording-event`
- `POST|GET /upload/sms`
- `POST|GET /upload/call`

## Retrieval and Export

- `GET /api/device/<device_id>/sms`
- `GET /api/device/<device_id>/call_logs`
- `GET /api/device/<device_id>/contacts`
- `GET /api/audio/<device_id>/latest`
- `GET /api/audit-logs`
- `POST /api/device/<device_id>/export`
- `GET /api/export/device-locations/<device_id>`
- `GET /api/export/recording-events/<device_id>`

## Command Polling (Android)

- `GET /api/command/<device_id>`
- `POST /api/command/<command_id>/complete`
- `GET /api/command`

## Session and Auth Model

- Authentication is cookie/session-based.
- Frontend requests must use credentials (`withCredentials` / `credentials: include`).
- Most endpoints require authenticated users and role/permission checks.

## External Storage and File Tree Endpoints

The following endpoints remain for compatibility but are deprecated from active workflow:

- `POST /api/upload/file-system-tree/<device_id>`
- `POST /api/upload/file`
- `GET /api/device/<device_id>/file-system/tree`
- `GET /api/device/<device_id>/file-system/folder/<folder_path>`
- `GET /api/device/<device_id>/file-system/search`
- `POST /api/device/<device_id>/file/<file_path>/download`
- `GET /api/device/<device_id>/download-request/<request_id>/status`
- `GET /api/external-storage/download/<filename>`

Current behavior for `/api/upload/device-data/<device_id>`:
- Accepts legacy `files` and `media` fields for compatibility.
- Ignores file-tree/media persistence in surgical removal mode.

See `FILE_DOWNLOAD_FEATURE_SUMMARY.md` for full deprecation details.

## Source of Truth

For complete endpoint behavior, consult:

- `app/routes.py`
- `app/auth/routes.py`
- `app/user_routes/user_management.py`