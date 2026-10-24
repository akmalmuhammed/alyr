import hmac
import json
import logging

from fastapi import APIRouter, HTTPException, Query, Request, Response

from alyr.channels.meta import (
    parse_statuses,
    parse_user_id_updates,
    parse_webhook,
    verify_signature,
)
from alyr.config import get_settings
from alyr.core import health

log = logging.getLogger("alyr.webhook")

router = APIRouter(prefix="/webhooks/whatsapp", tags=["whatsapp"])


@router.get("")
async def verify(
    mode: str = Query("", alias="hub.mode"),
    token: str = Query("", alias="hub.verify_token"),
    challenge: str = Query("", alias="hub.challenge"),
) -> Response:
    expected = get_settings().meta_verify_token
    if mode == "subscribe" and expected and hmac.compare_digest(token, expected):
        return Response(content=challenge, media_type="text/plain")
    raise HTTPException(status_code=403, detail="verification failed")


@router.post("")
async def receive(request: Request) -> dict:
    raw = await request.body()
    signature = request.headers.get("x-hub-signature-256")
    if not verify_signature(get_settings().meta_app_secret, raw, signature):
        raise HTTPException(status_code=401, detail="bad signature")

    payload = json.loads(raw)
    inbound = request.app.state.inbound
    # Proof that Meta can still reach us, for the "no webhook for a while" alert. A failure
    # here must never cost a customer's message, so it is swallowed.
    try:
        await health.beat(request.app.state.db, health.WEBHOOK, at_most_every=30)
    except Exception:  # noqa: BLE001
        log.warning("could not record the webhook heartbeat")
    # Meta expects a fast 200. Messages are only queued here; a job does the work.
    for update in parse_user_id_updates(payload):
        await inbound.handle_user_id_update(update)
    for status in parse_statuses(payload):
        await inbound.handle_status(status)
    for message in parse_webhook(payload):
        await inbound.accept(message)
    return {"status": "ok"}
