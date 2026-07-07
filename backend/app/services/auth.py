import hmac
import hashlib
import json
import base64
import time
import secrets
import os

SECRET_KEY = os.environ.get("AUTH_SECRET_KEY", "shorts100_download_secret_key_change_me_in_prod_12345").encode("utf-8")

def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    key = hashlib.pbkdf2_hmac(
        'sha256', 
        password.encode('utf-8'), 
        salt.encode('utf-8'), 
        100000
    )
    return f"{salt}:{key.hex()}"

def verify_password(password: str, hashed_password: str) -> bool:
    try:
        salt, key_hex = hashed_password.split(":")
        expected_key = hashlib.pbkdf2_hmac(
            'sha256', 
            password.encode('utf-8'), 
            salt.encode('utf-8'), 
            100000
        )
        return secrets.compare_digest(expected_key, bytes.fromhex(key_hex))
    except Exception:
        return False

def generate_token(payload: dict, expires_in: int = 86400 * 30) -> str:
    payload_copy = payload.copy()
    payload_copy["exp"] = int(time.time()) + expires_in
    payload_json = json.dumps(payload_copy).encode("utf-8")
    payload_b64 = base64.urlsafe_b64encode(payload_json).decode("utf-8")
    
    signature = hmac.new(SECRET_KEY, payload_json, hashlib.sha256).digest()
    sig_b64 = base64.urlsafe_b64encode(signature).decode("utf-8")
    
    return f"{payload_b64}.{sig_b64}"

def verify_token(token: str) -> dict | None:
    try:
        parts = token.split(".")
        if len(parts) != 2:
            return None
        payload_b64, sig_b64 = parts
        
        # Base64 padding correction
        payload_json = base64.urlsafe_b64decode(payload_b64.encode("utf-8") + b'===')
        expected_sig = hmac.new(SECRET_KEY, payload_json, hashlib.sha256).digest()
        actual_sig = base64.urlsafe_b64decode(sig_b64.encode("utf-8") + b'===')
        
        if not hmac.compare_digest(expected_sig, actual_sig):
            return None
            
        payload = json.loads(payload_json.decode("utf-8"))
        if payload.get("exp", 0) < time.time():
            return None
            
        return payload
    except Exception:
        return None
