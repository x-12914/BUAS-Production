from app import create_app
from app.models import (
    db, Upload, DeviceLocation, RecordingEvent, DeviceCommand, DeviceInfo,
    # RBAC Models
    Agency, User, DeviceAssignment, UserSession, AuditLog, PasswordHistory
)

app = create_app()

with app.app_context():
    db.create_all()
    print("Database tables created successfully.")
    print("=" * 50)
    print("📋 Core Tables:")
    print("- Upload (existing)")
    print("- DeviceLocation (location updates)")
    print("- RecordingEvent (recording start/stop events)")
    print("- DeviceCommand (device commands)")
    print("- DeviceInfo (device information)")
    print("\n🔐 RBAC Tables:")
    print("- Agency (agency management)")
    print("- User (user authentication)")
    print("- DeviceAssignment (analyst device assignments)")
    print("- UserSession (session management)")
    print("- AuditLog (comprehensive audit logging)")
    print("- PasswordHistory (password reuse prevention)")
    print("=" * 50)
    print("✅ Database initialization complete!")
    print("🔄 Next: Run create_initial_admin.py to create first user")
