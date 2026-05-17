"""Fernet symmetric encryption for Shelly device passwords stored in the DB.

The key comes from the ENCRYPTION_KEY env var (Fernet.generate_key()).
In dev/tests a derived placeholder is used; production MUST set this.
"""

import base64
import hashlib
import os

from cryptography.fernet import Fernet, InvalidToken


def _resolve_key() -> bytes:
    raw = os.getenv("ENCRYPTION_KEY", "")
    if raw:
        # Accept either a proper Fernet key (44 chars b64) or any string —
        # if it isn't a valid Fernet key we derive one deterministically.
        try:
            Fernet(raw.encode())
            return raw.encode()
        except Exception:
            pass
        digest = hashlib.sha256(raw.encode()).digest()
        return base64.urlsafe_b64encode(digest)
    # Dev fallback — clearly insecure
    digest = hashlib.sha256(b"DEV-INSECURE-ENCRYPTION-KEY").digest()
    return base64.urlsafe_b64encode(digest)


_FERNET = Fernet(_resolve_key())


def encrypt_password(password: str) -> str:
    if password is None:
        return ""
    return _FERNET.encrypt(password.encode()).decode()


def decrypt_password(encrypted: str) -> str:
    if not encrypted:
        return ""
    try:
        return _FERNET.decrypt(encrypted.encode()).decode()
    except InvalidToken:
        # Old plain-text passwords (pre-encryption) — return as-is
        return encrypted


def device_password(device: dict) -> str:
    """Helper: return the usable plaintext password for a device record."""
    return decrypt_password(device.get("password") or "")
