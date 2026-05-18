# Multi-stage build for the Aletheia web/Railway deployment.
#
# Stage 1 (`frontend`): builds the React/Vite bundle from the repo root.
# Stage 2 (`server-build`): compiles the Node API server under server/.
# Stage 3 (final): assembles a slim runtime image with the compiled server,
#                  the frontend bundle, and the bundled SQLite corpus.
#
# Build context must be the repo root, not server/, because Stage 1 needs the
# root package.json and src/. Invoke as:
#     docker build -f server/Dockerfile -t aletheia-server .

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

# ---------- Stage 2: server compile ----------
# better-sqlite3 needs a C++ toolchain to compile its native addon. We do that
# work in a builder stage and copy node_modules forward; the final image keeps
# the compiled .node binary but not the build tools.
FROM node:20-slim AS server-build
WORKDIR /build
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
COPY server/package.json server/package-lock.json ./
# Install with dev deps (TypeScript) so we can compile, then prune them out
# before the final image picks node_modules up — keeps the runtime image
# free of compilers and type definitions.
RUN npm ci
COPY server/tsconfig.json ./
COPY server/src ./src
RUN npx tsc -p tsconfig.json
RUN npm prune --omit=dev

# ---------- Stage 3: runtime ----------
FROM node:20-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=server-build /build/dist ./
COPY --from=server-build /build/node_modules ./node_modules
COPY --from=frontend     /build/dist ./public
COPY data/Aletheia.sqlite /app/data/Aletheia.sqlite
ENV ALETHEIA_CORPUS_PATH=/app/data/Aletheia.sqlite
ENV ALETHEIA_AUDIO_CACHE=/tmp/aletheia-audio
ENV ALETHEIA_STATIC_DIR=/app/public
ENV PORT=3000
EXPOSE 3000
CMD ["node", "/app/index.js"]
