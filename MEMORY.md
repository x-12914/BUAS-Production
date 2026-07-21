# BUAS-Production — Memory

_Last updated: 2026-07-04_

Flask + SocketIO backend and React frontend for the BUAS device dashboard, deployed behind nginx on VPS hosts.

## Completed
- ✅ nginx.conf configured for `41.242.54.78` with `/api/`, `/socket.io/`, `/api/uploads/` proxies to `127.0.0.1:5000` (2026-07-03)
- ✅ Backend CORS updated to allow `http://41.242.54.78` origins in `app/__init__.py` (2026-07-03)
- ✅ Frontend `api.js` uses `window.location.origin` in production, so no rebuild is needed when the VPS IP changes (2026-07-03)
- ✅ Deployed `whitelabel-blank` branch to `opt@157.250.205.174` — muted-slate reskin, BUAS text blanked, `server_name` pinned to the IP, PM2-managed Flask on 127.0.0.1:5000 behind nginx, no disruption to the box's other 6 sites (2026-07-04)

## In Progress
- 🔄 Deploying `livestream` branch to fresh Ubuntu VPS at `41.242.54.78` — script written; user still needs to SSH in and run it.

## Planned / Future
- ⬜ `frontend/node_modules/` is committed to the repo — breaks `git pull` on the whitelabel VPS (symlink path-too-long) and forces `rm -rf node_modules && npm install` after every pull. Fix: `.gitignore` it and `git rm -r --cached frontend/node_modules` on `main`.
- ⬜ `create_initial_admin.py:224` hardcodes `WHERE name = 'BUAS'`, so admin creation fails once the seed agency name is blanked. Fix: look up by `id=1` instead.
- ⬜ Whitelabel VPS venv drifted from `requirements.txt` — `eventlet` bumped 0.33.3 → 0.41.0 (Python 3.14 removed `ssl.wrap_socket`), `gunicorn` pinned to 25.3.0 (26 dropped the eventlet worker). If reinstalling deps from `requirements.txt`, re-apply both.
- ⬜ Switch `SESSION_COOKIE_SECURE=True` once TLS is on any VPS.
- ⬜ Add TLS via certbot when a domain is pointed at either box (e.g. `buas.eibstratoc.com` already listed in `nginx.conf` on `livestream`).
- ⬜ Move the SQLite DB (`uploads.db`) to a mounted volume or Postgres before scaling — currently a fixed file at project root.
- ⬜ `ecosystem.config.js` has a `frontend-server` PM2 entry that runs `npm start` (CRA dev server). Nginx serves the static build directly, so that PM2 entry is redundant and should be removed on next cleanup.
- ⬜ Delete `whitelabel-blank` branch once the temporary deployment on `157.250.205.174` ends.

## Reference
- Deploy layout: repo at `/home/opt/BUAS-Production`, venv at `/home/opt/venv`, logs at `/home/opt/BUAS-Production/logs`.
- Backend port: `127.0.0.1:5000` (gunicorn + eventlet, single worker for SocketIO stability).
- Repo: https://github.com/x-12914/BUAS-Production
- Live hosts: `41.242.54.78` (branch `livestream`, dedicated), `157.250.205.174` (branch `whitelabel-blank`, shared with 6 other nginx sites — see `~/.claude/projects/.../memory/vps-157-shared-box.md`).
