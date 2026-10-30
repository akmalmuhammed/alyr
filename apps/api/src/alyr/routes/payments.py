"""The shop's payment account and its provider's webhooks (ALY-17, specs/033-payment-adapters).

The account calls are the workspace's, owners and admins only: the keys can move the shop's
money (refunds). They are sealed before they are stored and never come back out. The webhook
answers to anyone, and believes only what the shop's own keys prove.
"""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field

from alyr.core import payments
from alyr.core.auth import Staff
from alyr.routes.deps import current_staff, require_manager

router = APIRouter(prefix="/api/payments", tags=["payments"])


class Connect(BaseModel):
    provider: str = Field(max_length=40)
    # Each provider says which fields it needs; the values are limited in size, not in shape.
    keys: dict[str, str] = Field(max_length=10)


def _service(request: Request) -> payments.Payments:
    return request.app.state.payments


@router.get("/providers", dependencies=[Depends(require_manager)])
async def providers(request: Request) -> dict:
    return {"providers": _service(request).providers()}


@router.get("/account", dependencies=[Depends(require_manager)])
async def account(request: Request, staff: Staff = Depends(current_staff)) -> dict:
    async with request.app.state.db.tenant(staff.tenant_id) as conn:
        return {"account": await _service(request).account(conn, staff.tenant_id)}


@router.post("/account", status_code=202, dependencies=[Depends(require_manager)])
async def connect(
    body: Connect, request: Request, response: Response, staff: Staff = Depends(current_staff)
) -> dict:
    response.headers["Cache-Control"] = "no-store"
    if any(len(value) > 500 for value in body.keys.values()):
        raise HTTPException(422, detail={"code": "missing_field"})
    try:
        async with request.app.state.db.tenant(staff.tenant_id) as conn:
            found = await _service(request).connect(
                conn, staff.tenant_id, body.provider, body.keys, staff.name
            )
    except payments.Invalid as refused:
        raise HTTPException(422, detail={"code": str(refused)}) from None
    except payments.NotSetUp:
        raise HTTPException(503, detail={"code": "not_set_up"}) from None
    return {"account": found}


@router.delete("/account", dependencies=[Depends(require_manager)])
async def disconnect(request: Request, staff: Staff = Depends(current_staff)) -> dict:
    async with request.app.state.db.tenant(staff.tenant_id) as conn:
        done = await _service(request).disconnect(conn)
    return {"disconnected": done}


# The webhook address carries the shop and the account because the provider is not signed in,
# and without a tenant Row-Level Security returns nothing. The account's ID is a random UUID
# made by the API; the signature, checked with that account's own keys, is what is believed.
@router.post("/hooks/{tenant_id}/{account_id}")
async def hook(tenant_id: UUID, account_id: UUID, request: Request) -> dict:
    body = await request.body()
    if len(body) > 64 * 1024:
        raise HTTPException(413)
    headers = {k.lower(): v for k, v in request.headers.items()}
    try:
        result = await _service(request).receive(tenant_id, account_id, headers, body)
    except payments.Refused:
        raise HTTPException(401, detail="not accepted") from None
    return {"status": result}
