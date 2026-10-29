"""Paddle's webhook for ALYR's own billing (ALY-180, D-074, spec 035).

Notification destination in Paddle: https://api.alyr.qa/api/billing/paddle/webhook. Paddle
wants a 2xx within five seconds, so this only checks the signature and queues a job
(`core/card_billing.py`); the job reads the transaction back from Paddle.
"""

from fastapi import APIRouter, HTTPException, Request

router = APIRouter(prefix="/api/billing", tags=["billing"])

# A Paddle event is a few kilobytes; anything far larger is not one.
MAX_BODY_BYTES = 256 * 1024


@router.post("/paddle/webhook")
async def paddle_webhook(request: Request) -> dict:
    body = await request.body()
    if len(body) > MAX_BODY_BYTES:
        raise HTTPException(status_code=413, detail="too large")
    try:
        await request.app.state.card_billing.receive(
            body, request.headers.get("paddle-signature", "")
        )
    except PermissionError as error:
        raise HTTPException(status_code=401, detail="not signed by Paddle") from error
    # An event about something that is not ours is still answered 200, or Paddle retries it.
    return {"ok": True}
