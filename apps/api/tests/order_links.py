"""The signed token a customer's link carries (core/links.py), for tests that order or book as
a customer. The demo shop's by default; pass `tenant_id` for another shop."""

from uuid import UUID

from alyr.core import links
from alyr.seed import DEMO_TENANT_ID


def token(contact_id, tenant_id=DEMO_TENANT_ID, **more) -> str:
    """An order link's token."""
    return links.mint(UUID(str(tenant_id)), UUID(str(contact_id)), purpose=links.ORDER, **more)


def booking_token(contact_id, tenant_id=DEMO_TENANT_ID, **more) -> str:
    """A booking link's token: it opens the booking page, and an order token does not."""
    return links.mint(UUID(str(tenant_id)), UUID(str(contact_id)), purpose=links.BOOKING, **more)
