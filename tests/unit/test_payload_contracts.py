from tests.helpers.payloads import call_payload, location_payload, sms_payload


def test_location_payload_contract():
    payload = location_payload("TST_DEVICE")
    assert payload["device_id"] == "TST_DEVICE"
    assert "location" in payload
    assert "lat" in payload["location"]
    assert "lng" in payload["location"]


def test_sms_payload_contract():
    payload = sms_payload("TST_DEVICE", sms_id=123456)
    assert payload["device_id"] == "TST_DEVICE"
    assert payload["sms_id"] == 123456
    assert payload["direction"] == "inbox"


def test_call_payload_contract():
    payload = call_payload("TST_DEVICE", call_id="987654")
    assert payload["device_id"] == "TST_DEVICE"
    assert payload["call_id"] == "987654"
    assert payload["call_type"] in {"incoming", "outgoing", "missed", "unknown"}
