"""Check packs (Discovery 2.0): which rules a business is checked against, chosen by what kind of
business it is. The packs are data (`data.py`); `registry.py` reads and checks them; `store.py`
keeps the business's choice; `service.py` holds the actions behind `/api/discovery/packs` and
`/api/discovery/pack`. The engine (`engine.py`) builds the one registry in use."""

from alyr.modules.discovery import words as _words
from alyr.modules.discovery.packs import words as _pack_words
from alyr.modules.discovery.packs.data import BUSINESS_TYPES, FIRST_PARTY, PACKS
from alyr.modules.discovery.packs.registry import (
    Pack,
    PackError,
    Registry,
    Selection,
    Trade,
    allowed_writes,
    pack_of,
    tally,
)

_words.ERRORS.update(_pack_words.ERRORS)
_words.STEP_SUMMARIES.update(_pack_words.STEP)

__all__ = [
    "BUSINESS_TYPES",
    "FIRST_PARTY",
    "PACKS",
    "Pack",
    "PackError",
    "Registry",
    "Selection",
    "Trade",
    "allowed_writes",
    "pack_of",
    "tally",
]
