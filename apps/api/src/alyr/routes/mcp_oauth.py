"""The connector's sign-in: registration, the page, the token endpoint and revocation (spec 067).

The page is the existing email code in a browser: no session cookie is made, only a short request
that remembers who proved their address. Everything the apps' servers call (register, token,
revoke) answers JSON; everything a person sees is HTML with no script.

Limits: the person's own steps (asking for a code, guessing one) use the sign-in limits of
`core/ratelimit.py`. The machine-facing endpoints are generous per address on purpose: the big apps
call from shared addresses, so one address is many people, and what protects them is that a code or
a token is a random 256-bit value, not a count.
"""

import json
import logging
from urllib.parse import parse_qs
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse, Response

from alyr.config import get_settings
from alyr.core import auth, mail, ratelimit
from alyr.modules.mcp import clients, oauth, page
from alyr.routes.mcp import switched_on

log = logging.getLogger("alyr.mcp")
router = APIRouter(prefix="/oauth", dependencies=[Depends(switched_on)], tags=["mcp"])

COOKIE = "alyr_mcp_req"
MAX_FORM_BYTES = 8 * 1024
REGISTER_PER_ADDRESS = ratelimit.Limit(60, ratelimit.HOUR)
TOKEN_PER_ADDRESS = ratelimit.Limit(300, ratelimit.TEN_MINUTES)
AUTHORIZE_PER_ADDRESS = ratelimit.Limit(60, ratelimit.TEN_MINUTES)
NO_STORE = {"Cache-Control": "no-store", "Pragma": "no-cache"}
PAGE_HEADERS = {
    **NO_STORE, "Referrer-Policy": "no-referrer", "X-Frame-Options": "DENY",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; "
                               "base-uri 'none'; frame-ancestors 'none'",
}


async def _form(request: Request) -> dict[str, str]:
    """A form-encoded body (never more than 8 KB), as one value per name."""
    body = bytearray()
    async for chunk in request.stream():
        body.extend(chunk)
        if len(body) > MAX_FORM_BYTES:
            raise HTTPException(status_code=413, detail="the request is too large")
    parsed = parse_qs(body.decode("utf-8", errors="replace"), keep_blank_values=True)
    return {k: v[0] for k, v in parsed.items()}


def _lang(request: Request, asked: str | None = None) -> str:
    if asked in ("en", "ar"):
        return asked
    return "ar" if request.headers.get("accept-language", "").lower().startswith("ar") else "en"


def _html(body: str, status: int = 200, binder: str | None = None) -> HTMLResponse:
    response = HTMLResponse(body, status_code=status, headers=PAGE_HEADERS)
    if binder:
        response.set_cookie(
            COOKIE, binder, max_age=oauth.REQUEST_MINUTES * 60, httponly=True, samesite="lax",
            secure=get_settings().env != "local", path="/oauth",
        )
    return response


def _json_error(error: oauth.OAuthError | clients.ClientError) -> JSONResponse:
    status = getattr(error, "status", 400)
    if error.code == "invalid_client":
        status = 401
    return JSONResponse(
        {"error": error.code, "error_description": error.description},
        status_code=status, headers=NO_STORE,
    )


async def _limit(request: Request, bucket: str, limit: ratelimit.Limit) -> None:
    await ratelimit.check(request, bucket, limit)


# ── Registration (RFC 7591) ────────────────────────────────────────────────────────────────────


@router.post("/register")
async def register(request: Request) -> Response:
    await _limit(request, "mcp-register", REGISTER_PER_ADDRESS)
    body = bytearray()
    async for chunk in request.stream():
        body.extend(chunk)
        if len(body) > 16 * 1024:
            return _json_error(clients.ClientError("invalid_client_metadata", "too large"))
    try:
        document = json.loads(bytes(body) or b"{}")
        made = await clients.register(request.app.state.db, document)
    except ValueError:
        return _json_error(clients.ClientError("invalid_client_metadata", "send JSON"))
    except clients.ClientError as error:
        return _json_error(error)
    return JSONResponse(made, status_code=201, headers=NO_STORE)


# ── The page ───────────────────────────────────────────────────────────────────────────────────


@router.get("/authorize")
async def authorize(request: Request) -> Response:
    settings = get_settings()
    db = request.app.state.db
    params = dict(request.query_params)
    lang = _lang(request, params.get("lang"))
    try:
        await _limit(request, "mcp-authorize", AUTHORIZE_PER_ADDRESS)
    except HTTPException:
        return _html(page.error_page(lang, "Too many attempts. Try again in a few minutes."), 429)
    # A bad client or redirect is a page, never a redirect: sending the person to an address
    # nobody vouched for is the attack.
    try:
        client = await clients.lookup(db, params.get("client_id", ""))
        redirect_uri, challenge, state, asked = oauth.check_authorize(params, client, settings)
    except clients.ClientError as error:
        return _html(page.error_page(lang, error.description), 400)
    except oauth.OAuthError as error:
        if error.code == "invalid_redirect_uri":
            return _html(page.error_page(lang, error.description), 400)
        target = params.get("redirect_uri") or (
            client.redirect_uris[0] if len(client.redirect_uris) == 1 else "")
        if not target:
            return _html(page.error_page(lang, error.description), 400)
        return RedirectResponse(
            oauth.redirect_to(
                target, settings, error=error.code, error_description=error.description,
                state=params.get("state"),
            ),
            status_code=303, headers=NO_STORE,
        )
    secret, binder = await oauth.begin(
        db, client, redirect_uri, challenge, state, asked, settings, lang,
        ratelimit.client_address(request),
    )
    return _html(page.email_step(lang, secret, client.name), binder=binder)


async def _request(request: Request, form: dict[str, str]):
    """The live sign-in request for this browser, and its client; or None."""
    db = request.app.state.db
    found = await oauth.load(db, form.get("req", ""), request.cookies.get(COOKIE, ""))
    if found is None:
        return None, None
    try:
        client = await clients.lookup(db, found.client_id)
    except clients.ClientError:
        return None, None
    return found, client


def _expired(lang: str = "en") -> HTMLResponse:
    return _html(page.error_page(lang, page.COPY[lang]["expired"]), 400)


@router.post("/authorize/email")
async def step_email(request: Request) -> Response:
    form = await _form(request)
    req, client = await _request(request, form)
    if req is None:
        return _expired()
    db = request.app.state.db
    email = auth.clean_email(form.get("email", ""))
    if "@" not in email or len(email) > 200:
        return _html(page.email_step(req.lang, form["req"], client.name,
                                     page.COPY[req.lang]["wrong_code"]), 400)
    try:
        await _limit(request, "code-address", ratelimit.CODES_PER_ADDRESS)
        code = await auth.request_code(db, email)
    except HTTPException as error:
        return _html(page.error_page(req.lang, "Too many attempts. Try again later."),
                     error.status_code)
    except auth.TooManyCodes as error:
        return _html(page.error_page(req.lang, str(error)), 429)
    await oauth.set_email(db, req.id, email)
    settings = get_settings()
    if code is not None and mail.configured():
        subject, text, html = mail.sign_in_message(code, auth.CODE_MINUTES)
        try:
            await mail.send(email, subject, text, html)
        except mail.MailError:
            return _html(page.error_page(
                req.lang, "The code could not be emailed. Try again in a minute."), 503)
    elif code is not None and settings.env != "local":
        log.error("a connector sign-in code was made but no email provider is configured")
        return _html(page.error_page(req.lang, "Sign-in codes cannot be delivered yet."), 503)
    # The same page whether or not the address has an account, so the form tells nobody who does.
    dev = code if settings.env == "local" else None
    return _html(page.code_step(req.lang, form["req"], email, dev_code=dev))


async def _after_code(request: Request, req, client, form_req: str) -> Response:
    db = request.app.state.db
    shops = await oauth.businesses_of(db, req.user_id)
    if not shops:
        return _html(page.error_page(req.lang, page.COPY[req.lang]["no_business"]), 400)
    if len(shops) == 1:
        return await _consent(request, req, client, form_req, shops[0])
    return _html(page.shop_step(
        req.lang, form_req, client.name,
        [(str(s.id), (s.name_ar if req.lang == "ar" and s.name_ar else s.name), s.role)
         for s in shops],
    ))


async def _consent(request: Request, req, client, form_req: str, business, error: str | None = None
                   ) -> Response:
    enabled, paused = await oauth.opt_in_state(request.app.state.db, business.id)
    c = page.COPY[req.lang]
    if paused:
        return _html(page.error_page(req.lang, c["paused"]), 403)
    if not enabled and business.role != "owner":
        return _html(page.error_page(req.lang, c["owner_must"]), 403)
    name = business.name_ar if req.lang == "ar" and business.name_ar else business.name
    return _html(page.consent_step(
        req.lang, form_req, client=client.name, client_host=client.host, shop_name=name,
        tenant_id=str(business.id), scope_list=req.scopes, redirect_uri=req.redirect_uri,
        needs_opt_in=not enabled, error=error,
    ))


@router.post("/authorize/code")
async def step_code(request: Request) -> Response:
    form = await _form(request)
    req, client = await _request(request, form)
    if req is None:
        return _expired()
    if not req.email:
        return _expired(req.lang)
    db = request.app.state.db
    try:
        await _limit(request, "guess-address", ratelimit.GUESSES_PER_ADDRESS)
    except HTTPException as error:
        return _html(page.error_page(req.lang, "Too many attempts. Try again later."),
                     error.status_code)
    try:
        await auth.check_code(db, req.email, form.get("code", ""))
    except auth.AuthError:
        return _html(page.code_step(req.lang, form["req"], req.email,
                                    page.COPY[req.lang]["wrong_code"]), 400)
    user_id = await oauth.mark_verified(db, req.id, req.email)
    if user_id is None:
        return _html(page.error_page(req.lang, page.COPY[req.lang]["no_business"]), 400)
    verified = await oauth.load(db, form["req"], request.cookies.get(COOKIE, ""))
    return await _after_code(request, verified, client, form["req"])


async def _chosen(request: Request, form: dict[str, str]):
    """The verified request, its client, and the business the person chose (they must belong to
    it: the form value is never trusted)."""
    req, client = await _request(request, form)
    if req is None or not req.verified or req.user_id is None:
        return None, None, None
    try:
        wanted = UUID(form.get("tenant_id", ""))
    except ValueError:
        return req, client, None
    for business in await oauth.businesses_of(request.app.state.db, req.user_id):
        if business.id == wanted:
            return req, client, business
    return req, client, None


@router.post("/authorize/shop")
async def step_shop(request: Request) -> Response:
    form = await _form(request)
    req, client, business = await _chosen(request, form)
    if req is None:
        return _expired()
    if business is None:
        return _html(page.error_page(req.lang, page.COPY[req.lang]["not_member"]), 403)
    return await _consent(request, req, client, form["req"], business)


@router.post("/authorize/consent")
async def step_consent(request: Request) -> Response:
    form = await _form(request)
    req, client, business = await _chosen(request, form)
    if req is None:
        return _expired()
    settings = get_settings()
    c = page.COPY[req.lang]
    if form.get("decision") == "deny":
        async with request.app.state.db.unscoped() as conn:
            await conn.execute(
                "update mcp_auth_requests set used_at = now() where id = $1", req.id)
        response = RedirectResponse(oauth.deny(req, settings), status_code=303, headers=NO_STORE)
        response.delete_cookie(COOKIE, path="/oauth")
        return response
    if business is None:
        return _html(page.error_page(req.lang, c["not_member"]), 403)
    try:
        target = await oauth.approve(
            request.app.state.db, req, client, business.id,
            opted_in=form.get("opt_in") == "yes", settings=settings,
        )
    except oauth.ConsentError as error:
        message = c[page.CONSENT_MESSAGES.get(error.code, "expired")]
        if error.code == "opt_in_needed":
            return await _consent(request, req, client, form["req"], business, message)
        return _html(page.error_page(req.lang, message), 403)
    response = RedirectResponse(target, status_code=303, headers=NO_STORE)
    response.delete_cookie(COOKIE, path="/oauth")
    return response


# ── Tokens (RFC 6749, RFC 7009) ────────────────────────────────────────────────────────────────


@router.post("/token")
async def token(request: Request) -> Response:
    try:
        await _limit(request, "mcp-token", TOKEN_PER_ADDRESS)
    except HTTPException as error:
        return JSONResponse(
            {"error": "slow_down", "error_description": "too many requests"},
            status_code=error.status_code, headers={**NO_STORE, **(error.headers or {})},
        )
    form = await _form(request)
    settings = get_settings()
    db = request.app.state.db
    grant = form.get("grant_type", "")
    try:
        if grant == "authorization_code":
            if not all(form.get(k) for k in ("code", "client_id", "redirect_uri", "code_verifier")):
                raise oauth.OAuthError("invalid_request", "code, client_id, redirect_uri and "
                                       "code_verifier are required")
            made = await oauth.exchange_code(
                db, code=form["code"], client_id=form["client_id"],
                redirect_uri=form["redirect_uri"], verifier=form["code_verifier"],
                asked_resource=form.get("resource"), settings=settings,
            )
        elif grant == "refresh_token":
            if not form.get("refresh_token") or not form.get("client_id"):
                raise oauth.OAuthError("invalid_request", "refresh_token and client_id are "
                                       "required")
            made = await oauth.refresh(
                db, refresh_token=form["refresh_token"], client_id=form["client_id"],
                asked_scope=form.get("scope"),
            )
        else:
            raise oauth.OAuthError("unsupported_grant_type", "use authorization_code or "
                                   "refresh_token")
    except oauth.OAuthError as error:
        return _json_error(error)
    return JSONResponse(made, headers=NO_STORE)


@router.post("/revoke")
async def revoke(request: Request) -> Response:
    form = await _form(request)
    await oauth.revoke_token(request.app.state.db, form.get("token", ""))
    return Response(status_code=200, headers=NO_STORE)

