"""Text that cannot be saved is refused at the door (pen test, 25 Nov: F-07, F-08).

PostgreSQL cannot store a NUL character in text, and a lone half of a UTF-16 surrogate pair
cannot be written as UTF-8, so either one deep in a route used to end as a bare 500 after work
had started (a PDF half drawn, a transaction opened). This refuses both before any route runs,
with a 422 that says what is wrong: in a JSON body (keys and values, at any depth), in the path
and in the query string. Emoji and Arabic are whole characters and pass; so does a JSON body
that is not valid JSON, which the route answers as it always has.

Only JSON bodies are read here, and not those posted to /webhooks/. A file upload (a
spreadsheet, a photo) has its own checks.
"""

import json
import re

from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Message, Receive, Scope, Send

WITH_BODY = {"POST", "PUT", "PATCH", "DELETE"}
REFUSAL = (
    "The text has a character that cannot be saved (an invisible control character or half of "
    "an emoji). Remove it and try again."
)
REFUSAL_AR = "في النص حرف لا يمكن حفظه (حرف تحكم غير مرئي أو نصف رمز تعبيري). احذفه وحاول مرة أخرى."
# Cheap look at the raw bytes first: only a body that may hold either is parsed here.
MAYBE = re.compile(rb"\\u(?:0000|d[89a-f][0-9a-f]{2})", re.IGNORECASE)


def unsavable(value: object) -> bool:
    """Whether any string in a parsed JSON value holds a NUL or a lone surrogate."""
    if isinstance(value, str):
        if "\x00" in value:
            return True
        try:
            value.encode("utf-8")
        except UnicodeEncodeError:
            return True
        return False
    if isinstance(value, dict):
        return any(unsavable(key) or unsavable(item) for key, item in value.items())
    if isinstance(value, list):
        return any(unsavable(item) for item in value)
    return False


def _body_unsavable(body: bytes) -> bool:
    if not MAYBE.search(body):
        return False
    try:
        return unsavable(json.loads(body))
    except ValueError:
        return False


def _is_json(scope: Scope) -> bool:
    for name, value in scope.get("headers", []):
        if name == b"content-type":
            return b"json" in value.lower()
    return False


class RefuseUnsavableText:
    """ASGI middleware: answer 422 to a request whose text could not be stored."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        if "\x00" in scope["path"] or b"%00" in scope.get("query_string", b"").lower():
            await self._refuse(scope, receive, send)
            return
        # What Meta and payment providers post (a customer's message, a payment) is not refused
        # here: a 422 would only make them send it again and again. Its route decides.
        if (
            scope["method"] not in WITH_BODY
            or not _is_json(scope)
            or scope["path"].startswith("/webhooks/")
        ):
            await self.app(scope, receive, send)
            return
        chunks: list[bytes] = []
        while True:
            message = await receive()
            if message["type"] == "http.disconnect":
                return
            chunks.append(message.get("body", b""))
            if not message.get("more_body", False):
                break
        body = b"".join(chunks)
        if _body_unsavable(body):
            await self._refuse(scope, receive, send)
            return

        replayed = False

        async def replay() -> Message:
            nonlocal replayed
            if not replayed:
                replayed = True
                return {"type": "http.request", "body": body, "more_body": False}
            return await receive()

        await self.app(scope, replay, send)

    @staticmethod
    async def _refuse(scope: Scope, receive: Receive, send: Send) -> None:
        response = JSONResponse(
            {"detail": {"code": "unsavable_text", "message": REFUSAL, "message_ar": REFUSAL_AR}},
            422,
        )
        await response(scope, receive, send)
