from datetime import datetime, timedelta, timezone
from uuid import UUID

import bcrypt
import jwt
from fastapi import Request, Response
from jwt.exceptions import InvalidTokenError

from app.config import SESSION_COOKIE, SESSION_MAX_AGE_SECONDS, SESSION_SECRET


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt(rounds=12)).decode("ascii")


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("ascii"))
    except (ValueError, UnicodeEncodeError):
        return False


def create_session(response: Response, user_id: UUID, secure: bool) -> None:
    token = jwt.encode(
        {
            "sub": str(user_id),
            "iat": datetime.now(timezone.utc),
            "exp": datetime.now(timezone.utc) + timedelta(seconds=SESSION_MAX_AGE_SECONDS),
        },
        SESSION_SECRET,
        algorithm="HS256",
    )
    response.set_cookie(
        SESSION_COOKIE,
        token,
        max_age=SESSION_MAX_AGE_SECONDS,
        httponly=True,
        secure=secure,
        samesite="lax",
        path="/",
    )


def read_session_user_id(request: Request) -> UUID | None:
    token = request.cookies.get(SESSION_COOKIE)
    if not token:
        return None
    try:
        payload = jwt.decode(token, SESSION_SECRET, algorithms=["HS256"])
        subject = payload.get("sub")
        return UUID(subject) if isinstance(subject, str) else None
    except (InvalidTokenError, ValueError):
        return None


def clear_session(response: Response, secure: bool) -> None:
    response.delete_cookie(
        SESSION_COOKIE,
        httponly=True,
        secure=secure,
        samesite="lax",
        path="/",
    )
