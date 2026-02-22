"""Session a ověření uživatele."""
import base64
import hashlib
import hmac
import json
import os
import secrets
import time

SESSION_SECRET = os.getenv("ADMIN_SESSION_SECRET") or secrets.token_urlsafe(64)
SESSION_TTL_SECONDS = int(os.getenv("ADMIN_SESSION_TTL_SECONDS", str(7 * 24 * 60 * 60)))
COOKIE_NAME = "admin_session"


def _sign(payload: str) -> str:
    return hmac.new(SESSION_SECRET.encode(), payload.encode(), hashlib.sha256).hexdigest()


def create_session(user_id: int, role: str) -> str:
    now = int(time.time())
    payload = json.dumps(
        {
            "user_id": user_id,
            "role": role,
            "iat": now,
            "exp": now + SESSION_TTL_SECONDS,
        },
        separators=(",", ":"),
    )
    encoded = base64.urlsafe_b64encode(payload.encode()).decode().rstrip("=")
    sig = _sign(encoded)
    return f"{encoded}.{sig}"


def decode_session(cookie_value: str | None) -> tuple[int | None, str | None]:
    if not cookie_value or "." not in cookie_value:
        return None, None
    encoded, sig = cookie_value.rsplit(".", 1)
    signed_part = encoded
    padding = 4 - len(encoded) % 4
    if padding != 4:
        encoded += "=" * padding
    try:
        payload = base64.urlsafe_b64decode(encoded).decode()
    except Exception:
        return None, None
    if not hmac.compare_digest(_sign(signed_part), sig):
        return None, None
    try:
        data = json.loads(payload)
        user_id = data.get("user_id")
        role = data.get("role")
        exp = data.get("exp")
        if not isinstance(user_id, int) or not isinstance(role, str):
            return None, None
        if not isinstance(exp, int) or exp < int(time.time()):
            return None, None
        return user_id, role
    except Exception:
        return None, None
