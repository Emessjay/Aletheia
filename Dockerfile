# Multi-stage build for the Aletheia web/Railway deployment.
#
# Phase 1 of the web-stack rewrite: the API is FastAPI (server-py/), serving
# the React/Vite frontend same-origin. Postgres lands in phase 2 and Supabase
# Auth in phase 3 — neither is wired here.
#
# Stage 1 (`frontend`): builds the React/Vite bundle from the repo root.
# Stage 2 (final): a slim Python runtime image with FastAPI + the bundled
#                  SQLite corpus + the frontend's dist/ at /app/public.
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
# data/audio/kjv-timing.json is imported by src/domain/audio.ts at build
# time. The much-larger data/Aletheia.sqlite is *not* needed here — only
# the final stage copies it.
COPY data/audio ./data/audio
RUN npm run build

# ---------- Stage 2: runtime ----------
FROM python:3.11-slim
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

COPY server-py/requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt

COPY server-py/app ./app
COPY --from=frontend /build/dist ./public
COPY data/Aletheia.sqlite /app/data/Aletheia.sqlite

ENV ALETHEIA_CORPUS_PATH=/app/data/Aletheia.sqlite
ENV ALETHEIA_AUDIO_CACHE=/tmp/aletheia-audio
ENV ALETHEIA_STATIC_DIR=/app/public
ENV PORT=3000
EXPOSE 3000
# Railway injects $PORT; use sh -c so the env-var expands at container start
# rather than at image-build time.
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-3000}"]
