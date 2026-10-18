"""The signed token a customer's order link carries (core/links.py), for tests that order as a
customer. The demo shop's by default; pass `tenant_id` for another shop."""

from uuid import UUID

from alyr.core import links
from alyr.seed import DEMO_TENANT_ID


def token(contact_id, tenant_id=DEMO_TENANT_ID, **more) -> str:
    return links.mint(UUID(str(tenant_id)), UUID(str(contact_id)), **more)
