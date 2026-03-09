# BUAS Test Matrix (Manual VPS Execution)

| ID | Layer | Workflow | Endpoint(s) | Assertions | Mode |
|---|---|---|---|---|---|
| WF-HEALTH-001 | Workflow | Service health | `GET /api/health` | 200 + `status=healthy` + timestamp/version present | quick |
| WF-AUTH-001 | Workflow | Admin login/logout | `POST /api/auth/login`, `GET /api/auth/status`, `POST /api/auth/logout` | Session cookie works; authenticated then unauthenticated status transitions | quick |
| WF-LOC-001 | Workflow | Device location ingest | `POST /api/location` | 200 success; echoed device_id/coordinates; DB row exists; coordinates within range | quick |
| WF-SMS-001 | Workflow | SMS ingest + dedupe | `POST /upload/sms` | first upload 201 or 200; duplicate upload 200; DB unique key behavior preserved | quick |
| WF-SMS-002 | Workflow | SMS retrieval (auth) | `GET /api/device/<id>/sms` | 200; payload contains list + pagination + summary fields | full |
| WF-CALL-001 | Workflow | Call log ingest + dedupe | `POST /upload/call` | first upload 201 or 200; duplicate upload 200; DB unique key behavior preserved | quick |
| WF-CALL-002 | Workflow | Call log retrieval (auth) | `GET /api/device/<id>/call_logs` | 200; payload contains list + pagination + summary fields | full |
| WF-AUDIO-001 | Workflow | Audio upload | `POST /api/upload/audio/<id>` | 200; filename returned; DB Upload row exists | quick |
| WF-AUDIO-002 | Workflow | Audio listing + file retrieval | `GET /api/device/<id>/audio-files`, `GET /api/uploads/<filename>` | 200; uploaded filename present; file downloadable and non-empty | full |
| WF-CMD-001 | Workflow | Command poll + completion | `GET /api/command?device_id=...`, `POST /api/command/<id>/complete` | pending->sent->executed status progression | full |
| INT-RBAC-001 | Integration | Role permission matrix | dashboard/audit/system/control endpoints | allow/deny outcomes match role permissions | full |
| INT-DB-001 | Integration | Required tables present | SQLite schema check | required table groups exist (`device_info`, `sms_messages`, `call_logs`, etc.) | quick |
| INT-DB-002 | Integration | SMS duplicate guard | DB query over `sms_messages` | no duplicate `(device_id,sms_id)` groups | full |
| INT-DB-003 | Integration | Call duplicate guard | DB query over `call_logs` | no duplicate `(device_id,call_id)` groups | full |
| INT-DB-004 | Integration | Upload file linkage | DB + filesystem | recent `Upload.filename` values exist on disk | full |
| INT-DB-005 | Integration | Location validity | DB query over `device_location` | latitude/longitude always in valid geographic ranges | quick |
| INT-LOG-001 | Integration | Unhandled error scan | optional app log path (`TEST_APP_LOG_PATH`) | no `Traceback (most recent call last)` in log file | full |
| INT-NEG-001 | Integration | Negative contract checks | invalid auth/missing fields/path traversal | controlled 4xx responses, no server crash behavior | quick/full |
| REL-CONC-001 | Reliability | Concurrent duplicate ingest | `/upload/sms`, `/upload/call` | idempotent dedupe under parallel requests | heavy |
| REL-CONC-002 | Reliability | Concurrent command polling | `/api/command?device_id=...` | pending command served at most once | heavy |
| REL-STREAM-001 | Reliability | Stream reconnect resilience | Socket.IO `/device` connect/disconnect/reconnect | reconnect establishes second clean connection | heavy |
| REL-SMOKE-001 | Reliability | Repeat health and ingest loops | selected workflow tests | no intermittent errors across repeated runs | heavy |

## Manual Runtime Guidance

- **quick**: 5-10 min (pre-deploy sanity)
- **full**: 15-35 min (deeper confidence)
- **release**: 30-60+ min (with repeated loops/heavy checks)
