"""A refusal a person can act on: a code to program against, and the words in both languages."""

from alyr.modules.documents.words import ERRORS


class DocumentError(Exception):
    """Something about a document that cannot be done. `code` names it (a key of
    `words.ERRORS`), `status` is the HTTP status a route answers with and `extra` is shown to
    the client beside the words (the field that was wrong, the number that clashed)."""

    def __init__(self, code: str, status: int = 422, **extra: object) -> None:
        self.code, self.status, self.extra = code, status, extra
        self.en = ERRORS[code].en
        self.ar = ERRORS[code].ar
        super().__init__(self.en)
