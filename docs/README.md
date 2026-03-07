# BUAS Documentation

This folder contains the current operational documentation for the BUAS platform.

## Current Scope

- Flask backend with RBAC/authentication and audit logging
- React frontend dashboard
- BAT Android client integration
- Optional live audio streaming (Socket.IO + Redis)
- External storage browsing is archived/deprecated (see file download summary)

## Document Map

- `SETUP_INSTRUCTIONS.md` — environment setup and first boot
- `API_DOCUMENTATION_RBAC.md` — active API reference (auth, users, core device/data endpoints)
- `TROUBLESHOOTING.md` — targeted diagnosis and recovery steps
- `FILE_DOWNLOAD_FEATURE_SUMMARY.md` — archived external-storage/file-download behavior

Streaming quick-start steps are included in the optional streaming section of `SETUP_INSTRUCTIONS.md`.

## Quick Start

1. Install backend dependencies:
	- `pip install -r requirements.txt`
2. Initialize database:
	- `python init_db.py`
	- `python create_rbac_tables.py`
	- `python create_initial_admin.py`
3. Build frontend:
	- `cd frontend && npm install && npm run build`
4. Start backend:
	- `python server.py`

For full details, use `SETUP_INSTRUCTIONS.md`.

## Notes

- Default backend URL: `http://localhost:5000`
- Frontend dev URL: `http://localhost:4000`
- Streaming is disabled unless `ENABLE_STREAMING=true` is set.

