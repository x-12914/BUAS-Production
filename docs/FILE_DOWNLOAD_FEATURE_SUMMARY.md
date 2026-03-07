# External Storage / File Download Status (Archived)

## Status

External storage browsing and file-tree/media ingestion are no longer part of active BUAS workflow.

## Current Behavior (Compatibility Mode)

- Frontend external-storage UI route removed.
- `/api/upload/device-data/<device_id>` remains active.
- Legacy `files` and `media` fields are accepted but not persisted.
- BAT non-storage upload flow remains active (`collectdata`, `uploaddata`, `comprehensive`).
- BAT `teststorage` command is a no-op acknowledgement.

## What Is Intentionally Kept

- External-storage related tables/models are retained in phase 1 for migration safety.
- Compatibility endpoints remain available until phase 2 full removal.

## Phase 2 Full Removal Checklist

1. Confirm all BAT clients are upgraded and no longer call file-system/file-download endpoints.
2. Remove BAT storage-specific managers/callers.
3. Remove backend external-storage/file-download routes and command branches.
4. Apply DB migration dropping storage-related tables.
5. Remove corresponding SQLAlchemy models.

## Validation Gates

- Backend still ingests call/SMS/contact/device metadata.
- Frontend still supports device details, logs, recordings, and streaming.
- BAT still polls commands and uploads non-storage payloads.

## Rollback

- Keep migration reversible.
- Roll back backend image first if regressions appear.
- Defer table-drop rollout until client parity is confirmed.