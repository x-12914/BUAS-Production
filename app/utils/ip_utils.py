"""
IP Detection Utilities
Provides enhanced IP address detection for audit logging and security.
"""

from flask import request

def get_client_ip(request_obj=None):
    """
    Enhanced IP detection that handles proxies, load balancers, and CDNs.
    
    Args:
        request_obj: Flask request object (defaults to current request)
    
    Returns:
        str: Client IP address
    """
    if request_obj is None:
        request_obj = request
    
    # Priority order of headers to check
    proxy_headers = [
        'CF-Connecting-IP',      # Cloudflare
        'True-Client-IP',        # Cloudflare Enterprise / Akamai
        'X-Real-IP',            # Nginx proxy_pass
        'X-Forwarded-For',      # Standard proxy header (RFC 7239)
        'X-Client-IP',          # Some Apache configurations
        'X-Forwarded',          # Less common
        'X-Cluster-Client-IP',  # Some load balancers
        'Forwarded-For',        # Older standard
        'Forwarded'             # RFC 7239 standard
    ]
    
    for header in proxy_headers:
        value = request_obj.headers.get(header)
        if value:
            # Handle comma-separated list (X-Forwarded-For can have multiple IPs)
            if ',' in value:
                # Take the first (leftmost) IP which is the original client
                ip = value.split(',')[0].strip()
            else:
                ip = value.strip()
            
            # Basic validation
            if ip and ip.lower() not in ['unknown', 'localhost', ''] and '.' in ip:
                return ip
    
    # Fallback to Flask's default detection
    return request_obj.remote_addr or 'unknown'

def is_local_ip(ip):
    """
    Check if an IP address is from a local/private network.
    
    Args:
        ip (str): IP address to check
    
    Returns:
        bool: True if IP is local/private
    """
    if not ip or ip == 'unknown':
        return True
    
    # Common local/private IP ranges
    local_patterns = [
        '127.',          # Loopback
        '10.',           # Private Class A
        '192.168.',      # Private Class C
        '172.16.',       # Private Class B start
        '172.17.',       # Private Class B
        '172.18.',       # Private Class B
        '172.19.',       # Private Class B
        '172.20.',       # Private Class B
        '172.21.',       # Private Class B
        '172.22.',       # Private Class B
        '172.23.',       # Private Class B
        '172.24.',       # Private Class B
        '172.25.',       # Private Class B
        '172.26.',       # Private Class B
        '172.27.',       # Private Class B
        '172.28.',       # Private Class B
        '172.29.',       # Private Class B
        '172.30.',       # Private Class B
        '172.31.',       # Private Class B end
        '169.254.',      # Link-local
        '::1',           # IPv6 loopback
        'fe80:',         # IPv6 link-local
        'fc00:',         # IPv6 unique local
        'fd00:',         # IPv6 unique local
    ]
    
    return any(ip.startswith(pattern) for pattern in local_patterns)

def get_ip_info(request_obj=None):
    """
    Get comprehensive IP information for debugging.
    
    Args:
        request_obj: Flask request object (defaults to current request)
    
    Returns:
        dict: IP information including detection method
    """
    if request_obj is None:
        request_obj = request
    
    detected_ip = get_client_ip(request_obj)
    
    return {
        'ip': detected_ip,
        'is_local': is_local_ip(detected_ip),
        'detection_method': _get_detection_method(request_obj, detected_ip),
        'all_headers': {
            'CF-Connecting-IP': request_obj.headers.get('CF-Connecting-IP'),
            'True-Client-IP': request_obj.headers.get('True-Client-IP'),
            'X-Real-IP': request_obj.headers.get('X-Real-IP'),
            'X-Forwarded-For': request_obj.headers.get('X-Forwarded-For'),
            'X-Client-IP': request_obj.headers.get('X-Client-IP'),
        },
        'flask_remote_addr': request_obj.remote_addr
    }

def _get_detection_method(request_obj, detected_ip):
    """Helper to determine which method was used to detect the IP"""
    if detected_ip == request_obj.remote_addr:
        return 'request.remote_addr'
    
    # Check which header provided the IP
    headers_to_check = [
        ('CF-Connecting-IP', 'Cloudflare'),
        ('True-Client-IP', 'Cloudflare Enterprise'),
        ('X-Real-IP', 'Nginx'),
        ('X-Forwarded-For', 'Proxy'),
        ('X-Client-IP', 'Apache'),
    ]
    
    for header, method in headers_to_check:
        value = request_obj.headers.get(header)
        if value:
            ip = value.split(',')[0].strip() if ',' in value else value.strip()
            if ip == detected_ip:
                return f'{method} ({header})'
    
    return 'unknown'