"""Create ALYR's message templates on Meta, and show where each one stands.

    uv run python -m alyr.templates_sync            # show status only
    uv run python -m alyr.templates_sync --create   # also submit the ones Meta lacks,
                                                    # and resubmit refused ones as now worded,
                                                    # except those held for the founder's go

Templates belong to a WhatsApp Business Account, so this runs once per account. Meta
reviews each one; most utility templates are approved within minutes.

A template with an image header (`weekly_report_card`) is reviewed with a sample image.
That image is uploaded first through Meta's Resumable Upload API, which needs the app's
ID: set ALYR_META_APP_ID as well (checked against Meta's upload guide, 17 Oct 2026).
"""

import asyncio
import sys
from pathlib import Path

import httpx

from alyr import document_samples
from alyr.config import get_settings
from alyr.core.templates import CATALOGUE, Template

ROOT = Path(__file__).resolve().parents[4]


def _refusal(answer: dict) -> str | None:
    """Meta's reason for refusing a request, or None if it accepted it."""
    error = answer.get("error")
    if error is None:
        return None
    return error.get("error_user_msg") or error.get("message", "no reason given")


def sample_file(template: Template, lang: str) -> tuple[str, bytes]:
    """(file name, bytes) of a template's sample header in one language. A picture is a file
    in the repository; a sample document is drawn by the documents engine (a made-up bakery's
    receipt, invoice or credit note: `alyr.document_samples`), so no PDF is kept in the
    repository."""
    path = ROOT / template.header_sample.format(lang=lang)
    if template.header == "document":
        return path.name, document_samples.draw_all()[path.name]
    return path.name, path.read_bytes()


async def header_handle(http: httpx.AsyncClient, graph: str, app_id: str, token: str,
                        template: Template, lang: str) -> str:
    """Upload a template's sample header image in one language and return the handle Meta
    reviews it with: start an upload session on the app, then send the file's bytes."""
    name, data = sample_file(template, lang)
    path = Path(name)
    session = (await http.post(f"{graph}/{app_id}/uploads", params={
        "file_name": path.name, "file_length": len(data),
        "file_type": "application/pdf" if path.suffix == ".pdf" else "image/png",
        "access_token": token,
    })).json()
    if "id" not in session:
        raise RuntimeError(_refusal(session) or "no upload session")
    done = (await http.post(f"{graph}/{session['id']}", content=data, headers={
        "Authorization": f"OAuth {token}", "file_offset": "0",
    })).json()
    if "h" not in done:
        raise RuntimeError(_refusal(done) or "no handle for the upload")
    return done["h"]


def components(template: Template, text: str, handle: str | None,
               lang: str = "en") -> list[dict]:
    body: dict = {"type": "BODY", "text": text}
    samples = template.samples_ar if lang == "ar" and template.samples_ar else template.samples
    if samples:
        body["example"] = {"body_text": [list(samples)]}
    if template.header in ("image", "document"):
        return [{"type": "HEADER", "format": template.header.upper(),
                 "example": {"header_handle": [handle]}}, body]
    return [body]


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
        handles: dict[tuple[str, str], str] = {}
        for name, template in CATALOGUE.items():
            for lang, text in (("en", template.en), ("ar", template.ar)):
                on_meta = found.get((name, lang))
                status = on_meta["status"] if on_meta else "not on Meta"
                if template.held and create and (on_meta is None or status == "REJECTED"):
                    # Written and waiting for the founder's go (`Template.held`): never sent.
                    print(f"{name:28} {lang}  HELD: {template.held}")
                    continue
                needs_upload = create and template.header in ("image", "document") and (
                    on_meta is None or status == "REJECTED")
                if needs_upload:
                    if not settings.meta_app_id:
                        print(f"{name:28} {lang}  SKIPPED: set ALYR_META_APP_ID to upload "
                              "its sample image")
                        failures += 1
                        continue
                    handles[(name, lang)] = await header_handle(
                        http, graph, settings.meta_app_id, settings.meta_access_token,
                        template, lang)
                parts = components(template, text, handles.get((name, lang)), lang)
                if on_meta and status == "REJECTED":
                    status = f"REJECTED ({on_meta.get('rejected_reason', 'no reason given')})"
                    if create:
                        # A refused template is edited in place; Meta reviews it again.
                        answer = (await http.post(
                            f"{graph}/{on_meta['id']}", json={"components": parts},
                        )).json()
                        refused = _refusal(answer)
                        failures += refused is not None
                        status = f"NEW WORDING REFUSED: {refused}" if refused else "RESUBMITTED"
                elif on_meta is None and create:
                    answer = (await http.post(base, json={
                        "name": name, "language": lang,
                        "category": template.category.upper(), "components": parts,
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
