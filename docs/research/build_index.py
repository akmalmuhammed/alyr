"""Rebuild docs/research/README.md's study table from the cards in studies/.

Run after adding or changing a card:  python docs/research/build_index.py
The part of README.md between the INDEX markers is replaced; everything else is kept.
"""

import glob
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
CATEGORIES = [
    ("strategy", "Strategy and company plans"),
    ("marketing", "Marketing: positioning, messaging, films"),
    ("sales", "Sales: pricing, offer, demos, onboarding clients"),
    ("growth", "Growth: channels, content plans, expansion"),
    ("customers", "Customers: segments, sectors, markets"),
    ("design-brand", "Design and brand: look, site, audits"),
    ("social", "Social media and decks"),
]


def field(text: str, name: str) -> str:
    m = re.search(r"\*\*" + name + r"\*\*\s*\|\s*(.+?)\s*\|\s*$", text, re.M)
    return m.group(1).strip() if m else "?"


def main() -> None:
    cards = []
    for path in sorted(glob.glob(os.path.join(HERE, "studies", "2*.md"))):
        text = open(path, encoding="utf-8").read()
        title = re.search(r"^# (.+)$", text, re.M).group(1).strip()
        cards.append({
            "file": os.path.basename(path), "title": title,
            "category": field(text, "Category").split("/")[0].strip().lower(),
            "date": field(text, "Date"), "status": field(text, "Status"),
        })
    out = [f"{len(cards)} studies. Status: **Current** is in force; **Partly superseded** still has"
           " useful parts; **Superseded** is history; **Draft** waits on a decision.\n"]
    for key, label in CATEGORIES:
        group = [c for c in cards if c["category"] == key]
        if not group:
            continue
        out.append(f"\n### {label} ({len(group)})\n\n| Date | Study | Status |\n|---|---|---|")
        for c in sorted(group, key=lambda c: c["date"], reverse=True):
            out.append(f"| {c['date']} | [{c['title']}](studies/{c['file']}) | {c['status']} |")
    other = [c for c in cards if c["category"] not in dict(CATEGORIES)]
    if other:
        out.append("\n### Uncategorised (fix the card's Category)\n")
        out += [f"- [{c['title']}](studies/{c['file']})" for c in other]
    readme = os.path.join(HERE, "README.md")
    text = open(readme, encoding="utf-8").read()
    start, end = "<!-- INDEX:START -->", "<!-- INDEX:END -->"
    text = text.split(start)[0] + start + "\n" + "\n".join(out) + "\n" + end + text.split(end)[1]
    open(readme, "w", encoding="utf-8", newline="\n").write(text)
    print(f"indexed {len(cards)} cards")


if __name__ == "__main__":
    main()
