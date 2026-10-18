"""One set of actions behind every door (ALY-130, decision D-040).

An owner can ask ALYR about the shop, and later change it, from the workspace or from
WhatsApp. Both call the same action here, so who may do what, which modules must be on,
and the record of who did it are written once. An action takes who is asking (a
`Caller`: a person, their role and the door they came through) and returns plain data. How
that data is worded for WhatsApp lives with the chat commands (`modules/owner/chat.py`);
the workspace gets the data as it is.

Reads are not put on the activity record (they would bury it). Every change an action
makes in later phases must be, with `Caller.channel`.
"""

from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from uuid import UUID

import asyncpg

from alyr.core import team

OWNER = "owner"
ADMIN = "admin"
AGENT = "agent"
ALL_ROLES = frozenset({OWNER, ADMIN, AGENT})
# Who may see what the shop earns or is owed (D-035: agents see no money).
MONEY_ROLES = frozenset({OWNER, ADMIN})


class ActionError(Exception):
    """An action that cannot be carried out; the message is safe to show."""


class NotAllowed(ActionError):
    """The caller's role does not allow this action."""


class NotSwitchedOn(ActionError):
    """The shop has not switched on the module this action belongs to."""


@dataclass(frozen=True)
class Caller:
    """Who is asking. `user_id` is None only in the open local demo."""

    user_id: UUID | None
    name: str
    role: str
    channel: str  # "portal" or "whatsapp"

    @property
    def sees_money(self) -> bool:
        return self.role in MONEY_ROLES

    @property
    def actor(self) -> team.Actor:
        return team.Actor(self.user_id, self.name)


Handler = Callable[[asyncpg.Connection, Caller, dict], Awaitable[dict]]


@dataclass(frozen=True)
class Action:
    key: str
    roles: frozenset[str]
    # The module that must be switched on for the shop, or None when the action decides
    # section by section.
    module: str | None
    run: Handler


REGISTRY: dict[str, Action] = {}


def register(key: str, roles: frozenset[str], module: str | None = None):
    """Declare an action. The decorated function is `async def (conn, caller, args)`."""

    def add(handler: Handler) -> Handler:
        if key in REGISTRY:
            raise ValueError(f"action {key} is declared twice")
        REGISTRY[key] = Action(key, roles, module, handler)
        return handler

    return add


async def module_on(conn: asyncpg.Connection, module: str) -> bool:
    return bool(
        await conn.fetchval(
            "select exists (select 1 from tenant_modules where module_key = $1 and enabled)",
            module,
        )
    )


def allowed(key: str, role: str) -> bool:
    action = REGISTRY.get(key)
    return action is not None and role in action.roles


async def run(conn: asyncpg.Connection, caller: Caller, key: str, **args) -> dict:
    """Carry out an action for a caller on the shop the connection is scoped to."""
    from alyr.modules import owner  # noqa: F401  (declares the actions)

    action = REGISTRY.get(key)
    if action is None:
        raise ActionError(f"there is no action called {key}")
    if caller.role not in action.roles:
        raise NotAllowed(key)
    if action.module is not None and not await module_on(conn, action.module):
        raise NotSwitchedOn(action.module)
    return await action.run(conn, caller, args)
