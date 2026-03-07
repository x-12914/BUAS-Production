# BUAS Setup Instructions

This guide covers a clean local setup for backend and frontend.

## 1) Prerequisites

- Python 3.8+
- Node.js 16+
- npm 8+
- (Optional) Redis 6+ for live streaming

## 2) Backend Setup

From project root:

### Windows (PowerShell)

```powershell
python -m venv .venv
.\.venv\Scripts\Activate
python -m pip install --upgrade pip
pip install -r requirements.txt
```

### Linux/macOS

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
pip install -r requirements.txt
```

## 3) Environment Configuration

Create `.env` from template:

### Windows

```powershell
Copy-Item .env.example .env
```

### Linux/macOS

```bash
cp .env.example .env
```

Minimum recommended values:

```env
SECRET_KEY=change-this-in-production
ENABLE_STREAMING=false
REDIS_HOST=localhost
REDIS_PORT=6379
```

## 4) Database Initialization

Run in project root:

```bash
python init_db.py
python create_rbac_tables.py
python create_initial_admin.py
```

Notes:
- `init_db.py` creates base tables.
- `create_rbac_tables.py` adds RBAC tables and indexes.
- `create_initial_admin.py` creates the initial `super_super_admin` user.

## 5) Frontend Setup

```bash
cd frontend
npm install
npm run build
```

For development:

```bash
npm start
```

Frontend dev server runs on `http://localhost:4000`.

## 6) Start Backend

From project root:

```bash
python server.py
```

Backend runs on `http://localhost:5000`.

## 7) Optional: Enable Live Streaming

Live streaming is optional and requires Redis + `ENABLE_STREAMING=true`.

### 7.1 Start Redis

```bash
redis-server
```

Confirm Redis is reachable:

```bash
redis-cli ping
```

Expected result: `PONG`

### 7.2 Enable Feature Flag and Start Backend

Set the variable in the same shell where backend starts.

Windows PowerShell:

```powershell
$env:ENABLE_STREAMING='true'
python server.py
```

Linux/macOS:

```bash
export ENABLE_STREAMING=true
python server.py
```

Expected startup line:
- `Live streaming: ✅ ENABLED`

### 7.3 Validate End-to-End

1. Start frontend (`cd frontend && npm start`).
2. Log in to dashboard.
3. Open a device detail page.
4. Start live listening and confirm the device receives stream commands.

### 7.4 Streaming Failure Checks

- Streaming disabled at startup:
	- Verify `ENABLE_STREAMING=true` in active shell
	- Restart backend after setting env vars
- Redis connection errors:
	- Ensure Redis service is running
	- Verify `REDIS_HOST` and `REDIS_PORT`
- Frontend stream connection issues:
	- Confirm frontend points to correct backend origin
	- Reinstall frontend deps if needed: `cd frontend && npm install`

## 8) Post-Setup Validation

- Health endpoint: `GET /api/health`
- Auth status endpoint: `GET /api/auth/status`
- Verify admin user with login flow from frontend.

## 9) Common Setup Issues

- Missing Python packages: re-run `pip install -r requirements.txt`
- Frontend dependency errors: remove `frontend/node_modules` and run `npm install`
- Database lock issues (SQLite): stop other processes using `uploads.db`
- Streaming disabled unexpectedly: verify `ENABLE_STREAMING` in active shell/session

For issue-specific fixes, see `TROUBLESHOOTING.md`.