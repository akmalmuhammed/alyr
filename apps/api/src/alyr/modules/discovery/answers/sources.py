"""The sources an answer cited and the searches the tool ran, by rule (DECISIONS 7, research R4
sections 2.7 and 7.2 item 5). Pure functions, no I/O, no model, no page is ever opened.

* `clean` keeps, for each cited page, only its **host** (from an http or https address; anything
  else is dropped), its title and the short passage the tool quoted, cut to size, one line each.
  The full address is not kept: the host is what the owner acts on ("the answers cited this
  guide"), and nothing from a third party becomes a link ALYR shows.
* `check` compares a cited passage with what the owner confirmed, **where it can be checked**: when
  the passage names the business (the same name matching as the answer) and gives a phone number,
  that number is compared with every phone and WhatsApp number the owner confirmed, in the form
  the listing rules compare numbers (`connectors.base.normal`, which A's `normalize.phone_key`
  takes over when it lands). `matches` when it is one of them, `differs` when it is none; anything
  else is `not_read`: the passage does not name the business, gives no number, or there is none.
* `aggregate` turns a check-up's answers into "where the answers got their facts": per host, how
  many answers cited it, how many of those did not name the business, and the checks.
"""

import re

from alyr.modules.discovery.answers import reading
from alyr.modules.discovery.connectors.base import normal
from alyr.modules.items.text import fold

MAX_SOURCES = 10
MAX_SEARCHES = 5
MAX_TITLE = 200
MAX_SNIPPET = 300
MAX_SEARCH = 200
TOP_HOSTS = 12
TOP_SEARCHES = 10
MATCHES, DIFFERS, NOT_READ = "matches", "differs", "not_read"
CHECKS = (MATCHES, DIFFERS, NOT_READ)

_URL = re.compile(r"^https?://(?:[^/?#@\s]*@)?([^/?#:\s]+)(?::\d{1,5})?(?:[/?#]|$)", re.I)
_HOST = re.compile(r"^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]"
                   r"{0,61}[a-z0-9])?)+$")
_CONTROL = re.compile(r"[\x00-\x1f\x7f]+")
_PHONE = re.compile(r"(?<![\w+])\+?[0-9٠-٩][0-9٠-٩ \-]{5,16}[0-9٠-٩](?!\w)")
_ARABIC_DIGITS = str.maketrans("٠١٢٣٤٥٦٧٨٩", "0123456789")


def host_of(url: object) -> str | None:
    """The lower-case host of an http or https address, without `www.`; None for anything else."""
    if not isinstance(url, str):
        return None
    found = _URL.match(url.strip())
    if not found:
        return None
    host = found.group(1).lower().rstrip(".")
    host = host[4:] if host.startswith("www.") else host
    return host if _HOST.match(host) else None


def _line(value: object, longest: int) -> str:
    if not isinstance(value, str):
        return ""
    return " ".join(_CONTROL.sub(" ", value).split())[:longest]


def clean(sources) -> list[dict]:
    """`[{host, title, snippet}]`, at most `MAX_SOURCES`, one per host and title, in order."""
    out: list[dict] = []
    seen: set[tuple[str, str]] = set()
    for source in sources or ():
        host = host_of(getattr(source, "url", None))
        if host is None:
            continue
        title = _line(getattr(source, "title", ""), MAX_TITLE)
        if (host, title) in seen:
            continue
        seen.add((host, title))
        out.append({"host": host, "title": title,
                    "snippet": _line(getattr(source, "snippet", ""), MAX_SNIPPET)})
        if len(out) == MAX_SOURCES:
            break
    return out


def clean_searches(searches) -> list[str]:
    out: list[str] = []
    for search in searches or ():
        text = _line(search, MAX_SEARCH)
        if text and text not in out:
            out.append(text)
        if len(out) == MAX_SEARCHES:
            break
    return out


def phone_keys(values) -> frozenset[str]:
    """The confirmed numbers in the form they are compared in."""
    keys = set()
    for value in values:
        key = normal("phone", {"phone": value})
        if key:
            keys.add(key)
    return frozenset(keys)


def check(snippet: str, forms: tuple[str, ...], confirmed: frozenset[str]) -> str:
    if not snippet or not confirmed or not reading.names(snippet, forms):
        return NOT_READ
    found = [normal("phone", {"phone": m.group(0).translate(_ARABIC_DIGITS)})
             for m in _PHONE.finditer(snippet)]
    found = [f for f in found if f and len(f) >= 7]
    if not found:
        return NOT_READ
    return MATCHES if any(f in confirmed for f in found) else DIFFERS


def checked(pool_sources, forms: tuple[str, ...], confirmed: frozenset[str]) -> list[dict]:
    """A business's view of a shared answer's sources: host, title and the check. The quoted
    passage stays in the shared row."""
    return [{"host": s["host"], "title": s["title"],
             "check": check(s.get("snippet", ""), forms, confirmed)} for s in pool_sources or ()]


def aggregate(answers: list[dict]) -> list[dict]:
    """`answers`: `{status, named, sources, engine, lang}` each. Per host, most cited first."""
    hosts: dict[str, dict] = {}
    for answer in answers:
        if answer["status"] != "ok":
            continue
        cited: set[str] = set()
        for source in answer["sources"] or ():
            entry = hosts.setdefault(source["host"], {
                "host": source["host"], "titles": [], "answers": 0, "answers_without_you": 0,
                "checks": dict.fromkeys(CHECKS, 0), "engines": [], "langs": []})
            title = source.get("title") or ""
            if title and title not in entry["titles"] and len(entry["titles"]) < 3:
                entry["titles"].append(title)
            entry["checks"][source.get("check", NOT_READ)] += 1
            if source["host"] in cited:
                continue
            cited.add(source["host"])
            entry["answers"] += 1
            entry["answers_without_you"] += 0 if answer["named"] else 1
            for key, value in (("engines", answer["engine"]), ("langs", answer["lang"])):
                if value not in entry[key]:
                    entry[key].append(value)
    for entry in hosts.values():
        checks = entry["checks"]
        entry["check"] = DIFFERS if checks[DIFFERS] else MATCHES if checks[MATCHES] else NOT_READ
    ordered = sorted(hosts.values(), key=lambda e: (-e["answers"], e["host"]))
    return ordered[:TOP_HOSTS]


def searches_table(answers: list[dict]) -> list[dict]:
    """The searches the tools ran, most often first."""
    seen: dict[str, dict] = {}
    for answer in answers:
        if answer["status"] != "ok":
            continue
        for text in dict.fromkeys(answer["searches"] or ()):
            entry = seen.setdefault(
                fold(text), {"text": text, "answers": 0, "lang": answer["lang"]})
            entry["answers"] += 1
    ordered = sorted(seen.values(), key=lambda e: (-e["answers"], fold(e["text"])))
    return ordered[:TOP_SEARCHES]
