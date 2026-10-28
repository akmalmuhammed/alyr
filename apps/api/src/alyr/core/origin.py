"""Which web addresses may send a signed-in browser's changes (ALY-118).

The session cookie is SameSite=Lax, which keeps other sites from posting with it. It does not
stop a page on a sibling address (another subdomain of alyr.qa) or a browser that ignores
SameSite. So a request that changes something and carries the session cookie must also come from
one of our own pages: browsers state the page's address in the `Origin` header on such requests,
and nothing the page's script does can change it.

A request with no Origin header is let through: browsers always send one on a cross-site post,
and the callers that send none (a script, a test) are not what this guards against.
"""

from urllib.parse import urlsplit

from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Receive, Scope, Send

from alyr.config import Settings
from alyr.core.auth import COOKIE

UNSAFE = {"POST", "PUT", "PATCH", "DELETE"}
LOCAL_HOSTS = {"localhost", "127.0.0.1", "::1"}


def _origin(url: str) -> str:
    parts = urlsplit(url.strip())
    if not parts.scheme or not parts.netloc:
        return ""
    return f"{parts.scheme}://{parts.netloc}".lower()


def allowed_origins(settings: Settings) -> set[str]:
    found = {_origin(settings.public_web_url)}
    found.update(_origin(item) for item in settings.allowed_origins.split(","))
    found.discard("")
    return found


def permitted(origin: str, settings: Settings) -> bool:
    """Whether a page at `origin` may send a signed-in change. On a developer machine any
    localhost port may, since the web app and its tools run on several."""
    if _origin(origin) in allowed_origins(settings):
        return True
    if settings.env == "local":
        parts = urlsplit(origin.strip())
        return parts.scheme in ("http", "https") and parts.hostname in LOCAL_HOSTS
    return False


class OwnPagesOnly:
    """ASGI middleware: refuse a change that carries the session cookie from a page that is not
    ours. Everything else passes untouched."""

    def __init__(self, app: ASGIApp, settings: Settings) -> None:
        self.app = app
        self.settings = settings

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] == "http" and scope["method"] in UNSAFE:
            headers = {
                k.decode("latin-1").lower(): v.decode("latin-1") for k, v in scope["headers"]
            }
            said = headers.get("origin")
            signed_in = f"{COOKIE}=" in headers.get("cookie", "")
            if said is not None and signed_in and not permitted(said, self.settings):
                refusal = JSONResponse(
                    {"detail": "this request came from another website"}, status_code=403
                )
                await refusal(scope, receive, send)
                return
        await self.app(scope, receive, send)
