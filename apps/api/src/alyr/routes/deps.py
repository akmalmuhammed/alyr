from uuid import UUID

from fastapi import HTTPException

from alyr.config import get_settings
from alyr.seed import DEMO_TENANT_ID


async def current_tenant() -> UUID:
    """Which tenant the workspace request belongs to.

    Sign-in does not exist yet (ALY-18). Until it does, local and staging requests act as
    the demo shop, and production refuses rather than guess.
    """
    if get_settings().env == "production":
        raise HTTPException(status_code=401, detail="sign-in required")
    return DEMO_TENANT_ID
