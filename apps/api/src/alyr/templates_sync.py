"""Create ALYR's message templates on Meta, and show where each one stands.

    uv run python -m alyr.templates_sync            # show status only
    uv run python -m alyr.templates_sync --create   # also submit the ones Meta lacks,
                                                    # and resubmit refused ones as now worded

Templates belong to a WhatsApp Business Account, so this runs once per account. Meta
reviews each one; most utility templates are approved within minutes.
"""

import asyncio
import sys

import httpx

from alyr.config import get_settings
from alyr.core.templates import CATALOGUE


def _refusal(answer: dict) -> str | None:
    """Meta's reason for refusing a request, or None if it accepted it."""
    error = answer.get("error")
    if error is None:
        return None
    return error.get("error_user_msg") or error.get("message", "no reason given")


async def main(create: bool) -> int:
    settings = get_settings()
    if not (settings.meta_access_token and settings.meta_waba_id):
        print("Set ALYR_META_ACCESS_TOKEN and ALYR_META_WABA_ID first.")
        return 1
    graph = f"https://graph.facebook.com/{settings.meta_graph_version}"
    base = f"{graph}/{settings.meta_waba_id}/message_templates"
    headers = {"Authorization": f"Bearer {settings.meta_access_token}"}
    async with httpx.AsyncClient(timeout=30, headers=headers) as http:
        found: dict[tuple[str, str], dict] = {}
        url: str | None = f"{base}?fields=name,language,status,rejected_reason&limit=200"
        while url:
            page = (await http.get(url)).json()
            if "error" in page:
                print("Meta refused the request:", _refusal(page))
                return 1
            for item in page.get("data", []):
                found[(item["name"], item["language"])] = item
            url = page.get("paging", {}).get("next")

        failures = 0
        for name, template in CATALOGUE.items():
            for lang, text in (("en", template.en), ("ar", template.ar)):
                on_meta = found.get((name, lang))
                status = on_meta["status"] if on_meta else "not on Meta"
                body: dict = {"type": "BODY", "text": text}
                if template.samples:
                    body["example"] = {"body_text": [list(template.samples)]}
                if on_meta and status == "REJECTED":
                    status = f"REJECTED ({on_meta.get('rejected_reason', 'no reason given')})"
                    if create:
                        # A refused template is edited in place; Meta reviews it again.
                        answer = (await http.post(
                            f"{graph}/{on_meta['id']}", json={"components": [body]},
                        )).json()
                        refused = _refusal(answer)
                        failures += refused is not None
                        status = f"NEW WORDING REFUSED: {refused}" if refused else "RESUBMITTED"
                elif on_meta is None and create:
                    answer = (await http.post(base, json={
                        "name": name, "language": lang,
                        "category": template.category.upper(), "components": [body],
                    })).json()
                    refused = _refusal(answer)
                    failures += refused is not None
                    status = (
                        f"REFUSED: {refused}" if refused
                        else "SUBMITTED, " + answer.get("status", "PENDING")
                    )
                print(f"{name:28} {lang}  {status}")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main("--create" in sys.argv)))
