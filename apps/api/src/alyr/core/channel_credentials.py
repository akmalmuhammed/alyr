"""Which token the Meta channel sends with (ALY-39, spec 063, D-149).

ALYR's own system-user token serves every number on ALYR's own WhatsApp account. A business that
connected its own account (Embedded Signup) has a token of its own, sealed in `channel_credentials`
(`core/channel_keys.py`). The channel asks this for the number or account a call is about, before
every call; the answer is the shop's token, or None for ALYR's.

The question comes with no business in hand (a webhook, a job, the worker's poll), so the lookup is
a database function that answers for any number ID or account ID (migration 0108); what it returns
is still sealed, and the key that opens it is in Secret Manager, not the database. Answers are kept
in memory for five minutes so a send does not cost a query; `forget` drops them when credentials
change. A token that cannot be opened (the key was changed) is logged without a value and answered
as None: the call then goes with ALYR's token and Meta refuses it, which the line check shows.
"""

import logging
import time

from alyr.core import channel_keys
from alyr.db import Database

log = logging.getLogger("alyr.channel_credentials")

KEEP_SECONDS = 300


class Credentials:
    def __init__(self, db: Database) -> None:
        self._db = db
        self._seen: dict[str, tuple[float, str | None]] = {}

    async def token_for(self, ident: str) -> str | None:
        """A shop's own token for this number or account ID, or None."""
        kept = self._seen.get(ident)
        if kept is not None and time.monotonic() - kept[0] < KEEP_SECONDS:
            return kept[1]
        async with self._db.unscoped() as conn:
            row = await conn.fetchrow("select * from channel_credential_for($1)", ident)
        token = None
        if row is not None:
            try:
                secret = channel_keys.unseal(row["tenant_id"], row["number_id"], row["sealed"])
                token = secret["token"]
            except (channel_keys.Unreadable, channel_keys.KeyMissing, KeyError):
                log.error("a business's own WhatsApp token cannot be opened; is the key the same?")
        self._seen[ident] = (time.monotonic(), token)
        return token

    def forget(self) -> None:
        self._seen.clear()
