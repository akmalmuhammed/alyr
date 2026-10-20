# syntax=docker/dockerfile:1
# The API and the background worker: one image, two commands (ALY-63).
#   API:     the default command
#   Worker:  python -m alyr.worker
#   Migrate: python -m alyr.migrate   (run once per deploy, before the new API starts)
# Built from apps/api:  docker build -t alyr-api apps/api

FROM ghcr.io/astral-sh/uv:python3.13-bookworm-slim AS build
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy UV_PYTHON_DOWNLOADS=0
WORKDIR /app
# Dependencies first, so a code change does not reinstall them.
COPY pyproject.toml uv.lock ./
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-install-project --no-default-groups --group server
COPY src ./src
COPY migrations ./migrations
# The project is installed editable, pointing at /app/src, so the migration runner finds
# /app/migrations exactly as it does in the repository.
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-default-groups --group server

FROM python:3.13-slim-bookworm
RUN useradd --system --uid 10001 --home-dir /app alyr \
 && mkdir -p /data/media && chown alyr /data/media
COPY --from=build --chown=alyr:alyr /app /app
WORKDIR /app
# Production unless told otherwise: no simulator, no open demo, no stand-in payments.
# Jobs run in the separate worker, never inside a web request.
ENV PATH="/app/.venv/bin:$PATH" \
    PYTHONUNBUFFERED=1 \
    ALYR_ENV=production \
    ALYR_JOBS_INLINE=false
USER 10001
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=4)" || exit 1
CMD ["uvicorn", "alyr.main:app", "--host", "0.0.0.0", "--port", "8000", \
     "--proxy-headers", "--forwarded-allow-ips", "*", "--no-server-header"]
