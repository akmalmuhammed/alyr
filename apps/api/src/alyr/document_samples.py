"""The sample documents Meta reviews the document templates with (ALY-139).

WhatsApp asks for an example of the header when a template that opens with a document is
created. These are the fictional Qirfa Bakery's receipt, invoice and credit note, one PDF in each
language, drawn by the documents engine from `render/sample.py`: nothing here is anyone's. They
are drawn when they are needed (`templates_sync` asks for them) and are not kept in the
repository, so there is no binary file to go stale or to be mistaken for someone's paperwork.

    uv run python -m alyr.document_samples <folder>     # write them, to look at

The same input gives the same bytes (the engine is deterministic), so a sample is always what
the engine draws today.
"""

import sys
from functools import lru_cache
from pathlib import Path

from alyr.modules.documents import render
from alyr.modules.documents.render.context import Bi
from alyr.modules.documents.render.sample import sample_doc

NUMBERS = {"receipt": "RC-0042", "invoice": "INV-0017", "credit_note": "CN-0003"}


@lru_cache(maxsize=1)
def draw_all() -> dict[str, bytes]:
    """{file name: PDF bytes} for every template sample, in English and in Arabic."""
    out = {}
    for kind, number in NUMBERS.items():
        for lang in ("en", "ar"):
            extra = {}
            if kind == "credit_note":
                extra = {"related_title": Bi(ar="فاتورة", en="Invoice"),
                         "related_number": NUMBERS["invoice"], "reason": "Goods returned"}
            doc = sample_doc(kind, (lang,), "a4", number=number, **extra)
            out[f"{kind}.{lang}.pdf"] = render.render(doc)
    return out


def main(folder: str) -> None:
    out = Path(folder)
    out.mkdir(parents=True, exist_ok=True)
    for name, data in draw_all().items():
        (out / name).write_bytes(data)
        print(f"wrote {out / name} ({len(data):,} bytes)")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("usage: python -m alyr.document_samples <folder>")
    main(sys.argv[1])
