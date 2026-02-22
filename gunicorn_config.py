# Gunicorn configuration for BUAS Production
import os
import multiprocessing

# Server socket
bind = '127.0.0.1:5000'
backlog = 2048

# Worker processes
# Default to a single worker for Socket.IO stability unless explicitly overridden.
workers = int(os.environ.get('GUNICORN_WORKERS', 8))
worker_class = 'eventlet'  # Required for SocketIO
worker_connections = 1000
timeout = 300
keepalive = 2

# Logging
accesslog = '/home/opt/BUAS-Production/logs/gunicorn_access.log'
errorlog = '/home/opt/BUAS-Production/logs/gunicorn_error.log'
loglevel = 'info'
access_log_format = '%(h)s %(l)s %(u)s %(t)s "%(r)s" %(s)s %(b)s "%(f)s" "%(a)s"'

# Process naming
proc_name = 'buas-flask-server'

# Server mechanics
daemon = False
pidfile = None
umask = 0
user = None
group = None
tmp_upload_dir = None

# Environment variables
raw_env = [
    'ENABLE_STREAMING=true',
    'SOCKETIO_MESSAGE_QUEUE_DB=2',
]
