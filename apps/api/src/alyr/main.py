from fastapi import FastAPI

from alyr.channels.meta import MetaChannel
from alyr.channels.simulator import SIMULATOR_NUMBER_ID, SimulatorChannel
from alyr.config import get_settings
from alyr.core.inbound import InboundHandler
from alyr.routes import simulator, whatsapp_webhook


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title="Alyr API")

    # Until tenants live in the database (ALY-13), the demo shop owns the simulator
    # number and, when configured, the Meta test number.
    tenants = {SIMULATOR_NUMBER_ID: "Al Noor Electricals"}
    if settings.meta_phone_number_id:
        tenants[settings.meta_phone_number_id] = "Al Noor Electricals"

    app.state.inbound = InboundHandler(tenants)
    app.state.simulator_channel = SimulatorChannel()
    app.state.meta_channel = MetaChannel(settings.meta_access_token, settings.meta_graph_version)

    @app.get("/health")
    async def health() -> dict:
        return {"status": "ok", "env": settings.env}

    app.include_router(whatsapp_webhook.router)
    if settings.env != "production":
        app.include_router(simulator.router)
    return app


app = create_app()
