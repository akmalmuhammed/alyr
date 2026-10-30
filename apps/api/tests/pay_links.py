"""A payment link as a customer gets it (SEC-8, D-080): `/pay/<shop>?t=<token>`, the token signed
for the pay page and one payment. The pay page sends the token in a header, and so do these."""

import re

PAY = re.compile(r"/pay/([a-z0-9-]+)\?t=([\w.-]+)")


def pay_link(text: str) -> tuple[str, str]:
    """The shop and the token of the first payment link in a message or an address."""
    found = PAY.search(text)
    assert found, f"no payment link in {text!r}"
    return found.group(1), found.group(2)


def pay_page(client, text: str):
    """The pay page's answer for the payment link in `text`."""
    slug, token = pay_link(text)
    return client.get(f"/api/pay/{slug}", headers={"x-order-link": token})


def pay(client, text: str):
    """Pay the stand-in by the payment link in `text`, as its Pay button does."""
    slug, token = pay_link(text)
    return client.post(f"/api/pay/{slug}/complete", headers={"x-order-link": token})
