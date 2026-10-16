from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI

from alyr.channels.meta import MetaChannel
from alyr.channels.simulator import SimulatorChannel
from alyr.config import get_settings
from alyr.core.inbound import INBOUND, InboundHandler
from alyr.core.jobs import JobRunner
from alyr.core.outbound import SEND, Outbound
from alyr.db import Database
from alyr.modules.bookings.service import REMINDER, Reminders
from alyr.routes import admin as admin_routes
from alyr.routes import auth as auth_routes
from alyr.routes import bookings as bookings_routes
from alyr.routes import inbox, ledger, orders, pay, simulator, store, whatsapp_webhook
from alyr.routes import jobs as jobs_routes
from alyr.routes import team as team_routes
from alyr.routes import track as track_routes
from alyr.routes import workspace as workspace_routes
from alyr.routes.deps import require_module, require_module_for_slug


def create_app() -> FastAPI:
    settings = get_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        await app.state.db.connect()
        yield
        await app.state.db.close()

    app = FastAPI(title="Alyr API", lifespan=lifespan)
    app.state.db = Database(settings.database_url)
    app.state.outbound = Outbound(
        {
            "simulator": SimulatorChannel(),
            "meta": MetaChannel(settings.meta_access_token, settings.meta_graph_version),
        },
        app.state.db,
    )
    app.state.inbound = InboundHandler(app.state.db, app.state.outbound, settings.public_web_url)

    app.state.jobs = JobRunner(app.state.db, settings.jobs_backoff_seconds)
    app.state.jobs.register(SEND, app.state.outbound.deliver, app.state.outbound.gave_up)
    app.state.jobs.register(INBOUND, app.state.inbound.process)
    app.state.jobs.register(REMINDER, Reminders(app.state.db, app.state.outbound).send)
    if settings.jobs_inline:
        app.state.db.after_commit = app.state.jobs.drain

    @app.get("/health")
    async def health() -> dict:
        return {"status": "ok", "env": settings.env}

    app.include_router(whatsapp_webhook.router)
    # Each module's routes answer only for shops that have switched that module on.
    app.include_router(ledger.router, dependencies=[Depends(require_module("ledger"))])
    app.include_router(pay.router)
    app.include_router(track_routes.router)
    app.include_router(orders.router, dependencies=[Depends(require_module("orders"))])
    app.include_router(store.router, dependencies=[Depends(require_module_for_slug("orders"))])
    app.include_router(jobs_routes.router)
    app.include_router(inbox.router, dependencies=[Depends(require_module("inbox"))])
    app.include_router(team_routes.router)
    app.include_router(auth_routes.router)
    app.include_router(
        bookings_routes.public, dependencies=[Depends(require_module_for_slug("bookings"))]
    )
    app.include_router(
        bookings_routes.router, dependencies=[Depends(require_module("bookings"))]
    )
    app.include_router(workspace_routes.router)
    app.include_router(admin_routes.router)
    if settings.env != "production":
        app.include_router(simulator.router)
    return app


app = create_app()
