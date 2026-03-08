# External Storage / File Download Removal Status

## Status

External storage browsing and file-tree/media ingestion are fully removed from active BUAS and BAT workflows.

## Current Behavior

- Frontend external-storage UI route removed.
- `/api/upload/device-data/<device_id>` remains active.
- Backend external-storage/file-tree/file-download routes are removed.
- Backend command polling no longer serves `download_file` commands.
- BAT non-storage upload flow remains active (`collectdata`, `uploaddata`, `comprehensive`).
- BAT storage permission/metadata managers and storage test commands are removed.

## Database Cleanup

- SQLAlchemy storage models are removed.
- Legacy tables may still exist in older SQLite files and should be dropped with a one-time migration script.

## Completed Removal Checklist

1. Remove BAT storage-specific managers/callers.
2. Remove backend external-storage/file-download routes and command branches.
3. Remove backend storage-related SQLAlchemy models.
4. Keep non-storage ingestion and monitoring flows operational.

## Remaining Operational Step

- Run the DB cleanup script (`drop_external_storage_tables.py`) once per environment to remove legacy tables from existing databases.

## Validation Gates

- Backend still ingests call/SMS/contact/device metadata.
- Frontend still supports device details, logs, recordings, and streaming.
- BAT still polls commands and uploads non-storage payloads.

## Rollback

- Keep migration reversible.
- Roll back backend image first if regressions appear.
- Defer table-drop rollout until client parity is confirmed.