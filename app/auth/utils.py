"""
Authentication Utility Functions
Following BUAS_RBAC_IMPLEMENTATION_GUIDE.md
"""

import secrets
import string
import re
from datetime import datetime, timedelta

def generate_temp_password(length=16):
    """Generate secure temporary password"""
    alphabet = string.ascii_letters + string.digits + "!@#$%^&*"
    while True:
        password = ''.join(secrets.choice(alphabet) for _ in range(length))
        # Ensure password meets requirements
        if (any(c.islower() for c in password) and
            any(c.isupper() for c in password) and
            any(c.isdigit() for c in password) and
            any(c in "!@#$%^&*" for c in password)):
            return password

def validate_password_strength(password, username=None):
    """Validate password meets requirements"""
    errors = []
    
    if len(password) < 12:
        errors.append("Password must be at least 12 characters")
    
    if not any(c.isupper() for c in password):
        errors.append("Password must contain uppercase letter")
    
    if not any(c.islower() for c in password):
        errors.append("Password must contain lowercase letter")
    
    if not any(c.isdigit() for c in password):
        errors.append("Password must contain number")
    
    if not any(c in "!@#$%^&*()_+-=[]{}|;:,.<>?" for c in password):
        errors.append("Password must contain special character")
    
    if username and username.lower() in password.lower():
        errors.append("Password cannot contain username")
    
    # Check for common patterns
    if re.search(r'(.)\1{2,}', password):
        errors.append("Password cannot contain 3+ consecutive identical characters")
    
    if re.search(r'(012|123|234|345|456|567|678|789|890)', password):
        errors.append("Password cannot contain sequential numbers")
    
    if re.search(r'(abc|bcd|cde|def|efg|fgh|ghi|hij|ijk|jkl|klm|lmn|mno|nop|opq|pqr|qrs|rst|stu|tuv|uvw|vwx|wxy|xyz)', password.lower()):
        errors.append("Password cannot contain sequential letters")
    
    # Common weak passwords
    weak_patterns = [
        'password', 'admin', 'login', 'user', 'test', 'guest', 
        'root', 'master', 'system', 'manager', 'buas'
    ]
    
    for pattern in weak_patterns:
        if pattern.lower() in password.lower():
            errors.append(f"Password cannot contain common word: {pattern}")
    
    if errors:
        return False, "; ".join(errors)
    
    return True, "Password is strong"

def validate_username(username):
    """Validate username format"""
    if not username:
        return False, "Username is required"
    
    if len(username) < 3:
        return False, "Username must be at least 3 characters"
    
    if len(username) > 50:
        return False, "Username cannot exceed 50 characters"
    
    # Allow letters, numbers, underscore, hyphen, period
    if not re.match(r'^[a-zA-Z0-9._-]+$', username):
        return False, "Username can only contain letters, numbers, period, underscore, and hyphen"
    
    # Must start with letter or number
    if not re.match(r'^[a-zA-Z0-9]', username):
        return False, "Username must start with a letter or number"
    
    # Cannot end with special characters
    if username.endswith(('.', '_', '-')):
        return False, "Username cannot end with special characters"
    
    # Reserved usernames
    reserved = [
        'admin', 'administrator', 'root', 'system', 'api', 'www', 
        'mail', 'email', 'support', 'help', 'info', 'contact',
        'user', 'guest', 'test', 'demo', 'null', 'undefined'
    ]
    
    if username.lower() in reserved:
        return False, f"Username '{username}' is reserved"
    
    return True, "Username is valid"

def get_password_policy():
    """Get password policy for display to users"""
    return {
        'min_length': 12,
        'require_uppercase': True,
        'require_lowercase': True,
        'require_numbers': True,
        'require_special': True,
        'max_age_days': 90,
        'history_count': 5,
        'max_failed_attempts': 5,
        'lockout_duration_minutes': 30,
        'allowed_special_chars': '!@#$%^&*()_+-=[]{}|;:,.<>?',
        'forbidden_patterns': [
            'Sequential numbers (123, 456, etc.)',
            'Sequential letters (abc, def, etc.)',
            'Repeated characters (aaa, 111, etc.)',
            'Common words (password, admin, etc.)',
            'Username in password'
        ]
    }

def calculate_password_strength_score(password):
    """Calculate password strength score (0-100)"""
    score = 0
    
    # Length bonus
    if len(password) >= 12:
        score += 20
    elif len(password) >= 8:
        score += 10
    
    # Character variety
    if any(c.islower() for c in password):
        score += 15
    if any(c.isupper() for c in password):
        score += 15
    if any(c.isdigit() for c in password):
        score += 15
    if any(c in "!@#$%^&*()_+-=[]{}|;:,.<>?" for c in password):
        score += 15
    
    # Length bonus for very long passwords
    if len(password) >= 16:
        score += 10
    elif len(password) >= 20:
        score += 20
    
    # Deduct points for common patterns
    if re.search(r'(.)\1{2,}', password):
        score -= 15
    
    if re.search(r'(012|123|234|345|456|567|678|789|890)', password):
        score -= 20
    
    common_words = ['password', 'admin', 'login', 'user', 'test']
    for word in common_words:
        if word.lower() in password.lower():
            score -= 25
    
    return min(100, max(0, score))

def format_password_requirements():
    """Format password requirements for user display"""
    policy = get_password_policy()
    
    requirements = [
        f"At least {policy['min_length']} characters long",
        "Contains uppercase letters (A-Z)",
        "Contains lowercase letters (a-z)",
        "Contains numbers (0-9)",
        f"Contains special characters ({policy['allowed_special_chars']})",
        "Does not contain your username",
        "Does not contain common words (password, admin, etc.)",
        "Does not contain sequential characters (123, abc, etc.)",
        "Does not contain repeated characters (aaa, 111, etc.)"
    ]
    
    return requirements
