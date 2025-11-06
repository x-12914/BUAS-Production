# BUAS Frontend Dashboard

## 🎧 React Dashboard for Briech UAS System

This is the React frontend for the BUAS (Briech UAS) dashboard, providing real-time monitoring of connected devices and audio recordings.

## ✨ Features

- **Real-time Updates**: Auto-refreshing dashboard every 2 seconds
- **Device Management**: Monitor multiple surveillance devices
- **Audio Playback**: Play and download recorded audio files
- **Dark Theme**: Optimized for low-light monitoring environments
- **Responsive Design**: Works on desktop, tablet, and mobile
- **Error Recovery**: Graceful handling of connection issues

## 🚀 Quick Start

### Development Setup

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Start Development Server**
   ```bash
   npm start
   ```
   The app will open at `http://localhost:4000`

3. **Ensure Backend is Running**
   Make sure your Flask backend is running on `http://localhost:5000`

### Production Deployment

1. **Build for Production**
   ```bash
   npm run build
   ```

2. **Deploy to VPS**
   Copy the `build` folder to your VPS and serve with nginx or similar.

## 🔧 Configuration

### Environment Variables

Create a `.env.local` file for development:
```bash
REACT_APP_API_URL=http://localhost:5000
REACT_APP_AUTH_USERNAME=admin
REACT_APP_AUTH_PASSWORD=supersecret
PORT=4000
```

For production, the app automatically uses:
```bash
REACT_APP_API_URL=http://105.114.25.157
```

### API Endpoints Used

- `GET /api/dashboard-data` - Main dashboard data
- `GET /api/health` - Health check
- `POST /api/start-listening/{user_id}` - Start device monitoring
- `POST /api/stop-listening/{user_id}` - Stop device monitoring
- `GET /api/uploads/{filename}` - Audio file download

## 📱 Components

### Main Components
- **Dashboard**: Main controller with real-time polling
- **StatusBar**: Connection status and stats
- **UserList**: Device list with search and filtering
- **AudioPlayer**: Overlay audio player
- **ConnectionStatus**: Connection health indicator

### Features
- **Auto-refresh**: Configurable polling (default: 2 seconds)
- **Search & Filter**: Find devices by ID or status
- **Audio Control**: Play, pause, seek, volume control
- **Error Boundaries**: Crash protection and recovery

## 🔒 Security

- Basic authentication with configurable credentials
- CORS handling for cross-origin requests
- Environment-based configuration
- No sensitive data in client-side code

## 🌐 Browser Compatibility

- Chrome 88+
- Firefox 85+
- Safari 14+
- Edge 88+

## 📊 Performance

- Lightweight bundle (~2MB gzipped)
- Efficient polling with error backoff
- CSS variables for theming
- Responsive images and layouts

## 🐛 Troubleshooting

### Common Issues

1. **"Connection Error" Status**
   - Check if Flask backend is running
   - Verify API URL in environment variables
   - Check CORS configuration

2. **Audio Won't Play**
   - Ensure browser allows audio autoplay
   - Check audio file URL accessibility
   - Verify file format support

3. **Real-time Updates Not Working**
   - Check browser console for errors
   - Verify dashboard data endpoint
   - Check network connectivity

### Debug Mode

Set `NODE_ENV=development` to see detailed error messages and logs.

## 🚀 Deployment Guide

### VPS Deployment

1. **Build the app**
   ```bash
   npm run build
   ```

2. **Copy to VPS**
   ```bash
   scp -r build/ user@105.114.25.157:/var/www/buas-dashboard/
   ```

3. **Configure Nginx**
   ```nginx
   server {
       listen 3000;
       server_name 105.114.25.157;
       root /var/www/buas-dashboard;
       index index.html;
       
       location / {
           try_files $uri $uri/ /index.html;
       }
       
       location /api {
           proxy_pass http://localhost:5000;
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
       }
   }
   ```

## 📈 Monitoring

The dashboard includes built-in monitoring:
- Connection status indicators
- Last update timestamps
- Error logging and display
- Performance metrics

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📄 License

This project is part of the BUAS system for academic research purposes.
