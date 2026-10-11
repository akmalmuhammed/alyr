from __future__ import annotations

import json
from html.parser import HTMLParser
from pathlib import Path
from xml.etree import ElementTree

from PIL import Image


ROOT = Path(__file__).resolve().parent.parent


class ReferenceParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.references: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = dict(attrs)
        for attribute in ("src", "href"):
            value = values.get(attribute)
            if value:
                self.references.append(value)


def main() -> int:
    errors: list[str] = []
    svg_files = list(ROOT.rglob("*.svg"))
    png_files = list(ROOT.rglob("*.png"))

    for file in svg_files:
        try:
            ElementTree.parse(file)
        except Exception as exc:  # noqa: BLE001
            errors.append(f"Invalid SVG: {file.relative_to(ROOT)} — {exc}")

    for file in png_files:
        try:
            with Image.open(file) as image:
                image.verify()
        except Exception as exc:  # noqa: BLE001
            errors.append(f"Invalid PNG: {file.relative_to(ROOT)} — {exc}")

    html_file = ROOT / "10_Showcase" / "index.html"
    parser = ReferenceParser()
    parser.feed(html_file.read_text(encoding="utf-8"))
    local_references = 0
    for reference in parser.references:
        if reference.startswith(("#", "http:", "https:", "mailto:", "tel:")):
            continue
        local_references += 1
        clean_reference = reference.split("#", 1)[0].split("?", 1)[0]
        target = (html_file.parent / clean_reference).resolve()
        if not target.exists():
            errors.append(f"Missing showcase reference: {reference}")

    required = [
        "README.md",
        "02_Logo_System/01_Master_SVG/primary-horizontal-carbon-volt.svg",
        "02_Logo_System/01_Master_SVG/primary-horizontal-reversed.svg",
        "04_App_and_Favicon/02_Favicon/favicon.ico",
        "05_Social_Media/01_Profile_Pictures/linkedin-profile-800x800.png",
        "06_UI_UX_System/Design_Tokens/tokens.css",
        "08_Document_System/Editable_SVG/proposal-cover.svg",
        "10_Showcase/index.html",
        "00_Governance/Asset_Inventory.json",
    ]
    for relative in required:
        if not (ROOT / relative).exists():
            errors.append(f"Missing required deliverable: {relative}")

    report = {
        "svg_files": len(svg_files),
        "png_files": len(png_files),
        "showcase_local_references": local_references,
        "required_deliverables": len(required),
        "errors": errors,
    }
    print(json.dumps(report, indent=2))
    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
