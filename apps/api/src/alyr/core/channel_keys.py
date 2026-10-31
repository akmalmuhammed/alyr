"""A shop's own WhatsApp access token, sealed (ALY-39, spec 063, D-149).

Numbers on ALYR's own WhatsApp account use one system-user token that lives in Secret Manager and
is never in the database. A shop that connects its **own** account through Embedded Signup gets a
token of its own from Meta: it can send and read for that shop's account and nothing else, and it is
the one secret ALYR must hold for each such shop. It is stored the way a shop's payment keys are
(`core/payment_keys.py`): sealed with AES-256-GCM under `ALYR_CHANNEL_KEYS_KEY`, a key that is
itself in Secret Manager (in Doha) and never in the database, with the shop's ID and the number's
ID bound in, so a sealed value copied to another row or another shop does not open. A sealed value
is a version byte, the 12-byte nonce, then the ciphertext and its tag.

The token is never logged, never returned by the API and never put in a job's payload. What is
sealed is a small JSON object: the token and, for a number registered with a PIN, the PIN (Meta's
two-step verification PIN, needed again to register the number anew).
"""

import base64
import json
import os
from uuid import UUID

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from alyr.config import Settings, get_settings

VERSION = b"\x01"
CONTEXT = b"alyr-channel-keys-v1"
NONCE_BYTES = 12
# A developer machine's key. It is in the repository, so it protects nothing: it only lets Embedded
# Signup be tried locally against a fake Meta.
DEV_KEY = base64.b64encode(b"alyr-local-channel-keys-dev-only").decode()


class KeyMissing(Exception):
    """`ALYR_CHANNEL_KEYS_KEY` is not set (or not 32 bytes) where it must be."""


class Unreadable(Exception):
    """A sealed value that does not open: another key, another row, or changed."""


def _key(settings: Settings | None = None) -> bytes:
    settings = settings or get_settings()
    value = settings.channel_keys_key or (DEV_KEY if settings.env == "local" else "")
    try:
        key = base64.b64decode(value, validate=True)
    except ValueError:
        key = b""
    if len(key) != 32:
        raise KeyMissing("ALYR_CHANNEL_KEYS_KEY must be 32 random bytes, base64")
    return key


def ready(settings: Settings | None = None) -> bool:
    try:
        _key(settings)
    except KeyMissing:
        return False
    return True


def _context(tenant_id: UUID, number_id: str) -> bytes:
    return CONTEXT + tenant_id.bytes + number_id.encode()


def seal(tenant_id: UUID, number_id: str, secret: dict[str, str]) -> bytes:
    nonce = os.urandom(NONCE_BYTES)
    plain = json.dumps(secret, separators=(",", ":"), sort_keys=True).encode()
    return VERSION + nonce + AESGCM(_key()).encrypt(nonce, plain, _context(tenant_id, number_id))


def unseal(tenant_id: UUID, number_id: str, sealed: bytes) -> dict[str, str]:
    sealed = bytes(sealed)
    if not sealed.startswith(VERSION) or len(sealed) <= 1 + NONCE_BYTES:
        raise Unreadable("not a sealed value")
    nonce, body = sealed[1:1 + NONCE_BYTES], sealed[1 + NONCE_BYTES:]
    try:
        plain = AESGCM(_key()).decrypt(nonce, body, _context(tenant_id, number_id))
    except InvalidTag:
        raise Unreadable("the sealed token does not open") from None
    return json.loads(plain)


def hint(value: str) -> str:
    """The last four characters, for telling two tokens apart without showing one."""
    return value[-4:] if len(value) >= 8 else ""
