"""Create ALYR's message templates on Meta, and show where each one stands.

    uv run python -m alyr.templates_sync            # show status only
    uv run python -m alyr.templates_sync --create   # also submit the ones Meta lacks

Templates belong to a WhatsApp Business Account, so this runs once per account. Meta
reviews each one; most utility templates are approved within minutes.
"""

import asyncio
import sys

import httpx

from alyr.config import get_settings
from alyr.core.templates import CATALOGUE


async def main(create: bool) -> int:
    settings = get_settings()
    if not (settings.meta_access_token and settings.meta_waba_id):
        print("Set ALYR_META_ACCESS_TOKEN and ALYR_META_WABA_ID first.")
        return 1
    base = f"https://graph.facebook.com/{settings.meta_graph_version}/{settings.meta_waba_id}"
    headers = {"Authorization": f"Bearer {settings.meta_access_token}"}
    async with httpx.AsyncClient(timeout=30, headers=headers) as http:
        found: dict[tuple[str, str], str] = {}
        url: str | None = f"{base}/message_templates?fields=name,language,status&limit=200"
        while url:
            page = (await http.get(url)).json()
            if "error" in page:
                print("Meta refused the request:", page["error"].get("message"))
                return 1
            for item in page.get("data", []):
                found[(item["name"], item["language"])] = item["status"]
            url = page.get("paging", {}).get("next")

        failures = 0
        for name, template in CATALOGUE.items():
            for lang, text in (("en", template.en), ("ar", template.ar)):
                status = found.get((name, lang))
                if status is None and create:
                    body: dict = {"type": "BODY", "text": text}
                    if template.samples:
                        body["example"] = {"body_text": [list(template.samples)]}
                    answer = (await http.post(f"{base}/message_templates", json={
                        "name": name, "language": lang,
                        "category": template.category.upper(), "components": [body],
                    })).json()
                    if "error" in answer:
                        failures += 1
                        error = answer["error"]
                        reason = error.get("error_user_msg") or error.get("message", "")
                        status = f"REFUSED: {reason}"
                    else:
                        status = "SUBMITTED, " + answer.get("status", "PENDING")
                print(f"{name:28} {lang}  {status or 'not on Meta'}")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main("--create" in sys.argv)))
