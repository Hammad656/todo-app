# Daymark FastAPI backend

This folder contains the FastAPI API, authentication, PostgreSQL access, and session handling. The Next.js user interface is in `../frontend`.

## Setup

1. Create and activate a virtual environment, then install the development requirements:

   ```powershell
   py -m venv .venv
   .venv\Scripts\Activate.ps1
   py -m pip install -r requirements-dev.txt
   ```

2. If `.env` does not exist, copy `.env.example` to `.env`.
3. Replace `your_password` in `DATABASE_URL` with the password for your PostgreSQL user. If it contains URL-reserved characters, URL-encode them.

   ```env
   DATABASE_URL=postgresql+psycopg://postgres:your_password@localhost:5432/todo-db
   DATABASE_SSL=false
   SESSION_SECRET=replace-with-a-random-secret-at-least-32-characters
   FRONTEND_URL=http://localhost:3000
   PORT=4000
   ```

   Generate a session secret with:

   ```powershell
   py -c "import secrets; print(secrets.token_urlsafe(32))"
   ```

4. Run the backend:

   ```powershell
   uvicorn app.main:app --reload --port 4000
   ```

   The API initializes the `users`, `todos`, and `todo_audit_events` tables in the existing database when it starts.

## API endpoints

- `POST /api/auth/signup`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `GET /api/todos`
- `POST /api/todos`
- `PATCH /api/todos/{todo_id}`
- `DELETE /api/todos/{todo_id}`
- `GET /api/health`

Passwords are bcrypt-hashed. Sessions use signed HTTP-only cookies. Task data is scoped to the signed-in user; task reads and mutations are recorded in `todo_audit_events`.

Run API tests with `py -m pytest`.
