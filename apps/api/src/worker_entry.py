"""Entry point when the API runs as a Cloudflare Python Worker.

SPIKE (7 Oct 2026): proves whether the unchanged FastAPI app can run on Workers with
PostgreSQL reached through Hyperdrive. The normal entry point is `alyr.main:app`.
"""

from fastapi import Request
from workers import asgi

from alyr.main import create_app
from alyr.seed import DEMO_TENANT_ID

app = create_app()
# No pool: a Worker cannot keep connections between requests. The real connection
# details arrive with the first request, from the Hyperdrive binding.
app.state.db.use_single_connections()
_configured = False


def _configure(env) -> None:
    global _configured
    hd = env.HYPERDRIVE
    app.state.db.use_single_connections(
        host=hd.host, port=int(hd.port), user=hd.user,
        password=hd.password, database=hd.database, ssl=False,
    )
    _configured = True


@app.middleware("http")
async def use_worker_env(request: Request, call_next):
    if not _configured:
        _configure(request.scope["env"])
    return await call_next(request)


@app.get("/__spike/rls")
async def rls_check(request: Request) -> dict:
    """What a tenant-scoped query sees, then what a query with no tenant sees straight
    after. The second number must be 0 every time, or the pooler is leaking the setting."""
    db = request.app.state.db
    async with db.tenant(DEMO_TENANT_ID) as conn:
        scoped = await conn.fetchval("select count(*) from contacts")
    async with db.unscoped() as conn:
        unscoped = await conn.fetchval("select count(*) from contacts")
        setting = await conn.fetchval("select current_setting('app.tenant_id', true)")
    return {"scoped": scoped, "unscoped": unscoped, "setting_after": setting}


Default = asgi.entrypoint(app)
