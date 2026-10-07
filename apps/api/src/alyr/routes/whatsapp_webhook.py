import json

from fastapi import APIRouter, BackgroundTasks, HTTPException, Query, Request, Response

from alyr.channels.meta import parse_user_id_updates, parse_webhook, verify_signature
from alyr.config import get_settings

router = APIRouter(prefix="/webhooks/whatsapp", tags=["whatsapp"])


@router.get("")
async def verify(
    mode: str = Query("", alias="hub.mode"),
    token: str = Query("", alias="hub.verify_token"),
    challenge: str = Query("", alias="hub.challenge"),
) -> Response:
    expected = get_settings().meta_verify_token
    if mode == "subscribe" and expected and token == expected:
        return Response(content=challenge, media_type="text/plain")
    raise HTTPException(status_code=403, detail="verification failed")


@router.post("")
async def receive(request: Request, background: BackgroundTasks) -> dict:
    raw = await request.body()
    signature = request.headers.get("x-hub-signature-256")
    if not verify_signature(get_settings().meta_app_secret, raw, signature):
        raise HTTPException(status_code=401, detail="bad signature")

    payload = json.loads(raw)
    inbound = request.app.state.inbound
    # Meta expects a fast 200, so handling runs after the response is sent.
    for update in parse_user_id_updates(payload):
        background.add_task(inbound.handle_user_id_update, update)
    for message in parse_webhook(payload):
        background.add_task(inbound.handle, message)
    return {"status": "ok"}
