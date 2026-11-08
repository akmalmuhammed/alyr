"""A refusal a person can act on: a code to program against, and the words in both languages.

The routes answer them as `{detail, code, message_ar, ...}`, the shape the other modules use.
"""

from alyr.modules.discovery.words import ERRORS


class DiscoveryError(Exception):
    """Something that cannot be done. `code` is a key of `words.ERRORS`, `status` the HTTP status
    and `extra` is shown beside the words (how long to wait, the limit that was hit)."""

    def __init__(self, code: str, status: int = 422, **extra: object) -> None:
        self.code, self.status, self.extra = code, status, extra
        self.en, self.ar = ERRORS[code]
        super().__init__(self.en)
