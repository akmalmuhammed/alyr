"""Random secrets and how they are kept (spec 067, "Tokens").

Every code and token is 256 bits from `secrets`, shown once and stored only as its SHA-256 (a
random 256-bit value needs no slow hash; sign-in codes, sessions and API keys are kept the same
way) and compared in constant time. The prefix says what a value is for, so a code cannot be
presented as a token and a log line can be recognised; it carries no meaning for security.
"""

import hashlib
import hmac
import secrets

CODE, ACCESS, REFRESH, CONFIRM, REQUEST, BINDER = (
    "alyr_mcp_ac_", "alyr_mcp_at_", "alyr_mcp_rt_", "alyr_mcp_cf_", "alyr_mcp_rq_", "alyr_mcp_bd_",
)
CLIENT = "alyr_mcp_c_"


def new(prefix: str) -> str:
    return prefix + secrets.token_urlsafe(32)


def digest(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def same(a: str, b: str) -> bool:
    return hmac.compare_digest(a.encode(), b.encode())


def looks_like(prefix: str, value: str) -> bool:
    return value.startswith(prefix) and 43 <= len(value) - len(prefix) <= 44 and all(
        c.isalnum() or c in "-_" for c in value[len(prefix):]
    )
