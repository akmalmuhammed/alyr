from contextlib import asynccontextmanager

from fastapi import FastAPI

from alyr.channels.meta import MetaChannel
from alyr.channels.simulator import SimulatorChannel
from alyr.config import get_settings
from alyr.core.inbound import InboundHandler
from alyr.core.outbound import Outbound
from alyr.db import Database
from alyr.routes import ledger, orders, pay, simulator, store, whatsapp_webhook


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
        }
    )
    app.state.inbound = InboundHandler(app.state.db, app.state.outbound, settings.public_web_url)

    @app.get("/health")
    async def health() -> dict:
        return {"status": "ok", "env": settings.env}

    app.include_router(whatsapp_webhook.router)
    app.include_router(ledger.router)
    app.include_router(pay.router)
    app.include_router(orders.router)
    app.include_router(store.router)
    if settings.env != "production":
        app.include_router(simulator.router)
    return app


app = create_app()
