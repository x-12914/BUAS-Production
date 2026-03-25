const path = require('path');

module.exports = {
  apps: [
    {
      name: 'flask-server',
      script: 'server.py',
      interpreter: 'python', // Use the Python in your PATH or virtual env
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        ENABLE_STREAMING: 'true',
        DEVICE_SOCKET_TOKEN_MODE: 'strict',
        FLASK_ENV: 'production',
        SOCKETIO_MESSAGE_QUEUE_DB: '2',
        PYTHONPATH: __dirname,
      },
      error_file: './logs/flask_error.log',
      out_file: './logs/flask_out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      time: true
    },
    {
      name: 'frontend-server',
      script: 'serve',
      env: {
        PM2_SERVE_PATH: './frontend/build',
        PM2_SERVE_PORT: 3000,
        PM2_SERVE_SPA: 'true',
        PM2_SERVE_HOMEPAGE: '/index.html'
      }
    }
  ]
};
