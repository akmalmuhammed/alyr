"""The MCP endpoint and the documents that tell an app how to sign in (spec 067).

`POST /mcp` is the one endpoint (Streamable HTTP, JSON answers only). Every request needs a bearer
token; without a good one the answer is `401` with `WWW-Authenticate` pointing at the protected
resource's metadata, which is how an app finds the way to `/oauth/authorize`. `GET` and `DELETE`
answer 405: there is no stream to open and no session to end.

Every path answers 404 unless the connector is switched on for this installation
(`ALYR_MCP_ENABLED`, off in production until the founder says).
"""

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse, Response

from alyr.config import get_settings, mcp_on
from alyr.core import ratelimit
from alyr.modules.mcp import access, oauth, scopes

ALWAYS_ALLOWED = ("https://claude.ai", "https://claude.com", "https://chatgpt.com")


async def switched_on() -> None:
    if not mcp_on(get_settings()):
        raise HTTPException(status_code=404, detail="not found")


router = APIRouter(dependencies=[Depends(switched_on)], tags=["mcp"])


def _origins() -> set[str]:
    settings = get_settings()
    found = set(ALWAYS_ALLOWED) | {oauth.issuer(settings)}
    found |= {o.strip().rstrip("/") for o in settings.mcp_allowed_origins.split(",") if o.strip()}
    return found


def origin_ok(origin: str) -> bool:
    """The `Origin` header, when a browser sends one, must be ours or a known app's (DNS
    rebinding, the specification's rule). Callers that send none (the apps' servers) pass."""
    if origin.rstrip("/") in _origins():
        return True
    settings = get_settings()
    if settings.env == "local":
        from urllib.parse import urlsplit

        return urlsplit(origin).hostname in ("localhost", "127.0.0.1", "::1")
    return False


# ── Metadata (RFC 9728 and RFC 8414) ───────────────────────────────────────────────────────────


def _document(body: dict) -> JSONResponse:
    return JSONResponse(body, headers={"Cache-Control": "public, max-age=300"})


@router.get("/.well-known/oauth-protected-resource")
@router.get("/.well-known/oauth-protected-resource/mcp")
async def protected_resource() -> JSONResponse:
    settings = get_settings()
    return _document({
        "resource": oauth.resource(settings),
        "authorization_servers": [oauth.issuer(settings)],
        "scopes_supported": list(scopes.BASIC),
        "bearer_methods_supported": ["header"],
        "resource_name": "ALYR",
    })


@router.get("/.well-known/oauth-authorization-server")
async def authorization_server() -> JSONResponse:
    base = oauth.issuer(get_settings())
    return _document({
        "issuer": base,
        "authorization_endpoint": f"{base}/oauth/authorize",
        "token_endpoint": f"{base}/oauth/token",
        "registration_endpoint": f"{base}/oauth/register",
        "revocation_endpoint": f"{base}/oauth/revoke",
        "response_types_supported": ["code"],
        "grant_types_supported": ["authorization_code", "refresh_token"],
        "code_challenge_methods_supported": ["S256"],
        "token_endpoint_auth_methods_supported": ["none"],
        "revocation_endpoint_auth_methods_supported": ["none"],
        "scopes_supported": list(scopes.ALL),
        "client_id_metadata_document_supported": True,
        "authorization_response_iss_parameter_supported": True,
        "service_documentation": "https://alyr.qa",
    })


# ── The endpoint ───────────────────────────────────────────────────────────────────────────────


def _refusal(settings, error: access.McpAuthError, presented: bool) -> JSONResponse:
    """401 says where the metadata is (and, when a token was presented, that it was not good: RFC
    6750 says to name no error when there was none to judge). 403 and 429 carry no challenge."""
    headers: dict[str, str] = {}
    if error.status == 401:
        headers["WWW-Authenticate"] = access.challenge(
            settings, error.error if presented else None,
            error.description if presented else None, error.scope,
        )
    if error.status == 429:
        headers["Retry-After"] = "60"
    return JSONResponse(
        {"error": error.error, "error_description": error.description},
        status_code=error.status, headers=headers,
    )


@router.post("/mcp")
async def endpoint(request: Request) -> Response:
    settings = get_settings()
    said = request.headers.get("origin")
    if said is not None and not origin_ok(said):
        return JSONResponse({"error": "origin not allowed"}, status_code=403)
    db = request.app.state.db
    presented = request.headers.get("authorization")
    try:
        principal = await access.authenticate(db, presented, settings)
    except access.McpAuthError as error:
        if error.status == 401 and presented:
            # A token that was presented and was wrong counts against the address; the first
            # request of a sign-in, which has none, does not.
            try:
                await access.count_bad(db, ratelimit.client_address(request))
            except access.McpAuthError as limited:
                return _refusal(settings, limited, True)
        return _refusal(settings, error, bool(presented))

    from alyr.modules.mcp.server import MAX_REQUEST_BYTES

    body = bytearray()
    async for chunk in request.stream():
        body.extend(chunk)
        if len(body) > MAX_REQUEST_BYTES:
            break
    headers = {k.lower(): v for k, v in request.headers.items()}
    reply = await request.app.state.mcp.handle(principal, bytes(body), headers)
    if reply.body is None:
        return Response(status_code=reply.status, headers=reply.headers)
    return JSONResponse(reply.body, status_code=reply.status, headers=reply.headers)


@router.api_route("/mcp", methods=["GET", "DELETE"])
async def no_stream() -> Response:
    """No stream to open and no session to end (specification 2026-07-28; the earlier revisions
    allow this answer when a server offers neither)."""
    return Response(status_code=405, headers={"Allow": "POST"})
