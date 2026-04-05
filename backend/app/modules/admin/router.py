"""Admin přihlášení – email + heslo, role-based auth."""
import hmac
import hashlib
import os
import re
import secrets
import time
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, Response, Cookie, HTTPException, UploadFile, Request
from PIL import Image, UnidentifiedImageError
import pillow_heif
from pydantic import BaseModel
from passlib.context import CryptContext
from sqlalchemy.orm import Session

from backend.app.db import get_db, init_db
from backend.app.modules.admin.email_service import is_email_configured, send_recovery_email
from backend.app.modules.auth.models import User
from backend.app.modules.auth.service import COOKIE_NAME, create_session, decode_session

pillow_heif.register_heif_opener()

pwd_context = CryptContext(schemes=["bcrypt", "pbkdf2_sha256"], deprecated="auto")
router = APIRouter()

ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "admin123")
ADMIN_EMAIL = os.getenv("ADMIN_EMAIL", "lakodi@seznam.cz")
ADMIN_RECOVERY_TOKEN = os.getenv("ADMIN_RECOVERY_TOKEN", "")
ADMIN_RECOVERY_EMAILS = [
    e.strip().lower()
    for e in os.getenv("ADMIN_RECOVERY_EMAILS", "").split(",")
    if e.strip()
]
SECRET_SALT = "lakodi-admin-auth"
TOKEN_TTL_SEC = 3600

_pending_recovery: dict[str, tuple[str, float]] = {}
_pending_login_challenges: dict[str, tuple[str, float]] = {}
LOGIN_CHALLENGE_TTL_SEC = 180


def _slug(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def _make_legacy_token() -> str:
    return hmac.new(
        ADMIN_PASSWORD.encode(),
        SECRET_SALT.encode(),
        hashlib.sha256,
    ).hexdigest()


def _seed_admin(*, sync_password: bool = True):
    """Zajistí, že admin z env vždy existuje a při startupu lze synchronizovat heslo z env."""
    from backend.app.db import SessionLocal
    db = SessionLocal()
    try:
        email = ADMIN_EMAIL.strip().lower()
        u = db.query(User).filter(User.email == email).first()
        if u:
            changed = False
            if u.role != "admin":
                u.role = "admin"
                changed = True
            if sync_password:
                password_matches = False
                if u.password_hash:
                    try:
                        password_matches = pwd_context.verify(ADMIN_PASSWORD, u.password_hash)
                    except Exception:
                        password_matches = False
                if not password_matches:
                    u.password_hash = pwd_context.hash(ADMIN_PASSWORD)
                    changed = True
            if changed:
                db.commit()
        elif db.query(User).count() == 0:
            u = User(
                email=email,
                password_hash=pwd_context.hash(ADMIN_PASSWORD),
                role="admin",
            )
            db.add(u)
            db.commit()
        else:
            u = User(
                email=email,
                password_hash=pwd_context.hash(ADMIN_PASSWORD),
                role="admin",
            )
            db.add(u)
            db.commit()
    finally:
        db.close()


class LoginRequest(BaseModel):
    email: str
    password: str | None = None
    challenge_id: str | None = None
    password_proof: str | None = None


class RequestRecoveryRequest(BaseModel):
    email: str


class ResetRecoveryPasswordRequest(BaseModel):
    token: str
    password: str


def _prune_expired():
    now = time.time()
    expired = [t for t, (_, ex) in _pending_recovery.items() if ex < now]
    for t in expired:
        del _pending_recovery[t]


def _prune_login_challenges():
    now = time.time()
    expired = [token for token, (_, ex) in _pending_login_challenges.items() if ex < now]
    for token in expired:
        del _pending_login_challenges[token]


def _build_login_proof(password: str, nonce: str) -> str:
    return hashlib.sha256(f"{password}:{nonce}".encode("utf-8")).hexdigest()


def _get_admin_user(db: Session):
    return db.query(User).filter(User.role == "admin").first()


def _consume_recovery_email(token: str, db: Session) -> str | None:
    _prune_expired()
    if ADMIN_RECOVERY_TOKEN and hmac.compare_digest(token, ADMIN_RECOVERY_TOKEN):
        admin = _get_admin_user(db)
        return admin.email if admin else None
    data = _pending_recovery.pop(token, None)
    if data:
        return data[0]
    return None


def _is_secure_request(request: Request) -> bool:
    x_forwarded_proto = request.headers.get("x-forwarded-proto", "")
    if x_forwarded_proto:
        return x_forwarded_proto.split(",")[0].strip().lower() == "https"
    return request.url.scheme == "https"


def _cookie_secure_flag(request: Request) -> bool:
    raw = os.getenv("ADMIN_COOKIE_SECURE", "auto").strip().lower()
    if raw in {"1", "true", "yes", "on"}:
        return True
    if raw in {"0", "false", "no", "off"}:
        return False
    return _is_secure_request(request)


def _set_auth_cookie(response: Response, token: str, request: Request):
    response.set_cookie(
        key=COOKIE_NAME,
        value=token,
        httponly=True,
        secure=_cookie_secure_flag(request),
        samesite="strict",
        max_age=86400 * 7,
        path="/",
    )


@router.get("/login-challenge")
def admin_login_challenge(response: Response):
    _prune_login_challenges()
    challenge_id = secrets.token_urlsafe(16)
    nonce = secrets.token_urlsafe(32)
    _pending_login_challenges[challenge_id] = (nonce, time.time() + LOGIN_CHALLENGE_TTL_SEC)
    response.headers["Cache-Control"] = "no-store"
    return {"challenge_id": challenge_id, "nonce": nonce}


@router.post("/login")
def admin_login(body: LoginRequest, response: Response, request: Request, db: Session = Depends(get_db)):
    """Ověří email + heslo a nastaví session cookie s rolí."""
    try:
        _seed_admin(sync_password=False)
    except Exception:
        pass
    u = db.query(User).filter(User.email == body.email.strip().lower()).first()
    if not u:
        raise HTTPException(status_code=401, detail="Nesprávný email nebo heslo")

    password_ok = False
    if body.password is not None:
        password_ok = pwd_context.verify(body.password, u.password_hash)
    elif body.challenge_id and body.password_proof:
        _prune_login_challenges()
        challenge = _pending_login_challenges.pop(body.challenge_id, None)
        if challenge:
            nonce, _ = challenge
            expected = _build_login_proof(ADMIN_PASSWORD, nonce)
            password_ok = hmac.compare_digest(body.password_proof.lower(), expected)

    if not password_ok:
        raise HTTPException(status_code=401, detail="Nesprávný email nebo heslo")

    if u.role != "admin":
        raise HTTPException(status_code=403, detail="Přístup odepřen")
    token = create_session(u.id, u.role)
    _set_auth_cookie(response, token, request)
    return {"ok": True, "role": u.role}


@router.post("/request-recovery")
def admin_request_recovery(body: RequestRecoveryRequest):
    if not is_email_configured():
        raise HTTPException(
            status_code=503,
            detail="Email recovery není nakonfigurován (RESEND_API_KEY nebo SMTP)",
        )
    if not ADMIN_RECOVERY_EMAILS:
        raise HTTPException(
            status_code=503,
            detail="ADMIN_RECOVERY_EMAILS není nastaven",
        )
    email = body.email.strip().lower()
    if email not in ADMIN_RECOVERY_EMAILS:
        return {"ok": True, "message": "Pokud je email zaregistrován, dostanete odkaz."}
    _prune_expired()
    token = secrets.token_urlsafe(32)
    _pending_recovery[token] = (email, time.time() + TOKEN_TTL_SEC)
    if send_recovery_email(email, token):
        return {"ok": True, "message": "Pokud je email zaregistrován, dostanete odkaz."}
    raise HTTPException(status_code=500, detail="Nepodařilo se odeslat email")


@router.get("/recover")
def admin_recover(token: str, response: Response, request: Request, db: Session = Depends(get_db)):
    _seed_admin(sync_password=False)
    email = _consume_recovery_email(token, db)
    if email:
        u = db.query(User).filter(User.email == email).first()
        if u and u.role == "admin":
            sess = create_session(u.id, u.role)
            _set_auth_cookie(response, sess, request)
            return {"ok": True, "message": "Přihlášení přes recovery úspěšné"}
    raise HTTPException(status_code=401, detail="Neplatný nebo expirovaný recovery token")


@router.post("/recover/reset")
def admin_recover_reset(body: ResetRecoveryPasswordRequest, db: Session = Depends(get_db)):
    _seed_admin(sync_password=False)
    token = body.token.strip()
    password = body.password.strip()
    if not token:
        raise HTTPException(status_code=400, detail="Neplatný token")
    if len(password) < 8:
        raise HTTPException(status_code=400, detail="Heslo musí mít alespoň 8 znaků")

    email = _consume_recovery_email(token, db)
    if not email:
        raise HTTPException(status_code=401, detail="Neplatný nebo expirovaný recovery token")

    user = db.query(User).filter(User.email == email).first()
    if not user or user.role != "admin":
        raise HTTPException(status_code=401, detail="Neplatný nebo expirovaný recovery token")

    user.password_hash = pwd_context.hash(password)
    db.commit()
    return {"ok": True, "message": "Heslo bylo úspěšně změněno"}


@router.post("/logout")
def admin_logout(response: Response):
    response.delete_cookie(COOKIE_NAME, path="/")
    return {"ok": True}


@router.get("/check")
def admin_check(admin_session: str | None = Cookie(None)):
    """Vrací authenticated a role."""
    try:
        user_id, role = decode_session(admin_session)
        return {"authenticated": user_id is not None and role is not None, "role": role or None}
    except Exception:
        return {"authenticated": False, "role": None}


def require_admin(admin_session: str | None = Cookie(None)):
    """Dependency – vyžaduje přihlášeného admina (role=admin)."""
    user_id, role = decode_session(admin_session)
    if user_id is None or role != "admin":
        raise HTTPException(status_code=401, detail="Přihlaste se do adminu")


UPLOAD_DIR = Path(os.getenv("UPLOAD_DIR", "./data/uploads"))
MAX_MEDIA_BYTES = 1024 * 1024 * 1024  # 1 GB
MAX_IMAGE_EDGE = 1920


def _ensure_upload_dir():
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


def _save_upload_with_limit(file: UploadFile, path: Path) -> None:
    total = 0
    chunk_size = 1024 * 1024
    with path.open("wb") as out:
        while True:
            chunk = file.file.read(chunk_size)
            if not chunk:
                break
            total += len(chunk)
            if total > MAX_MEDIA_BYTES:
                out.close()
                if path.exists():
                    path.unlink()
                raise HTTPException(status_code=413, detail="Soubor je větší než 1 GB")
            out.write(chunk)


def _optimize_saved_image(path: Path) -> Path:
    try:
        with Image.open(path) as image:
            if image.width > MAX_IMAGE_EDGE or image.height > MAX_IMAGE_EDGE:
                image.thumbnail((MAX_IMAGE_EDGE, MAX_IMAGE_EDGE), Image.Resampling.LANCZOS)
            if image.mode not in ("RGB", "RGBA"):
                image = image.convert("RGBA" if "A" in image.getbands() else "RGB")
            optimized_path = path.with_suffix(".webp")
            image.save(optimized_path, format="WEBP", quality=82, method=6)
        if optimized_path != path and path.exists():
            path.unlink()
        return optimized_path
    except (UnidentifiedImageError, OSError):
        return path


@router.post("/upload")
def admin_upload(
    files: list[UploadFile] = File(...),
    _: None = Depends(require_admin),
):
    """Upload fotek do celého webu (ukládá do data/uploads)."""
    _ensure_upload_dir()
    result: list[str] = []
    for f in files:
        if f.filename:
            ext = Path(f.filename).suffix or ".jpg"
            safe_name = f"{uuid.uuid4().hex}{ext}"
            path = UPLOAD_DIR / safe_name
            _save_upload_with_limit(f, path)
            optimized_path = _optimize_saved_image(path)
            result.append(optimized_path.name)
    return {"filenames": result}
