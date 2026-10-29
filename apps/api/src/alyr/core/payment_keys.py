"""A payment account's keys, sealed (ALY-17, specs/033-payment-adapters).

The keys a shop pastes from its payment provider can take money out of its account (refunds),
so they are never stored as they were typed. Each set is sealed with AES-256-GCM under
`ALYR_PAYMENT_KEYS_KEY`, with the shop's ID and the account's ID bound in: a sealed value
copied to another row or another shop does not open. A sealed value is a version byte, the
12-byte nonce, then the ciphertext and its tag.

Keys are never logged, never returned by the API and never put in a job's payload.
"""

import base64
import json
import os
from uuid import UUID

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from alyr.config import Settings, get_settings

VERSION = b"\x01"
CONTEXT = b"alyr-payment-keys-v1"
NONCE_BYTES = 12
# A developer machine's key. It is in the repository, so it protects nothing: it only lets
# the simulator gateway run without setup.
DEV_KEY = base64.b64encode(b"alyr-local-payment-keys-dev-only").decode()


class KeysKeyMissing(Exception):
    """`ALYR_PAYMENT_KEYS_KEY` is not set (or not 32 bytes) where it must be."""


class KeysUnreadable(Exception):
    """A sealed value that does not open: another key, another row, or changed."""


def _key(settings: Settings | None = None) -> bytes:
    settings = settings or get_settings()
    value = settings.payment_keys_key or (DEV_KEY if settings.env == "local" else "")
    try:
        key = base64.b64decode(value, validate=True)
    except ValueError:
        key = b""
    if len(key) != 32:
        raise KeysKeyMissing("ALYR_PAYMENT_KEYS_KEY must be 32 random bytes, base64")
    return key


def ready(settings: Settings | None = None) -> bool:
    try:
        _key(settings)
    except KeysKeyMissing:
        return False
    return True


def _context(tenant_id: UUID, account_id: UUID) -> bytes:
    return CONTEXT + tenant_id.bytes + account_id.bytes


def seal(tenant_id: UUID, account_id: UUID, keys: dict[str, str]) -> bytes:
    nonce = os.urandom(NONCE_BYTES)
    plain = json.dumps(keys, separators=(",", ":"), sort_keys=True).encode()
    return VERSION + nonce + AESGCM(_key()).encrypt(nonce, plain, _context(tenant_id, account_id))


def unseal(tenant_id: UUID, account_id: UUID, sealed: bytes) -> dict[str, str]:
    sealed = bytes(sealed)
    if not sealed.startswith(VERSION) or len(sealed) <= 1 + NONCE_BYTES:
        raise KeysUnreadable("not a sealed value")
    nonce, body = sealed[1:1 + NONCE_BYTES], sealed[1 + NONCE_BYTES:]
    try:
        plain = AESGCM(_key()).decrypt(nonce, body, _context(tenant_id, account_id))
    except InvalidTag:
        raise KeysUnreadable("the sealed keys do not open") from None
    return json.loads(plain)


def hint(value: str) -> str:
    """The last four characters, for telling two sets of keys apart."""
    return value[-4:] if len(value) >= 8 else ""
