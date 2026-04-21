# Equation 26 By Quantnum, IIITP

Full-stack quiz control webapp for a math competition.

Stack:
- `Next.js` frontend (`frontend/`)
- `FastAPI` backend (`backend/`)
- `Supabase` as database (`teams` + `questions`)

## What this app includes

- Big-screen friendly 3-panel layout:
  - Left: question palette
  - Middle: question view + timer + round controls
  - Right: leaderboard with score controls (`+` / `-`)
- Independent scrolling in all three panels.
- Team scores loaded from Supabase and updated live from the UI.
- Questions loaded from Supabase with points/time/category/difficulty fields.
- Random question allotment to a team using an unbiased server-side selector:
  - `secrets.randbelow(len(teams))` (uniform distribution).
- Futuristic dark theme + animated particle backdrop.

## 1) Setup Supabase

1. Create a Supabase project.
2. Open SQL Editor and run `supabase/schema.sql`.
3. Keep your project URL and service role key ready.

## 2) Backend setup (FastAPI)

```bash
cd backend
python -m venv .venv
.venv\\Scripts\\activate
pip install -r requirements.txt
copy .env.example .env
```

Edit `backend/.env`:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `FRONTEND_ORIGIN` (default `http://localhost:3000`)

Run backend:

```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Health check: `http://127.0.0.1:8000/health`

## 3) Frontend setup (Next.js)

```bash
cd frontend
npm install
copy .env.example .env.local
```

Edit `frontend/.env.local`:
- `NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8000`

Run frontend:

```bash
npm run dev
```

Open `http://localhost:3000`.

## API summary

- `GET /api/questions`
- `GET /api/questions/{question_id}`
- `PATCH /api/questions/{question_id}/usage` with `{ "is_used": true/false }`
- `POST /api/questions/{question_id}/assign-random-team`
- `GET /api/teams`
- `PATCH /api/teams/{team_id}/score` with `{ "delta": 10 }` or negative value

## Notes

- Backend uses Supabase service role key so it can update scores/questions securely.
- Frontend polls leaderboard every 5 seconds so score changes stay fresh on display.
- For very high write concurrency, you can replace score update with a SQL RPC increment function in Supabase.
