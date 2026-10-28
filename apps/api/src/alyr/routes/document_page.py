"""The page a customer opens from the link we send with their receipt or invoice (ALY-139).

`/d/<shop>?t=<token>` on the web app, these two routes behind it. The token is made for this
page only (`core/links.py`, purpose `document`): it names one issued document at one shop, is
signed over both, and runs out. The page sends it in the header `X-Order-Link`, as the order
and booking pages do, so no log of ours holds it; `?t=` is read for a tool or a test; a bare
document ID is not read at all, in the address or anywhere else.

* A good link shows the document (`modules/documents/public.py` says exactly how much) and a
  button for its PDF.
* A link that has expired, was edited, belongs to another shop, or was made for another page (an
  order link, a booking link) shows a calm page that says to ask the shop to send the document
  again. Nothing in it names a document.
* The PDF needs a good link, and is refused with the same words otherwise.
* Nothing is cached for anyone else and nothing is indexed: `Cache-Control: private,
  no-store` and `X-Robots-Tag: noindex, nofollow`.
"""

from fastapi import APIRouter, Header, HTTPException, Query, Request, Response

from alyr.core import links
from alyr.modules.documents import public
from alyr.modules.documents.delivery_words import file_name
from alyr.routes import customer_link

router = APIRouter(prefix="/api/d", tags=["document page"])

NOINDEX = "noindex, nofollow"


async def _shop(request: Request, slug: str):
    async with request.app.state.db.unscoped() as conn:
        shop = await conn.fetchrow("select id, name, name_ar from tenants where slug = $1", slug)
    if shop is None:
        raise HTTPException(status_code=404, detail="shop not found")
    return shop


@router.get("/{slug}")
async def document_page(
    slug: str, request: Request, response: Response,
    t: str | None = Query(default=None, max_length=300),
    x_order_link: str | None = Header(default=None, max_length=300),
) -> dict:
    """The shop and, if the link is good, the document. `link` says whether it was good,
    expired or not valid, with the words for it in both languages."""
    customer_link.keep_private(response)
    response.headers["X-Robots-Tag"] = NOINDEX
    shop = await _shop(request, slug)
    link, state = customer_link.state(x_order_link or t, shop["id"], links.DOCUMENT)
    document = None
    if link is not None:
        async with request.app.state.db.tenant(shop["id"]) as conn:
            document = await public.page(conn, link.subject_id)
        if document is None:
            state = "invalid"  # a link whose document is gone
    return {
        "shop": {"name": shop["name"], "name_ar": shop["name_ar"]},
        "document": document, "link": customer_link.view(state, links.DOCUMENT),
    }


@router.get("/{slug}/pdf")
async def document_pdf(
    slug: str, request: Request,
    t: str | None = Query(default=None, max_length=300),
    x_order_link: str | None = Header(default=None, max_length=300),
) -> Response:
    shop = await _shop(request, slug)
    link = customer_link.require(x_order_link or t, shop["id"], links.DOCUMENT, required=True)
    async with request.app.state.db.tenant(shop["id"]) as conn:
        found = await public.pdf(conn, link.subject_id)
    if found is None:
        raise customer_link.refusal("invalid", links.DOCUMENT)
    data, number = found
    return Response(data, media_type="application/pdf", headers={
        "Content-Disposition": f'attachment; filename="{file_name(number)}"',
        "Cache-Control": "private, no-store", "Vary": "X-Order-Link",
        "X-Content-Type-Options": "nosniff", "X-Robots-Tag": NOINDEX,
        "Referrer-Policy": "no-referrer",
    })
