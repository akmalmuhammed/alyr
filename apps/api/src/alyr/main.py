import logging
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI
from fastapi.responses import JSONResponse

from alyr.channels.meta import MetaChannel
from alyr.channels.simulator import SimulatorChannel
from alyr.config import get_settings
from alyr.core import account as account_notes
from alyr.core import origin, ratelimit
from alyr.core.card_billing import CardBilling
from alyr.core.images import PhotoRefused
from alyr.core.inbound import INBOUND, InboundHandler
from alyr.core.jobs import JobRunner
from alyr.core.links import check_secret as check_link_secret
from alyr.core.media import MediaService
from alyr.core.outbound import SEND, Outbound
from alyr.core.payments import Payments
from alyr.core.storage import check_store, make_store
from alyr.core.welcome import JOB as ACCOUNT_EMAIL
from alyr.core.welcome import AccountMail
from alyr.db import Database
from alyr.gateways import registry as payment_gateways
from alyr.modules import report
from alyr.modules.bookings import deposits as booking_deposits
from alyr.modules.bookings.service import REMINDER, Reminders
from alyr.modules.connect import webhooks as connect_webhooks
from alyr.modules.documents.delivery import JOB as DELIVERY_JOB
from alyr.modules.documents.delivery import DocumentSender
from alyr.modules.documents.errors import DocumentError
from alyr.modules.items import alerts, events, qty, wa_photo, watches
from alyr.modules.items.import_alert import JOB as IMPORT_ALERT
from alyr.modules.items.import_alert import ImportAlert
from alyr.modules.items.import_photos import JOB as IMPORT_PHOTOS
from alyr.modules.items.import_photos import ImportPhotos
from alyr.modules.items.service import count_active
from alyr.modules.orders import holds as order_holds
from alyr.modules.orders import staff_alert
from alyr.modules.orders.service import EXPIRE_JOB
from alyr.routes import account as account_routes
from alyr.routes import admin as admin_routes
from alyr.routes import admin_media as admin_media_routes
from alyr.routes import admin_templates as admin_template_routes
from alyr.routes import agent as agent_routes
from alyr.routes import auth as auth_routes
from alyr.routes import billing as billing_routes
from alyr.routes import bookings as bookings_routes
from alyr.routes import client_address as client_address_routes
from alyr.routes import connect as connect_routes
from alyr.routes import connect_setup as connect_setup_routes
from alyr.routes import costs as cost_routes
from alyr.routes import custom_fields as custom_field_routes
from alyr.routes import delivery as delivery_routes
from alyr.routes import discounts as discount_routes
from alyr.routes import (
    document_page,
    inbox,
    items,
    ledger,
    orders,
    pay,
    simulator,
    store,
    whatsapp_webhook,
)
from alyr.routes import documents as documents_routes
from alyr.routes import features as feature_routes
from alyr.routes import items_import as items_import_routes
from alyr.routes import jobs as jobs_routes
from alyr.routes import join as join_routes
from alyr.routes import media as media_routes
from alyr.routes import onboarding as onboarding_routes
from alyr.routes import owner as owner_routes
from alyr.routes import payments as payment_routes
from alyr.routes import price_groups as price_group_routes
from alyr.routes import reports as reports_routes
from alyr.routes import sales_links as sales_link_routes
from alyr.routes import staff_numbers as staff_numbers_routes
from alyr.routes import team as team_routes
from alyr.routes import templates as template_routes
from alyr.routes import track as track_routes
from alyr.routes import workspace as workspace_routes
from alyr.routes.deps import require_any_module, require_module, require_module_for_slug

log = logging.getLogger("alyr.main")


async def close_channels(app: FastAPI) -> None:
    """Close the connections a channel keeps open between sends (Meta's, ALY-276)."""
    for channel in app.state.outbound.channels.values():
        close = getattr(channel, "close", None)
        if close is not None:
            await close()


def create_app() -> FastAPI:
    settings = get_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        # A server that cannot sign its order links does not start (ALY-112).
        check_link_secret(settings)
        # Nor one that would keep photos on a disk the cloud wipes (ALY-63).
        check_store(settings, app.state.media.store)
        await app.state.db.connect()
        yield
        await close_channels(app)
        await app.state.db.close()

    # Interactive API docs only on a developer machine; elsewhere they map our surface
    # for anyone who asks (ALY-114).
    local = settings.env == "local"
    app = FastAPI(
        title="ALYR API", lifespan=lifespan,
        docs_url="/docs" if local else None, redoc_url=None,
        openapi_url="/openapi.json" if local else None,
    )
    for note in ratelimit.startup_notes(settings):
        log.warning(note)
    app.add_middleware(origin.OwnPagesOnly, settings=settings)
    app.state.db = Database(settings.database_url)
    app.state.outbound = Outbound(
        {
            "simulator": SimulatorChannel(),
            "meta": MetaChannel(settings.meta_access_token, settings.meta_graph_version),
        },
        app.state.db,
    )
    # Product photos (ALY-103): R2 when configured, otherwise local disk. The photo store
    # is written by a job, so a store that is down never blocks a request.
    app.state.media = MediaService(app.state.db, make_store(settings), settings)
    app.state.inbound = InboundHandler(
        app.state.db, app.state.outbound, settings.public_web_url, app.state.media
    )

    app.state.jobs = JobRunner(
        app.state.db, settings.jobs_backoff_seconds, settings.jobs_concurrency
    )
    app.state.jobs.register(SEND, app.state.outbound.deliver, app.state.outbound.gave_up)
    # The shop's own payment account (ALY-17): keys checked, payment pages made and providers
    # asked what happened, each by a job.
    app.state.payments = Payments(
        app.state.db, app.state.outbound, payment_gateways(settings), settings.public_web_url
    )
    app.state.payments.register(app.state.jobs)
    app.state.jobs.register(INBOUND, app.state.inbound.process)
    # ALYR's own billing: a client paying ALYR by card through Paddle (ALY-180).
    app.state.card_billing = CardBilling(app.state.db, settings)
    app.state.card_billing.register(app.state.jobs)
    app.state.jobs.register(REMINDER, Reminders(app.state.db, app.state.outbound).send)
    # Work no customer is waiting for is `background`: it runs after theirs (ALY-276).
    app.state.jobs.register(
        report.JOB, report.WeeklyReports(app.state.db, app.state.outbound).send, background=True
    )
    app.state.jobs.register(
        EXPIRE_JOB, order_holds.HoldExpiry(app.state.db, app.state.outbound).run
    )
    # A booking whose deposit was not paid in time gives its time back (D-084).
    app.state.jobs.register(
        booking_deposits.EXPIRE_JOB,
        booking_deposits.DepositExpiry(app.state.db, app.state.outbound).run,
    )
    # The staff numbers marked for new orders are told about each one (D-079).
    app.state.jobs.register(
        staff_alert.JOB,
        staff_alert.StaffAlerts(app.state.db, app.state.outbound, settings.public_web_url).run,
    )
    # Documents sent to the customer (ALY-139): WhatsApp through the outbound layer, email with
    # the PDF attached. A delivery that fails every try shows the owner "not delivered".
    document_sender = DocumentSender(app.state.db, app.state.outbound)
    app.state.jobs.register(DELIVERY_JOB, document_sender.run, document_sender.gave_up)
    # The welcome after sign-up and the invite to a team (specs/037).
    app.state.jobs.register(ACCOUNT_EMAIL, AccountMail(app.state.db).run)
    # Events out to the shop's other system (ALY-142): signed, retried, guarded.
    app.state.webhooks = connect_webhooks.WebhookSender(app.state.db)
    app.state.jobs.register(connect_webhooks.JOB, app.state.webhooks.run, background=True)
    # The Catalog on WhatsApp (ALY-106): back-in-stock messages, owner alerts, and photos sent
    # by staff turned into drafts. Each is a job, so none holds a request open.
    app.state.jobs.register(
        events.BACK_IN_STOCK,
        watches.BackInStock(app.state.db, app.state.outbound, settings.public_web_url).run,
    )
    app.state.jobs.register(
        events.STOCK_ALERT, alerts.StockAlerts(app.state.db, app.state.outbound).run
    )
    photo_drafts = wa_photo.PhotoDrafts(
        app.state.db, app.state.outbound, app.state.media, settings
    )
    app.state.jobs.register(events.PHOTO_DRAFT, photo_drafts.run, photo_drafts.gave_up)
    # The meters and the item cap count the shop's real items (not archived ones).
    app.state.media.item_counter = count_active
    app.state.media.register(app.state.jobs)
    # Photos that come with an imported spreadsheet are added after it is applied (ALY-108).
    photos_job = ImportPhotos(app.state.db, app.state.media)
    app.state.jobs.register(IMPORT_PHOTOS, photos_job.run, photos_job.gave_up, background=True)
    # One message to the owner after an import that counted stock (ALY-108).
    app.state.jobs.register(
        IMPORT_ALERT, ImportAlert(app.state.db, app.state.outbound).run
    )
    # The note to an old sign-in address, and to owners when the data is downloaded (specs/040).
    app.state.jobs.register(
        account_notes.NOTICE, account_notes.AccountNotices(app.state.db).run
    )
    app.add_exception_handler(PhotoRefused, media_routes.refused)
    app.add_exception_handler(DocumentError, documents_routes.refused)
    app.add_exception_handler(connect_routes.Invalid, connect_routes.invalid)
    # A quantity is a JSON number everywhere (spec 013); FastAPI would write a Decimal as text.
    qty.install_json(app)
    if settings.jobs_inline:
        app.state.db.after_commit = app.state.jobs.drain

    @app.get("/health")
    async def health() -> dict:
        """Liveness: the process answers. Deliberately does not touch the database, so a
        database outage does not make the host restart every API container in a loop."""
        # Alive, nothing more: which environment this is stays with us (ALY-118).
        return {"status": "ok"}

    @app.get("/health/ready")
    async def ready() -> JSONResponse:
        """Readiness: the API can reach its database. Hosts send traffic only when it can."""
        try:
            async with app.state.db.unscoped() as conn:
                await conn.fetchval("select 1")
        except Exception:  # noqa: BLE001 - any failure means not ready
            return JSONResponse({"status": "unavailable", "database": "unreachable"}, 503)
        return JSONResponse({"status": "ok", "database": "ok"})

    @app.get("/health/worker")
    async def worker_health() -> JSONResponse:
        """Whether the background worker is alive. Uptime monitoring calls this: when it
        is red, reminders and confirmations are not going out."""
        if settings.jobs_inline:
            return JSONResponse({"status": "ok", "mode": "inline"})
        try:
            async with app.state.db.unscoped() as conn:
                age = await conn.fetchval(
                    "select extract(epoch from now() - max(beat_at))::int "
                    "from worker_heartbeats"
                )
        except Exception:  # noqa: BLE001
            return JSONResponse({"status": "unknown", "database": "unreachable"}, 503)
        if age is None:
            return JSONResponse({"status": "down", "reason": "no worker has checked in"}, 503)
        if age > settings.worker_stale_seconds:
            return JSONResponse(
                {"status": "down", "seconds_since_last_check_in": age}, 503
            )
        return JSONResponse({"status": "ok", "seconds_since_last_check_in": age})

    app.include_router(whatsapp_webhook.router)
    # Each module's routes answer only for shops that have switched that module on.
    app.include_router(ledger.router, dependencies=[Depends(require_module("ledger"))])
    app.include_router(pay.router)
    app.include_router(payment_routes.router)
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
    # Cost and margin (ALY-150): owners and admins only. Before the items' own routes, so that
    # `/api/items/margins` is not taken for an item's ID.
    app.include_router(cost_routes.router)
    app.include_router(
        items.router, dependencies=[Depends(require_any_module("orders", "catalog"))]
    )
    # The features each shop has switched on (ALY-148).
    app.include_router(feature_routes.router)
    app.include_router(custom_field_routes.router)
    # Discounts and coupon codes (ALY-150): off for every shop until the feature is switched on.
    app.include_router(discount_routes.router)
    # Delivery and pickup (ALY-150): the same.
    app.include_router(delivery_routes.router)
    app.include_router(template_routes.router)
    # The numbers the owner registers as staff, who may change the Catalog by WhatsApp.
    app.include_router(staff_numbers_routes.router)
    # Customer price groups (wholesale) belong to the same Catalog (ALY-127).
    app.include_router(
        price_group_routes.router, dependencies=[Depends(require_any_module("orders", "catalog"))]
    )
    # Documents (ALY-138): the engine, off for every shop until the screens and hooks exist.
    app.include_router(
        documents_routes.router, dependencies=[Depends(require_module("documents"))]
    )
    # Connected mode (ALY-142): the machine's door (it answers to an API key, never a session,
    # and checks the shop has Documents on itself) and the person's setup of it.
    app.include_router(connect_routes.router)
    app.include_router(
        connect_setup_routes.router, dependencies=[Depends(require_module("documents"))]
    )
    # The page a customer opens from the link we send with a document (ALY-139). A shop
    # without the module has no such page.
    app.include_router(
        document_page.router, dependencies=[Depends(require_module_for_slug("documents"))]
    )
    app.include_router(store.router, dependencies=[Depends(require_module_for_slug("orders"))])
    app.include_router(jobs_routes.router)
    app.include_router(jobs_routes.messages)
    app.include_router(inbox.router, dependencies=[Depends(require_module("inbox"))])
    app.include_router(team_routes.router)
    app.include_router(owner_routes.router)
    app.include_router(auth_routes.router)
    app.include_router(client_address_routes.router)
    app.include_router(account_routes.router)
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
    app.include_router(billing_routes.router)
    app.include_router(admin_media_routes.router)
    app.include_router(admin_template_routes.router)
    app.include_router(media_routes.router)
    app.include_router(media_routes.public)
    app.include_router(onboarding_routes.router)
    app.include_router(sales_link_routes.router)
    app.include_router(join_routes.router)
    if local:
        app.include_router(simulator.router)
    return app


app = create_app()
