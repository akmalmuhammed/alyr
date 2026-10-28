"""Owner actions over WhatsApp (ALY-130, decision D-065).

`asks` holds the read-only actions an owner or staff member can run from the workspace or
from their phone; `chat` turns a staff number's messages into those actions and the
answers into words, in English and Arabic.
"""

from alyr.modules.owner import asks  # noqa: F401  (declares the actions)
