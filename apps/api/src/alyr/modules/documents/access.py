"""Who may do what with documents.

Follows the Catalog's pattern (`modules/items/access.py`): owners and admins can do everything;
the shop's own setting decides what an agent may add to that.

* **Settings, numbering, credit notes and cancellations: owners and admins only.** A credit
  note changes what a customer owes, and the settings decide what every document says.
* **Drafts: anyone on the team.** A person edits and discards the drafts they made; an owner
  or admin any. An agent's list shows the documents they made, not the shop's takings.
* **Issuing: owners and admins always; an agent only when the shop has allowed it**
  (`document_settings.agents_may_issue`, off to start), and only a draft they made.
* **Reading and printing an issued document: its maker, and owners and admins.**

The API enforces this; the screens will hide what the signed-in person cannot use.
"""

import asyncpg

from alyr import catalog
from alyr.core.auth import Staff
from alyr.modules.documents.errors import DocumentError


def is_manager(staff: Staff) -> bool:
    return staff.role in catalog.MANAGERS


def require_manager(staff: Staff) -> None:
    if not is_manager(staff):
        raise DocumentError("not_allowed", 403)


async def agents_may_issue(conn: asyncpg.Connection) -> bool:
    return bool(await conn.fetchval("select agents_may_issue from document_settings"))


async def require_issue(conn: asyncpg.Connection, staff: Staff) -> None:
    if is_manager(staff):
        return
    if not await agents_may_issue(conn):
        raise DocumentError("cannot_issue", 403)


def owns(staff: Staff, created_by_user) -> bool:
    """Whether this person made the document. The open local demo has no user, and its
    owner role passes before this is asked."""
    return staff.user_id is not None and staff.user_id == created_by_user


def require_own_or_manager(staff: Staff, created_by_user) -> None:
    if not is_manager(staff) and not owns(staff, created_by_user):
        raise DocumentError("not_allowed", 403)


async def view(conn: asyncpg.Connection, staff: Staff) -> dict:
    """What the screens need to know about the person: which controls to show."""
    manager = is_manager(staff)
    return {
        "role": staff.role,
        "can_manage": manager,
        "can_issue": manager or await agents_may_issue(conn),
        "can_draft": True,
        "can_credit": manager,
        # Recording a payment taken by hand (ALY-139): an agent only when the shop allows it.
        "can_record_payments": manager or bool(await conn.fetchval(
            "select agents_may_record_payments from document_settings")),
    }
