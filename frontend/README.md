# Daymark frontend

The Next.js user interface lives in this folder. It sends authenticated API requests to the separate FastAPI server in `../backend`.

## Setup

1. Install frontend dependencies with `npm install`.
2. Copy `.env.example` to `.env.local`. The default API URL is `http://localhost:4000` (FastAPI).
3. Start the UI with `npm run dev`.

Set `NEXT_PUBLIC_API_URL` if your FastAPI backend runs at a different address. The PostgreSQL URL and session secret belong in `backend/.env`, not this folder.

For the complete setup and to start both servers, see the repository [README](../README.md).
