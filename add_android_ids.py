#!/usr/bin/env python3
"""
Add Android IDs to existing devices for testing Android ID routing
"""

from app import create_app
from app.models import db, DeviceLocation, DeviceInfo
import json

def add_android_ids():
    app = create_app()
    
    with app.app_context():
        # Get all unique device IDs from DeviceLocation table
        device_ids = db.session.query(DeviceLocation.device_id).distinct().all()
        device_ids = [d[0] for d in device_ids]
        
        print(f"Found {len(device_ids)} unique devices: {device_ids}")
        
        # Sample Android IDs for testing
        android_ids = [
            "samsung-g998u1-abc123def456",
            "samsung-a525f-def789abc012", 
            "xiaomi-m2101k6g-456789def123"
        ]
        
        # Sample phone numbers and contacts
        sample_data = [
            {
                "phone_numbers": ["+234801234567", "+234701234567"],
                "contacts": [
                    {"name": "John Doe", "phone": "+234801111111"},
                    {"name": "Jane Smith", "phone": "+234802222222"},
                    {"name": "Bob Wilson", "phone": "+234803333333"}
                ]
            },
            {
                "phone_numbers": ["+234802345678", "+234702345678"],
                "contacts": [
                    {"name": "Alice Johnson", "phone": "+234804444444"},
                    {"name": "Charlie Brown", "phone": "+234805555555"},
                    {"name": "Diana Prince", "phone": "+234806666666"}
                ]
            },
            {
                "phone_numbers": ["+234803456789"],
                "contacts": [
                    {"name": "Eve Adams", "phone": "+234807777777"},
                    {"name": "Frank Castle", "phone": "+234808888888"},
                    {"name": "Grace Hopper", "phone": "+234809999999"}
                ]
            }
        ]
        
        for i, device_id in enumerate(device_ids):
            # Check if DeviceInfo already exists
            existing = DeviceInfo.query.filter_by(device_id=device_id).first()
            
            if existing:
                print(f"DeviceInfo already exists for {device_id}, skipping...")
                continue
            
            # Use modulo to cycle through sample data if more devices than samples
            data_index = i % len(sample_data)
            android_id = android_ids[i % len(android_ids)]
            
            device_info = DeviceInfo(
                device_id=device_id,
                android_id=android_id,
                phone_numbers=json.dumps(sample_data[data_index]["phone_numbers"]),
                contacts=json.dumps(sample_data[data_index]["contacts"])
            )
            
            db.session.add(device_info)
            print(f"Added DeviceInfo for {device_id} with Android ID: {android_id}")
        
        db.session.commit()
        print("DeviceInfo records created successfully!")
        
        # Verify the data
        print("\nVerifying DeviceInfo records:")
        all_device_infos = DeviceInfo.query.all()
        for info in all_device_infos:
            print(f"  {info.device_id} -> {info.android_id}")

if __name__ == '__main__':
    add_android_ids()
