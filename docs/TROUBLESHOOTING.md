# BUAS Troubleshooting

Use this guide for common runtime and deployment issues.

## 1) Quick Health Checks

From project root:

```bash
python --version
pip --version
python server.py
```

Validate backend:

- `GET http://localhost:5000/api/health`
- `GET http://localhost:5000/api/auth/status`

Validate frontend (dev):

- `http://localhost:4000`

## 2) Authentication Problems

### Symptom: Login fails for valid user

Checks:
- Confirm user exists with `python get_all_users.py`
- Confirm account is active and not locked
- Confirm backend was restarted after env/config changes

Recovery:
- Run admin reset endpoint flow (`/api/users/<id>/reset-password`) from authorized account
- If no admin access, run `python create_initial_admin.py` to bootstrap access

## 3) RBAC / Permission Denied (403)

Checks:
- User role in `users` table
- Device assignment for analyst users
- Endpoint requires role/permission guard

Recovery:
- Use `/api/users/<id>/assign-devices` for analyst mapping
- Verify expected role hierarchy (`super_super_admin`, `super_user`, `analyst`, `operator`)

## 4) Database Issues

### Symptom: Missing table or migration-related errors

Recovery sequence:

```bash
python init_db.py
python create_rbac_tables.py
```

If DB is locked:
- Stop all running backend processes
- Ensure no external SQLite browser is holding `uploads.db`
- Restart backend

## 5) Frontend API Connection Errors

Checks:
- Backend is running on `http://localhost:5000`
- Frontend dev server is on `http://localhost:4000`
- Browser requests include credentials for session auth

Recovery:

```bash
cd frontend
rm -rf node_modules package-lock.json
npm install
npm start
```

Windows PowerShell alternative:

```powershell
cd frontend
Remove-Item -Recurse -Force node_modules
Remove-Item -Force package-lock.json
npm install
npm start
```

## 6) Streaming Issues

### Symptom: Streaming disabled at startup

Checks:
- `ENABLE_STREAMING=true` in active shell
- Redis reachable at configured host/port

Recovery:

```bash
# shell where server starts
set ENABLE_STREAMING=true   # Windows cmd
# or: $env:ENABLE_STREAMING='true'  # PowerShell
# or: export ENABLE_STREAMING=true   # Linux/macOS
python server.py
```

Expected log:
- `Live streaming: ✅ ENABLED`

## 7) BAT Upload/Polling Issues

Checks:
- Device can reach backend host/port
- `/api/command/<device_id>` responds
- Server receives `/upload/sms`, `/upload/call`, and metadata uploads

Notes:
- External storage/file-tree commands and routes are fully removed; non-storage upload flows remain active.

## 8) External Storage Confusion

Current state:
- External storage browser UI is removed from frontend.
- Backend storage/file-tree/download endpoints are removed.
- BAT storage permission, metadata tree, and on-demand file upload paths are removed.

Reference:
- `FILE_DOWNLOAD_FEATURE_SUMMARY.md`

## 9) When to Rebuild

Rebuild frontend when:
- component routes changed
- API service signatures changed
- static assets fail to refresh

Command:

```bash
cd frontend
npm run build
```