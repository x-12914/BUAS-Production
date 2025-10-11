"""
Device utility functions for Android ID resolution and management
"""
from app.models import DeviceInfo
import re

# Cache for frequently accessed device mappings
_device_cache = {}
_cache_max_size = 100

def resolve_to_device_id(identifier):
    """
    Enhanced: Resolve identifier to device_id with Android ID and display name support
    
    Args:
        identifier: Could be device_id, android_id, display_name, or Android-generated device_id
        
    Returns:
        device_id if found, original identifier if not found
    """
    if not identifier or not isinstance(identifier, str):
        return identifier
    
    # Check cache first for performance
    if identifier in _device_cache:
        return _device_cache[identifier]
    
    try:
        # First, check if this is an Android ID
        device_info = DeviceInfo.query.filter_by(android_id=identifier).first()
        if device_info:
            result = device_info.device_id
            _cache_result(identifier, result)
            return result
        
        # Second, check if this is a display name
        device_info = DeviceInfo.query.filter_by(display_name=identifier).first()
        if device_info:
            result = device_info.device_id
            _cache_result(identifier, result)
            return result
        
        # Third, check if this looks like an Android-generated device ID
        # Android format: ManufacturerModel (e.g., "samsungSM-G998U1")
        # Try to match against existing devices with similar patterns
        if len(identifier) > 5 and any(c.islower() for c in identifier):
            # Look for partial matches in device_id or android_id fields
            devices = DeviceInfo.query.all()
            
            for device in devices:
                # Check if the identifier is a variant of existing device_id
                if (device.device_id and 
                    (identifier.lower() in device.device_id.lower() or 
                     device.device_id.lower() in identifier.lower())):
                    result = device.device_id
                    _cache_result(identifier, result)
                    return result
                
                # Check if it matches android_id pattern
                if (device.android_id and 
                    (identifier.lower() in device.android_id.lower() or 
                     device.android_id.lower() in identifier.lower())):
                    result = device.device_id
                    _cache_result(identifier, result)
                    return result
        
        # Fallback: assume it's already a device_id and verify it exists
        device_info = DeviceInfo.query.filter_by(device_id=identifier).first()
        if device_info:
            _cache_result(identifier, identifier)
            return identifier
        
        # If no DeviceInfo record exists, return original identifier
        # This handles legacy devices that haven't uploaded device info yet
        return identifier
        
    except Exception as e:
        # Handle case where device_info table doesn't exist yet
        if "no such table: device_info" in str(e):
            print(f"Warning: DeviceInfo table doesn't exist yet. Run create_device_info_table.py")
            return identifier
        else:
            print(f"Error resolving identifier {identifier}: {e}")
            return identifier

def get_android_id_for_device(device_id):
    """
    Get Android ID for a given device_id
    
    Args:
        device_id: The device ID
        
    Returns:
        android_id if found, None if not found
    """
    if not device_id or not isinstance(device_id, str):
        return None
        
    try:
        device_info = DeviceInfo.query.filter_by(device_id=device_id).first()
        return device_info.android_id if device_info else None
    except Exception as e:
        # Handle case where device_info table doesn't exist yet
        if "no such table: device_info" in str(e):
            print(f"Warning: DeviceInfo table doesn't exist yet. Run create_device_info_table.py")
            return None
        else:
            print(f"Error getting Android ID for device {device_id}: {e}")
            return None

def validate_identifier_format(identifier):
    """
    Validate if identifier looks like a valid device_id or android_id
    
    Args:
        identifier: The identifier to validate
        
    Returns:
        True if valid format, False otherwise
    """
    if not identifier or not isinstance(identifier, str):
        return False
    
    # Check length limits (device_id max 100, android_id max 200)
    if len(identifier) > 200:
        return False
    
    # Allow alphanumeric, hyphens, underscores, and dots
    # This covers both device_id formats and Android ID formats
    return bool(re.match(r'^[a-zA-Z0-9._-]+$', identifier))

def is_android_id_format(identifier):
    """
    Heuristic to determine if identifier looks like an Android ID
    
    Args:
        identifier: The identifier to check
        
    Returns:
        True if likely an Android ID, False otherwise
    """
    if not identifier or not isinstance(identifier, str):
        return False
    
    # Android IDs are typically longer and contain specific patterns
    # Common patterns: samsung-model-hash, brand-model-serial, etc.
    android_patterns = [
        r'samsung-[a-z0-9]+-[a-f0-9]+',
        r'xiaomi-[a-z0-9]+-[a-f0-9]+',
        r'[a-z]+-[a-z0-9]+-[a-f0-9]{6,}',
        r'.*-.*-[a-f0-9]{8,}'
    ]
    
    for pattern in android_patterns:
        if re.match(pattern, identifier.lower()):
            return True
    
    return len(identifier) > 20  # Fallback: longer identifiers are likely Android IDs

def get_device_mapping_stats():
    """
    Get statistics about device ID mappings for debugging
    
    Returns:
        dict with mapping statistics
    """
    try:
        total_devices = DeviceInfo.query.count()
        devices_with_android_id = DeviceInfo.query.filter(DeviceInfo.android_id.isnot(None)).count()
        
        return {
            'total_devices': total_devices,
            'devices_with_android_id': devices_with_android_id,
            'coverage_percentage': round((devices_with_android_id / total_devices * 100), 2) if total_devices > 0 else 0,
            'cache_size': len(_device_cache)
        }
    except Exception as e:
        if "no such table: device_info" in str(e):
            return {
                'error': 'DeviceInfo table not created yet. Run create_device_info_table.py',
                'cache_size': len(_device_cache)
            }
        else:
            return {'error': str(e)}

def _cache_result(identifier, device_id):
    """
    Cache a resolution result for performance
    
    Args:
        identifier: The input identifier
        device_id: The resolved device_id
    """
    global _device_cache
    
    # Simple cache size management
    if len(_device_cache) >= _cache_max_size:
        # Remove oldest entries (simple FIFO)
        keys_to_remove = list(_device_cache.keys())[:10]
        for key in keys_to_remove:
            del _device_cache[key]
    
    _device_cache[identifier] = device_id

def clear_device_cache():
    """Clear the device resolution cache"""
    global _device_cache
    _device_cache = {}