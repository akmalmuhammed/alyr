# The API and its job runner as one image (ALY-224, spec 021). Build from this folder:
#   docker build -t alyr-api apps/api
# It listens on $PORT (8080). Settings come from ALYR_* environment variables; the image holds
# no secret. It is what Cloudflare Containers run today and what Azure Container Apps will run
# later (D-036), so nothing in it is specific to either.
FROM ghcr.io/astral-sh/uv:python3.13-bookworm-slim

# Same layout as the repository: `alyr.migrate` finds `migrations/` next to `src/`.
WORKDIR /app/apps/api
ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never \
    PYTHONUNBUFFERED=1 \
    PATH="/app/apps/api/.venv/bin:$PATH"

# Dependencies first, so a code change does not install them again. The server group
# (uvicorn) stays; the tests' group does not.
COPY pyproject.toml uv.lock ./
RUN uv sync --locked --no-dev --no-install-project

COPY src ./src
COPY migrations ./migrations
RUN uv sync --locked --no-dev

COPY docker-entrypoint.sh ./
RUN useradd --system --no-create-home alyr && chmod +x docker-entrypoint.sh
USER alyr

EXPOSE 8080
ENTRYPOINT ["./docker-entrypoint.sh"]
