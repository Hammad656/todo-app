import asyncio
import os
from uuid import UUID

os.environ["DATABASE_URL"] = "sqlite://"
os.environ["SESSION_SECRET"] = "test-only-session-secret-with-more-than-32-bytes"
os.environ["FRONTEND_URL"] = "http://localhost:3000"

from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

from app.database import Base, SessionLocal, engine
from app.main import app
from app.models import TodoAuditEvent, User


def test_auth_and_todo_crud_are_persisted_and_audited() -> None:
    Base.metadata.drop_all(bind=engine)

    async def exercise_api() -> None:
        async with app.router.lifespan_context(app):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                signup = await client.post(
                    "/api/auth/signup",
                    json={"email": "  person@example.com ", "password": "a-strong-password"},
                    headers={"Origin": "http://localhost:3000"},
                )
                assert signup.status_code == 201
                assert signup.json()["user"]["email"] == "person@example.com"
                assert "todo_session" in signup.cookies

                swagger_origin_signup = await client.post(
                    "/api/auth/signup",
                    json={"email": "swagger@example.com", "password": "another-strong-password"},
                    headers={"Origin": "http://test"},
                )
                assert swagger_origin_signup.status_code == 201

                rejected_origin_signup = await client.post(
                    "/api/auth/signup",
                    json={"email": "blocked@example.com", "password": "another-strong-password"},
                    headers={"Origin": "https://untrusted.example"},
                )
                assert rejected_origin_signup.status_code == 403

                await client.post("/api/auth/logout")
                client.cookies.clear()
                signup = await client.post(
                    "/api/auth/login",
                    json={"email": "person@example.com", "password": "a-strong-password"},
                    headers={"Origin": "http://localhost:3000"},
                )
                assert signup.status_code == 200

                session = await client.get("/api/auth/me")
                assert session.status_code == 200
                user_id = UUID(signup.json()["user"]["id"])

                created = await client.post(
                    "/api/todos",
                    json={
                        "title": "  Write tests  ",
                        "description": "  Confirm FastAPI CRUD  ",
                        "dueDate": "2026-10-26",
                    },
                )
                assert created.status_code == 201
                todo = created.json()["todo"]
                assert todo["title"] == "Write tests"
                assert todo["description"] == "Confirm FastAPI CRUD"
                assert todo["dueDate"] == "2026-10-26"

                listed = await client.get("/api/todos")
                assert listed.status_code == 200
                assert [item["id"] for item in listed.json()["todos"]] == [todo["id"]]

                updated = await client.patch(
                    f"/api/todos/{todo['id']}",
                    json={
                        "title": "Tests complete",
                        "description": "",
                        "dueDate": "2026-10-27",
                        "completed": True,
                    },
                )
                assert updated.status_code == 200
                assert updated.json()["todo"]["completed"] is True

                deleted = await client.delete(f"/api/todos/{todo['id']}")
                assert deleted.status_code == 200
                assert deleted.json() == {"ok": True}
                assert (await client.get("/api/todos")).json()["todos"] == []

                with SessionLocal() as db:
                    user = db.scalar(select(User).where(User.id == user_id))
                    assert user is not None
                    actions = set(
                        db.scalars(
                            select(TodoAuditEvent.action).where(TodoAuditEvent.user_id == user.id)
                        ).all()
                    )
                    assert actions == {"read", "created", "updated", "deleted"}

                await client.post("/api/auth/logout")
                assert (await client.get("/api/auth/me")).status_code == 401

                login = await client.post(
                    "/api/auth/login",
                    json={"email": "person@example.com", "password": "a-strong-password"},
                )
                assert login.status_code == 200
                assert (await client.get("/api/auth/me")).status_code == 200

    asyncio.run(exercise_api())

    Base.metadata.drop_all(bind=engine)
