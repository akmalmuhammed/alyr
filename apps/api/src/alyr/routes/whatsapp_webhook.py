import hmac
import json

from fastapi import APIRouter, HTTPException, Query, Request, Response

from alyr.channels.meta import (
    parse_statuses,
    parse_user_id_updates,
    parse_webhook,
    verify_signature,
)
from alyr.config import get_settings
from alyr.db import patient

router = APIRouter(prefix="/webhooks/whatsapp", tags=["whatsapp"])

# Meta's own limit, from its webhooks page (checked 29 Oct 2026): "Webhook payloads can be up
# to 3 MB." Anything longer is not Meta's, and is not read into memory to find that out (ALY-278).
MAX_BODY = 3 * 1024 * 1024


async def _body(request: Request) -> bytes:
    declared = request.headers.get("content-length", "")
    if declared.isdigit() and int(declared) > MAX_BODY:
        raise HTTPException(status_code=413, detail="too large")
    body = bytearray()
    async for chunk in request.stream():
        body.extend(chunk)
        if len(body) > MAX_BODY:
            raise HTTPException(status_code=413, detail="too large")
    return bytes(body)


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
    # Meta's webhook waits for a database connection like a customer's page does, but is not turned
    # away when others queue: it only writes a row, and a refused one comes back later (D-132).
    patient.set(True)
    raw = await _body(request)
    signature = request.headers.get("x-hub-signature-256")
    if not verify_signature(get_settings().meta_app_secret, raw, signature):
        raise HTTPException(status_code=401, detail="bad signature")

    payload = json.loads(raw)
    inbound = request.app.state.inbound
    # Meta expects a fast 200. Messages are only queued here; a job does the work.
    for update in parse_user_id_updates(payload):
        await inbound.handle_user_id_update(update)
    for status in parse_statuses(payload):
        await inbound.handle_status(status)
    for message in parse_webhook(payload):
        await inbound.accept(message)
    return {"status": "ok"}
