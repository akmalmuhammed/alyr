"""A shop's product photos in the workspace (D-039, ALY-103), and the files themselves
when they are kept on local disk.

Uploading sends the photo as the request body (`Content-Type: image/jpeg` and so on), not
as a form, so the page can show real upload progress and no form-parsing library is
needed. Owners and admins add and remove photos; every signed-in person may look.

Which item a photo belongs to is the catalog's business (`MediaService.attach`); these
routes only manage the shop's library of photos.
"""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from fastapi.responses import JSONResponse

from alyr.core.auth import Staff
from alyr.core.images import PhotoRefused
from alyr.core.media import too_large
from alyr.core.storage import IMMUTABLE, PHOTO_KEY
from alyr.routes.deps import current_staff

router = APIRouter(prefix="/api/media", tags=["photos"])
# Public, no sign-in: the same files R2 serves from media.alyr.qa, for development.
public = APIRouter(tags=["photos"])


async def refused(request: Request, error: PhotoRefused) -> JSONResponse:
    """How every photo refusal reaches a client: `detail` in English like any other
    route, a `code` to act on, and the same words in Arabic."""
    return JSONResponse(
        status_code=error.status,
        content={"detail": error.en, "code": error.code, "message_ar": error.ar, **error.extra},
    )


def _manager(staff: Staff) -> None:
    if staff.role not in ("owner", "admin"):
        raise HTTPException(
            status_code=403, detail="Only the owner or an admin can change the shop's photos."
        )


@router.post("/photos", status_code=201)
async def upload(
    request: Request, response: Response, staff: Staff = Depends(current_staff)
) -> dict:
    """Add a photo. 201 when it is stored, 200 when the shop already had it, 202 when it
    is accepted and waiting for the photo store (it shows as a placeholder until then)."""
    _manager(staff)
    media = request.app.state.media
    limit = media.settings.media_max_upload_bytes
    declared = request.headers.get("content-length", "")
    if declared.isdigit() and int(declared) > limit:
        raise too_large(int(declared), limit)
    body = bytearray()
    async for chunk in request.stream():
        body.extend(chunk)
        if len(body) > limit:
            raise too_large(len(body), limit)
    done = await media.upload(staff.tenant_id, bytes(body), by=staff.name or staff.email)
    if done.duplicate:
        response.status_code = 200
    elif done.photo["state"] != "ready":
        response.status_code = 202
    return {"photo": done.photo, "duplicate": done.duplicate}


@router.get("/photos")
async def library(
    request: Request,
    limit: int = Query(default=100, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    staff: Staff = Depends(current_staff),
) -> dict:
    async with request.app.state.db.tenant(staff.tenant_id) as conn:
        return await request.app.state.media.photos(conn, limit, offset)


@router.get("/photos/{asset_id}")
async def one_photo(
    asset_id: UUID, request: Request, staff: Staff = Depends(current_staff)
) -> dict:
    """The page asks again about a photo that was still being saved."""
    async with request.app.state.db.tenant(staff.tenant_id) as conn:
        return {"photo": await request.app.state.media.photo(conn, asset_id)}


@router.delete("/photos/{asset_id}")
async def remove(
    asset_id: UUID, request: Request, staff: Staff = Depends(current_staff)
) -> dict:
    """Delete one of the shop's photos, which also takes it off every item."""
    _manager(staff)
    async with request.app.state.db.tenant(staff.tenant_id) as conn:
        await request.app.state.media.delete(conn, asset_id)
    return {"deleted": True}


@router.get("/usage")
async def usage(request: Request, staff: Staff = Depends(current_staff)) -> dict:
    """What the shop stores against its limits, this month and the months before."""
    _manager(staff)
    async with request.app.state.db.tenant(staff.tenant_id) as conn:
        return await request.app.state.media.usage(conn)


@public.get("/api/media/file/{key:path}")
async def local_file(key: str, request: Request) -> Response:
    """A stored photo, when photos are kept on local disk. With R2 these never come
    through the API: browsers fetch them from the media address."""
    store = request.app.state.media.store
    if store.name != "local" or not PHOTO_KEY.fullmatch(key):
        raise HTTPException(status_code=404, detail="no such file")
    data = await store.get(key)
    if data is None:
        raise HTTPException(status_code=404, detail="no such file")
    return Response(
        data, media_type="image/webp",
        headers={"Cache-Control": IMMUTABLE, "X-Content-Type-Options": "nosniff"},
    )
