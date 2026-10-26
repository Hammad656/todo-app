import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[1] / ".env")


def required_setting(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise RuntimeError(f"{name} must be set in backend/.env.")
    return value


DATABASE_URL = required_setting("DATABASE_URL")
SESSION_SECRET = required_setting("SESSION_SECRET")
if len(SESSION_SECRET.encode("utf-8")) < 32:
    raise RuntimeError("SESSION_SECRET must contain at least 32 characters.")

FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000").rstrip("/")
DATABASE_SSL = os.getenv("DATABASE_SSL", "false").lower() == "true"
SESSION_COOKIE = "todo_session"
SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7
PORT = int(os.getenv("PORT", "4000"))
