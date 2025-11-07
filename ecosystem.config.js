module.exports = {
  apps: [{
    name: 'flask-server',
    script: '/home/opt/venv/bin/gunicorn',
    args: '-c gunicorn_config.py server:app',
    cwd: '/home/opt/BUAS-Production',
    interpreter: 'none',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      ENABLE_STREAMING: 'true',
      FLASK_ENV: 'production',
      SOCKETIO_MESSAGE_QUEUE_DB: '2',
      GUNICORN_WORKERS: '1',
      PYTHONPATH: '/home/opt/BUAS-Production',
      PATH: '/home/opt/venv/bin:' + process.env.PATH
    },
    error_file: '/home/opt/BUAS-Production/logs/pm2_error.log',
    out_file: '/home/opt/BUAS-Production/logs/pm2_out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    time: true
  }]
};
