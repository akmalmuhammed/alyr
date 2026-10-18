from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI

from alyr.channels.meta import MetaChannel
from alyr.channels.simulator import SimulatorChannel
from alyr.config import get_settings
from alyr.core.images import PhotoRefused
from alyr.core.inbound import INBOUND, InboundHandler
from alyr.core.jobs import JobRunner
from alyr.core.media import MediaService
from alyr.core.outbound import SEND, Outbound
from alyr.core.storage import make_store
from alyr.db import Database
from alyr.modules import report
from alyr.modules.bookings.service import REMINDER, Reminders
from alyr.modules.items.import_photos import JOB as IMPORT_PHOTOS
from alyr.modules.items.import_photos import ImportPhotos
from alyr.modules.items.service import count_active
from alyr.modules.orders import holds as order_holds
from alyr.modules.orders.service import EXPIRE_JOB
from alyr.routes import admin as admin_routes
from alyr.routes import admin_media as admin_media_routes
from alyr.routes import agent as agent_routes
from alyr.routes import auth as auth_routes
from alyr.routes import bookings as bookings_routes
from alyr.routes import inbox, items, ledger, orders, pay, simulator, store, whatsapp_webhook
from alyr.routes import items_import as items_import_routes
from alyr.routes import jobs as jobs_routes
from alyr.routes import media as media_routes
from alyr.routes import onboarding as onboarding_routes
from alyr.routes import price_groups as price_group_routes
from alyr.routes import reports as reports_routes
from alyr.routes import team as team_routes
from alyr.routes import track as track_routes
from alyr.routes import workspace as workspace_routes
from alyr.routes.deps import require_any_module, require_module, require_module_for_slug


def create_app() -> FastAPI:
    settings = get_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        await app.state.db.connect()
        yield
        await app.state.db.close()

    # Interactive API docs only on a developer machine; elsewhere they map our surface
    # for anyone who asks (ALY-114).
    local = settings.env == "local"
    app = FastAPI(
        title="ALYR API", lifespan=lifespan,
        docs_url="/docs" if local else None, redoc_url=None,
        openapi_url="/openapi.json" if local else None,
    )
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
    app.state.jobs.register(report.JOB, report.WeeklyReports(app.state.db, app.state.outbound).send)
    app.state.jobs.register(
        EXPIRE_JOB, order_holds.HoldExpiry(app.state.db, app.state.outbound).run
    )
    # Product photos (ALY-103): R2 when configured, otherwise local disk. The photo store
    # is written by a job, so a store that is down never blocks a request.
    app.state.media = MediaService(app.state.db, make_store(settings), settings)
    # The meters and the item cap count the shop's real items (not archived ones).
    app.state.media.item_counter = count_active
    app.state.media.register(app.state.jobs)
    # Photos that come with an imported spreadsheet are added after it is applied (ALY-108).
    photos_job = ImportPhotos(app.state.db, app.state.media)
    app.state.jobs.register(IMPORT_PHOTOS, photos_job.run, photos_job.gave_up)
    app.add_exception_handler(PhotoRefused, media_routes.refused)
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
    # The Catalog's own API (D-039). It adds nothing to the Products screen. It answers
    # where orders are switched on (the order page reads the same items) and where the
    # Catalog module is on (its workspace screens, hidden until go-live, ALY-104).
    # The import and export routes come first: `/api/items/export` must not be taken for
    # an item's ID.
    app.include_router(
        items_import_routes.router,
        dependencies=[Depends(require_any_module("orders", "catalog"))],
    )
    app.include_router(
        items.router, dependencies=[Depends(require_any_module("orders", "catalog"))]
    )
    # Customer price groups (wholesale) belong to the same Catalog (ALY-127).
    app.include_router(
        price_group_routes.router, dependencies=[Depends(require_any_module("orders", "catalog"))]
    )
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
    app.include_router(agent_routes.router)
    app.include_router(reports_routes.router)
    app.include_router(admin_routes.router)
    app.include_router(admin_media_routes.router)
    app.include_router(media_routes.router)
    app.include_router(media_routes.public)
    app.include_router(onboarding_routes.router)
    if local:
        app.include_router(simulator.router)
    return app


app = create_app()
