"""What the API sees as the caller's address (ALY-265), for checking the production setup.

Anyone may ask: the answer is the caller's own address and where it came from, nothing else. It
sits under /api so the web app's forwarding carries it, which lets one check cover the whole
path (docs/runbooks/client-address.md): through the edge to the API, through the edge and the web
app to the API, and straight at the API's own address.
"""

from fastapi import APIRouter, Request, Response

from alyr.core import ratelimit

router = APIRouter(prefix="/api", tags=["client address"])


@router.get("/client-address")
async def client_address(request: Request, response: Response) -> dict:
    """`source` is "signed" when the edge vouched for the address, "unvouched" when keys are set
    and nobody did (the address is then the shared bucket's name, not the caller's), "header" for
    a header believed without keys, "connection" when no header is named. `counting` says
    whether the per-address limits are on at all."""
    address, source = ratelimit.resolve(request)
    response.headers["Cache-Control"] = "no-store"
    return {"address": address, "source": source, "counting": ratelimit.address_limits_on()}
