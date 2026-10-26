# Daymark

Daymark is a todo app with a Next.js frontend, a separate FastAPI backend, and PostgreSQL storage.

## Project layout

- `frontend/` — Next.js pages, UI, assets, and frontend environment file (`.env.local`).
- `backend/` — FastAPI API, authentication, database code, and backend environment file (`.env`).

## Run locally

Requirements: Node.js 20.9 or newer, Python 3.10 or newer, and a PostgreSQL database, such as `todo-db`.

1. Configure the backend:

   ```powershell
   cd backend
   py -m venv .venv
   .venv\Scripts\Activate.ps1
   py -m pip install -r requirements-dev.txt
   if (!(Test-Path .env)) { Copy-Item .env.example .env }
   ```

   Edit `backend/.env` and replace `your_password` in `DATABASE_URL` with the password for your PostgreSQL user. If the password contains URL-reserved characters, URL-encode them.

   ```env
   DATABASE_URL=postgresql+psycopg://postgres:your_password@localhost:5432/todo-db
   DATABASE_SSL=false
   SESSION_SECRET=replace-with-a-random-secret-at-least-32-characters
   FRONTEND_URL=http://localhost:3000
   PORT=4000
   ```

   Generate a session secret with `py -c "import secrets; print(secrets.token_urlsafe(32))"`. Set `DATABASE_SSL=true` if your PostgreSQL provider requires SSL.

2. Configure the frontend in a second terminal:

   ```powershell
   cd frontend
   npm install
   Copy-Item .env.example .env.local
   npm run dev
   ```

3. Start FastAPI in the backend terminal with `uvicorn app.main:app --reload --port 4000`.
4. Open [http://localhost:3000](http://localhost:3000).

Never put database credentials or session secrets in the frontend environment file. The backend initializes the required tables in the existing database when it starts.

## Validation

- Frontend: `npm run lint`, `npm run build`
- Backend: `py -m compileall app`
- Backend API tests: `py -m pytest`
