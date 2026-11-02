"""The model provider: Anthropic's Messages API with structured outputs, and a simulator.

Checked against Anthropic's documentation on 2 Nov 2026:
https://platform.claude.com/docs/en/build-with-claude/structured-outputs.md and
https://platform.claude.com/docs/en/api/messages/create.md. A request is `POST /v1/messages` with
`x-api-key` and `anthropic-version: 2023-06-01`; the schema goes in `output_config.format`
(`{"type": "json_schema", "schema": ...}`, no beta header); the answer is JSON text in the first
`text` content block; `stop_reason` "refusal" or "max_tokens" means the text may not match the
schema; `usage.input_tokens` and `usage.output_tokens` are what is billed.

Nothing here decides what is sent: `outreach/llm.py` strips personal data, checks the spend cap,
calls `complete`, and validates the answer against the schema.
"""

import json
import re
from dataclasses import dataclass, field

import httpx

API_URL = "https://api.anthropic.com/v1/messages"
API_VERSION = "2023-06-01"
TIMEOUT_SECONDS = 90.0


class ModelError(Exception):
    """The model could not give a usable answer (refused, cut off, not JSON, unreachable).
    The message is short and never holds the prompt."""


class NotConfigured(Exception):
    """A provider whose settings are missing. It refuses; it never falls back to anything."""


@dataclass
class Completion:
    data: dict
    input_tokens: int
    output_tokens: int


class AnthropicLLM:
    name = "anthropic"

    def __init__(self, api_key: str, transport: httpx.AsyncBaseTransport | None = None) -> None:
        self._key = api_key
        self._transport = transport

    async def complete(
        self, *, model: str, system: str, user: str, schema: dict, max_tokens: int,
        role: str = "",
    ) -> Completion:
        body = {
            "model": model,
            "max_tokens": max_tokens,
            "system": system,
            "messages": [{"role": "user", "content": user}],
            "output_config": {"format": {"type": "json_schema", "schema": schema}},
        }
        try:
            async with httpx.AsyncClient(
                timeout=TIMEOUT_SECONDS, transport=self._transport, trust_env=True
            ) as client:
                response = await client.post(API_URL, json=body, headers={
                    "x-api-key": self._key, "anthropic-version": API_VERSION,
                    "content-type": "application/json",
                })
        except httpx.HTTPError as error:
            raise ModelError(f"unreachable: {type(error).__name__}") from error
        if response.status_code != 200:
            kind = ""
            try:
                kind = response.json().get("error", {}).get("type", "")
            except ValueError:
                pass
            raise ModelError(f"HTTP {response.status_code} {kind}".strip())
        answer = response.json()
        stop = answer.get("stop_reason")
        if stop in ("refusal", "max_tokens", "model_context_window_exceeded"):
            raise ModelError(f"stopped: {stop}")
        text = next((b.get("text", "") for b in answer.get("content", [])
                     if b.get("type") == "text"), "")
        try:
            data = json.loads(text)
        except ValueError as error:
            raise ModelError("the answer was not JSON") from error
        usage = answer.get("usage") or {}
        return Completion(data, int(usage.get("input_tokens") or 0),
                          int(usage.get("output_tokens") or 0))


class ClosedLLM:
    name = "closed"

    async def complete(self, **_: object) -> Completion:
        raise NotConfigured("ALYR_ANTHROPIC_API_KEY is not set")


_PAGE = re.compile(r"<<<PAGE url=(\S+)>>>\n(.*?)\n<<<END PAGE>>>", re.S)
_SENTENCE = re.compile(r"[^.!?\n]{20,200}[.!?]")
_CLAIM = re.compile(r"\[(c\d+)\] (.+)")


@dataclass
class SimulatedLLM:
    """Answers every role with something plausible built from what it was given, and keeps every
    payload it received (`calls`) so a test can prove what the model was shown. A test can set
    `answers[role]` to a dict, or to a function of the user text, to answer differently."""

    name: str = "simulator"
    calls: list[dict] = field(default_factory=list)
    answers: dict = field(default_factory=dict)

    async def complete(
        self, *, model: str, system: str, user: str, schema: dict, max_tokens: int,
        role: str = "",
    ) -> Completion:
        self.calls.append({"role": role, "model": model, "system": system, "user": user,
                           "schema": schema})
        override = self.answers.get(role)
        if callable(override):
            data = override(user)
        elif override is not None:
            data = override
        else:
            data = self._default(role, user)
        return Completion(data, len(user) // 4, 200)

    @staticmethod
    def _default(role: str, user: str) -> dict:
        if role == "scout":
            rows = re.findall(r"^\[(\d+)\] (.+?) \| (\S+)$", user, re.M)
            return {"candidates": [
                {"index": int(i), "company": title.strip()[:120], "website": url,
                 "business_type": "shop", "keep": True} for i, title, url in rows]}
        if role == "researcher":
            claims = []
            for url, text in _PAGE.findall(user):
                for sentence in _SENTENCE.findall(text)[:2]:
                    quote = sentence.strip()
                    claims.append({"id": f"c{len(claims) + 1}", "text": quote, "url": url,
                                   "quote": quote})
            return {"business_type": "shop", "summary": "A business with its own website.",
                    "claims": claims[:6]}
        if role == "qualifier":
            return {"fit_score": 70, "reason": "Sells to customers who message it."}
        if role == "composer":
            found = _CLAIM.findall(user)
            first = found[0][0] if found else "c1"
            second = found[1][0] if len(found) > 1 else first
            return {"subject": "A question about your orders", "steps": [
                {"step": 1, "sentences": [
                    {"text": "I read your website and saw how you take orders.", "kind": "fact",
                     "claims": [first]},
                    {"text": "ALYR helps a shop answer and take orders on WhatsApp.",
                     "kind": "offer", "claims": []},
                    {"text": "Would a short call next week be useful?", "kind": "ask",
                     "claims": []}]},
                {"step": 2, "sentences": [
                    {"text": "I wrote last week about how you take orders.", "kind": "fact",
                     "claims": [second]},
                    {"text": "Is it worth a short call?", "kind": "ask", "claims": []}]},
                {"step": 3, "sentences": [
                    {"text": "This is my last note on this.", "kind": "other", "claims": []},
                    {"text": "If the timing is wrong, I understand.", "kind": "other",
                     "claims": []}]},
            ]}
        if role == "critic":
            return {"findings": [{"key": k, "ok": True, "note": "fine"} for k in
                                 ("rests_on_brief", "short_plain", "true_to_offer")],
                    "unsupported_sentences": []}
        if role == "reader":
            label = "interested" if re.search(r"\b(yes|sure|interested|call)\b", user, re.I) \
                else "other"
            return {"labels": [label], "confidence": 0.9 if label == "interested" else 0.5,
                    "return_date": ""}
        if role == "concierge":
            return {"sentences": ["Thank you for your reply.",
                                  "Please pick a time that suits you."]}
        if role == "test":
            return {"word": "ok"}
        raise ModelError(f"the simulator has no answer for {role!r}")
