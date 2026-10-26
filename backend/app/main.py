import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from uuid import UUID, uuid4

from fastapi import Depends, FastAPI, HTTPException, Request, Response, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import FRONTEND_URL, PORT
from app.database import Base, engine, get_db
from app.models import Todo, TodoAuditEvent, User
from app.schemas import (
    Credentials,
    TodoInput,
    TodoItemResponse,
    TodoListResponse,
    TodoResponse,
    UserResponse,
)
from app.security import clear_session, create_session, hash_password, read_session_user_id, verify_password

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("daymark.api")


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(title="Daymark API", version="1.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_URL],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE"],
    allow_headers=["Content-Type"],
)


@app.middleware("http")
async def verify_mutation_origin(request: Request, call_next):
    if request.method in {"POST", "PUT", "PATCH", "DELETE"}:
        origin = request.headers.get("origin")
        request_origin = f"{request.url.scheme}://{request.url.netloc}"
        if origin and origin.rstrip("/") not in {FRONTEND_URL, request_origin}:
            return JSONResponse(status_code=403, content={"error": "Request origin is not allowed."})
    return await call_next(request)


@app.exception_handler(Exception)
async def unexpected_error_handler(_request: Request, error: Exception) -> JSONResponse:
    logger.exception("Unhandled API error", exc_info=error)
    return JSONResponse(
        status_code=500,
        content={"error": "The server could not complete the request."},
    )


def current_user(request: Request, db: Session = Depends(get_db)) -> User:
    user_id = read_session_user_id(request)
    if user_id is None:
        raise HTTPException(status_code=401, detail="Sign in to continue.")
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=401, detail="Sign in to continue.")
    return user


def todo_response(todo: Todo) -> TodoResponse:
    return TodoResponse.model_validate(todo)


def record_event(
    db: Session,
    user_id: UUID,
    action: str,
    snapshot: dict[str, object],
    todo_id: UUID | None = None,
) -> None:
    db.add(
        TodoAuditEvent(
            id=uuid4(),
            user_id=user_id,
            todo_id=todo_id,
            action=action,
            snapshot=snapshot,
        )
    )


@app.get("/api/health")
def health() -> dict[str, bool]:
    return {"ok": True}


@app.post(
    "/api/auth/signup",
    response_model=dict[str, UserResponse],
    status_code=status.HTTP_201_CREATED,
)
def signup(
    credentials: Credentials,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
) -> dict[str, UserResponse]:
    user = User(
        id=uuid4(),
        email=credentials.email,
        password_hash=hash_password(credentials.password),
    )
    db.add(user)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="An account with this email already exists.")

    create_session(response, user.id, request.url.scheme == "https")
    return {"user": UserResponse(id=user.id, email=user.email)}


@app.post("/api/auth/login", response_model=dict[str, UserResponse])
def login(
    credentials: Credentials,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
) -> dict[str, UserResponse]:
    user = db.scalar(select(User).where(User.email == credentials.email))
    password_matches = user is not None and verify_password(
        credentials.password, user.password_hash
    )
    if user is None or not password_matches:
        raise HTTPException(status_code=401, detail="Email or password is incorrect.")

    create_session(response, user.id, request.url.scheme == "https")
    return {"user": UserResponse(id=user.id, email=user.email)}


@app.post("/api/auth/logout")
def logout(request: Request, response: Response) -> dict[str, bool]:
    clear_session(response, request.url.scheme == "https")
    return {"ok": True}


@app.get("/api/auth/me", response_model=dict[str, UserResponse])
def get_me(user: User = Depends(current_user)) -> dict[str, UserResponse]:
    return {"user": UserResponse(id=user.id, email=user.email)}


@app.get("/api/todos", response_model=TodoListResponse)
def list_todos(
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> TodoListResponse:
    todos = db.scalars(
        select(Todo)
        .where(Todo.user_id == user.id)
        .order_by(Todo.due_date.asc(), Todo.created_at.desc())
    ).all()
    result = TodoListResponse(todos=[todo_response(todo) for todo in todos])
    record_event(
        db,
        user.id,
        "read",
        {"count": len(todos), "todoIds": [str(todo.id) for todo in todos]},
    )
    db.commit()
    return result


@app.post(
    "/api/todos",
    response_model=TodoItemResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_todo(
    data: TodoInput,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> TodoItemResponse:
    todo = Todo(
        id=uuid4(),
        user_id=user.id,
        title=data.title,
        description=data.description,
        due_date=data.dueDate,
        completed=data.completed,
    )
    db.add(todo)
    db.flush()
    result = TodoItemResponse(todo=todo_response(todo))
    record_event(db, user.id, "created", result.todo.model_dump(mode="json"), todo.id)
    db.commit()
    return result


def get_owned_todo(todo_id: UUID, user_id: UUID, db: Session) -> Todo:
    todo = db.scalar(select(Todo).where(Todo.id == todo_id, Todo.user_id == user_id))
    if todo is None:
        raise HTTPException(status_code=404, detail="Task not found.")
    return todo


@app.patch("/api/todos/{todo_id}", response_model=TodoItemResponse)
def update_todo(
    todo_id: UUID,
    data: TodoInput,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> TodoItemResponse:
    todo = get_owned_todo(todo_id, user.id, db)
    todo.title = data.title
    todo.description = data.description
    todo.due_date = data.dueDate
    todo.completed = data.completed
    db.flush()
    result = TodoItemResponse(todo=todo_response(todo))
    record_event(db, user.id, "updated", result.todo.model_dump(mode="json"), todo.id)
    db.commit()
    return result


@app.delete("/api/todos/{todo_id}")
def delete_todo(
    todo_id: UUID,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> dict[str, bool]:
    todo = get_owned_todo(todo_id, user.id, db)
    snapshot = todo_response(todo).model_dump(mode="json")
    record_event(db, user.id, "deleted", snapshot, todo.id)
    db.delete(todo)
    db.commit()
    return {"ok": True}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app.main:app", host="0.0.0.0", port=PORT, reload=True)
