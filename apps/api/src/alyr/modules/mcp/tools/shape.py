"""How what an action returns is shaped for the owner's app (spec 067, the data minimum, D-170).

An action returns its whole answer, as the workspace needs it. A tool's `present` is the one place
that decides what the app may see of it: a customer is a first name (marked as written by the
customer) and the last three digits of their number, money is an amount with its currency, and
nothing a customer wrote goes out except through `safety.untrusted`.
"""

from alyr.core.normalise import fmt_qar, fmt_qar_ar
from alyr.modules.mcp import safety


def money(dirhams: int | None) -> dict | None:
    """An amount in dirhams (1 QAR is 100) with its currency, written the way each language
    writes it. None stays None, so a person who may not see money gets no figure at all."""
    if dirhams is None:
        return None
    whole, part = divmod(abs(dirhams), 100)
    sign = "-" if dirhams < 0 else ""
    return {
        "qar": f"{sign}{whole}.{part:02d}",
        "text": fmt_qar(dirhams),
        "text_ar": fmt_qar_ar(dirhams),
    }


def who(name, phone=None) -> dict:
    """A customer: first name (data, marked) and the last three digits of the number."""
    return safety.person(name, phone)


def plain_text(value) -> str:
    """A word the business wrote (an item, a service) with hidden and reordering characters taken
    out. Not a customer's text, so it is not marked; it is cleaned all the same."""
    return safety.clean(value)


def keep(data: dict, *keys: str) -> dict:
    """Only these keys of `data`, when present."""
    return {k: data[k] for k in keys if k in data}
