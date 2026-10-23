# Blossom — Flask + MySQL integration

This bundle adds a Flask JSON API and a replacement `script.js` for the existing
Blossom static site. It preserves the current DOM IDs, rendering, progress display,
hide-completed control, clear-done control, reset control, and delete animation.

## Important hosting note

GitHub Pages only hosts the static frontend. Deploy this Flask API to a Python
hosting service and use a managed MySQL database. The frontend must be configured
with the deployed API URL in `script.js`.

## Files

- `app.py`: Flask API
- `schema.sql`: MySQL schema
- `requirements.txt`: Python packages
- `.env.example`: environment-variable template (never upload real credentials)
- `script.js`: replace the repository's existing `script.js` with this file

## Database

Create a MySQL database and a restricted database user on your database provider.
Run `schema.sql` using that provider's SQL console. If your provider creates the
database for you, remove the `CREATE DATABASE` and `USE` lines and create the table
inside the database it supplied.

## Local backend setup

1. Install Python 3.10+ and MySQL.
2. Create a virtual environment: `python -m venv .venv`
3. Activate it and install packages: `pip install -r requirements.txt`
4. Copy `.env.example` to `.env` and fill in real local database values.
5. Run `python app.py`.
6. Test `http://127.0.0.1:5000/api/health`.

For local testing, change `API_BASE` in `script.js` to `http://127.0.0.1:5000`.
For the live site, set it to the actual HTTPS URL of the deployed Flask service.

## Deploy

Deploy this backend directory/repository to a Python host that supports Flask and
MySQL connections. Use `gunicorn app:app` as the start command (also in Procfile).
Configure `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, and
`FRONTEND_ORIGIN` in the host's environment settings. `FRONTEND_ORIGIN` should be
`https://rabnur1.github.io` (origin only, no `/cst` path).

The MySQL provider must permit connections from the backend host. Prefer private
networking where supported; otherwise use provider IP allowlists and TLS.

## Browser migration

The replacement `script.js` retains `blossom-tasks` in localStorage as a recovery
copy. It adds a stable local ID to each old task, sends those tasks to the API, and
sets a migration marker only after the server accepts them. A failed migration does
not clear the browser's existing task data. Once migrated, the server becomes the
source of truth and localStorage is refreshed as a cache.

## Data/privacy note

This starter assigns a random owner UUID per browser to avoid displaying every
browser's tasks together. This is not user authentication: clearing browser storage
creates a new identity, and anyone who obtains an owner UUID may impersonate that
browser. For sensitive or multi-user use, add real login/session authentication and
derive ownership on the server rather than trusting a client-supplied ID.
