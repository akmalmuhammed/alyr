"""What Meta tells ALYR about a WhatsApp Business Account by webhook, as opposed to about a message
(spec 061 for templates, spec 062 for a number's health).

The webhook (`routes/whatsapp_webhook.py`) verifies Meta's signature and hands the account notices
here. A notice names the account, not a business: several businesses' numbers can share ALYR's own
account, and a business with its own account has it to itself. Each notice is therefore written for
every business whose number is on that account, through that business's own scope, so row-level
security stays the plain rule.

Nothing here may fail the webhook: Meta retries a notice it did not get a 200 for, and a notice
that cannot be applied is logged (its kind, never its content) and dropped.
"""

import logging

from alyr.channels.meta import AccountEvent
from alyr.core import whatsapp_health, whatsapp_line, whatsapp_templates
from alyr.db import Database

log = logging.getLogger("alyr.whatsapp_events")

# Notices that name one number, by its display number.
NUMBER_FIELDS = ("phone_number_quality_update", "phone_number_name_update")

_HANDLERS = {
    "message_template_status_update": whatsapp_templates.apply_status_event,
    "template_category_update": whatsapp_templates.apply_category_event,
    "phone_number_quality_update": whatsapp_health.apply_quality_notice,
    "phone_number_name_update": whatsapp_health.apply_name_notice,
    "account_update": whatsapp_health.apply_account_notice,
    "account_alerts": whatsapp_health.apply_alert_notice,
    "account_review_update": whatsapp_health.apply_review_notice,
}


class AccountEvents:
    def __init__(self, db: Database) -> None:
        self._db = db

    async def _lines(self, waba_id: str) -> list[whatsapp_line.Line]:
        async with self._db.unscoped() as conn:
            rows = await conn.fetch(
                "select tenant_id, number_id, waba_id, display_phone from channel_numbers "
                "where channel = 'meta' and waba_id = $1", waba_id)
        return [whatsapp_line.Line(**dict(r)) for r in rows]

    async def handle(self, events: list[AccountEvent]) -> int:
        """Apply every notice that is about an account ALYR has a number on. Returns how many
        businesses' records changed, for the tests."""
        changed = 0
        for event in events:
            try:
                changed += await self._apply(event)
            except Exception:  # noqa: BLE001 - one bad notice must not fail the others
                log.exception("could not apply a %s notice", event.field)
        return changed

    async def _apply(self, event: AccountEvent) -> int:
        lines = await self._lines(event.waba_id)
        if not lines:
            # An account that is not one of ours, or a number detached since: nothing to keep.
            log.info("a %s notice for an account with no attached number", event.field)
            return 0
        # A notice about one number names it by its display number; one about the account, or
        # about a business portfolio, is for every number on the account.
        if event.field in NUMBER_FIELDS:
            shown = whatsapp_health.digits(event.value.get("display_phone_number"))
            lines = [x for x in lines if shown and whatsapp_health.digits(x.display_phone) == shown]
            if not lines:
                log.info("a %s notice for a number ALYR has not attached", event.field)
        elif event.field == "account_alerts" and (
            event.value.get("entity_type") == "PHONE_NUMBER"
        ):
            lines = [x for x in lines if x.number_id == str(event.value.get("entity_id"))]
        done = 0
        for line in lines:
            async with self._db.tenant(line.tenant_id) as conn:
                handler = _HANDLERS.get(event.field)
                if handler is not None:
                    done += await handler(conn, line, event.value)
        return done
