# Multi-stage build for the Aletheia web/Railway deployment.
#
# Phase 2 of the web-stack rewrite: the API is FastAPI (server-py/) talking to
# Postgres via asyncpg. The corpus is no longer bundled in the image — Railway
# provides Postgres via the linked Supabase plugin and the user runs
# `python -m app.scripts.ingest_corpus` once after the database is up. The
# desktop Tauri build still uses bundled SQLite locally; that's a separate
# code path entirely (src-tauri/, src/platform/tauri/).
#
# Stage 1 (`frontend`): builds the React/Vite bundle from the repo root.
# Stage 2 (final): a slim Python runtime image with FastAPI, alembic, and
#                  the frontend's dist/ at /app/public. On start, the image
#                  runs `alembic upgrade head` before launching uvicorn so a
#                  fresh database self-migrates on first boot.
#
# Build context must be the repo root. Invoke as:
#     docker build -f Dockerfile -t aletheia-fastapi .

# ---------- Stage 1: frontend ----------
FROM node:20-slim AS frontend
WORKDIR /build
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json vite.config.ts vitest.config.ts index.html ./
COPY src ./src
# data/audio/kjv-timing.json is imported by src/domain/audio.ts at build time.
# The bulk of data/ (Aletheia.sqlite, audio MP3s, sources) is intentionally
# absent — phase 2 reads the corpus from Postgres at request time.
COPY data/audio ./data/audio
# Supabase keys are baked into the bundle at BUILD time (Vite inlines
# import.meta.env.VITE_*). Railway exposes service variables to Docker
# builds only for declared ARGs — without these two lines the bundle ships
# the stubbed auth client and every sign-in says "auth not configured".
# The anon key is the publishable one (already shipped to browsers), so
# passing it as a build arg leaks nothing.
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
    VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY
RUN npm run build

# ---------- Stage 2: runtime ----------
FROM python:3.11-slim
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

COPY server-py/requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt

COPY server-py/app ./app
COPY server-py/alembic.ini ./alembic.ini
COPY server-py/alembic ./alembic
COPY --from=frontend /build/dist ./public

ENV ALETHEIA_AUDIO_CACHE=/tmp/aletheia-audio
ENV ALETHEIA_STATIC_DIR=/app/public
ENV PORT=3000
EXPOSE 3000

# Railway injects $PORT and $DATABASE_URL. Run alembic before uvicorn so a
# fresh database self-creates the schema; the user runs ingest_corpus.py
# manually (or as a Railway one-off job) to load the corpus.
CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-3000}"]
