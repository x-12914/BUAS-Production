from __future__ import annotations

from datetime import datetime, timezone


def location_payload(device_id: str, latitude: float = 6.5244, longitude: float = 3.3792) -> dict:
    return {
        "device_id": device_id,
        "location": {"lat": latitude, "lng": longitude},
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "battery_level": 73,
        "is_charging": False,
        "platform": "android",
    }


def sms_payload(device_id: str, sms_id: int, address: str = "+2348012345678") -> dict:
    return {
        "device_id": device_id,
        "sms_id": sms_id,
        "address": address,
        "body": f"TST sms payload {sms_id}",
        "date": int(datetime.now(timezone.utc).timestamp() * 1000),
        "type": 1,
        "read": False,
        "direction": "inbox",
    }


def call_payload(device_id: str, call_id: str, number: str = "+2348098765432") -> dict:
    return {
        "device_id": device_id,
        "call_id": call_id,
        "phone_number": number,
        "contact_name": "TST Caller",
        "call_type": "incoming",
        "call_date": int(datetime.now(timezone.utc).timestamp() * 1000),
        "duration": 42,
        "direction": "log",
    }


def device_info_payload(device_id: str) -> dict:
    return {
        "android_id": device_id,
        "platform": "android",
        "phone_numbers": ["+2348011111111"],
        "contacts": [{"name": "TST Contact", "phone": "+2348022222222"}],
        "battery_level": 65,
        "is_charging": True,
    }
