# syntax=docker/dockerfile:1
# The API and the background worker: one image (ALY-63, ALY-224). Build from this folder:
#   docker build -t alyr-api apps/api
# What it runs depends on the first argument (docker-entrypoint.sh):
#   (none)   the API and the worker side by side, for a host that runs one container (D-052)
#   api      the API only, on $PORT (8080 unless set)
#   worker   the worker only (Google Cloud Run worker pool, docker-compose.prod.yml)
#   anything else is run as given, e.g. `python -m alyr.migrate` once per deploy
# Settings come from ALYR_* environment variables; the image holds no secret.

FROM ghcr.io/astral-sh/uv:python3.13-bookworm-slim AS build
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy UV_PYTHON_DOWNLOADS=0
WORKDIR /app
# Dependencies first, so a code change does not reinstall them. The server group (uvicorn)
# stays; the tests' group does not.
COPY pyproject.toml uv.lock ./
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --locked --no-install-project --no-default-groups --group server
COPY src ./src
COPY migrations ./migrations
# The project is installed editable, pointing at /app/src, so the migration runner finds
# /app/migrations exactly as it does in the repository.
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --locked --no-default-groups --group server

FROM python:3.13-slim-bookworm
RUN useradd --system --uid 10001 --home-dir /app alyr \
 && mkdir -p /data/media && chown alyr /data/media
COPY --from=build --chown=alyr:alyr /app /app
COPY --chmod=755 docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
WORKDIR /app
# Production unless told otherwise: no simulator, no open demo, no stand-in payments.
# Jobs run in the worker, never inside a web request.
ENV PATH="/app/.venv/bin:$PATH" \
    PYTHONUNBUFFERED=1 \
    PORT=8080 \
    ALYR_ENV=production \
    ALYR_JOBS_INLINE=false
USER 10001
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD python -c "import os, urllib.request; urllib.request.urlopen('http://127.0.0.1:%s/health' % os.environ.get('PORT', '8080'), timeout=4)" || exit 1
ENTRYPOINT ["docker-entrypoint.sh"]
