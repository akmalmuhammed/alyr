"""Rule 34, `line_health` (docs/work/insights-plan/plan.md, row L1): the quality rating of the
shop's own WhatsApp number is low, fell in the last 7 days, or Meta shows the number as flagged,
restricted or limited.

What it reads is what ALYR already keeps about the line (specs/062, `core/whatsapp_health.py`):
the rating, the status and the sending status in `whatsapp_line_health`, and the changes of
rating in `whatsapp_line_events` (kind `quality`, written when a read of Meta finds a new one).
Nothing here asks Meta.

* **Quiet** until Meta has given a rating (a number not attached, the simulator, a line Meta has
  not yet reported on), and quiet for everything about the shop's WhatsApp *account* (a
  restriction on ALYR's shared account is the founder's, D-147: the owner is not told about it).
* **Knowledge, not a task.** A task is work the owner clears by doing it, and it never goes away
  until it is done. Nothing in ALYR lets the owner change a rating: it recovers by itself as
  quality improves, and ALYR does not pause or hold any message for a low rating (the runbook,
  `docs/runbooks/whatsapp-line.md`, "What ALYR does not do"). A card under "Needs you now" that
  cannot be cleared would stay there for days. So it is a knowledge card: it comes back when the
  rating or status changes even after "Not now" (the fingerprint holds both).
* **Words.** Only what ALYR's own runbook says about Meta: a red or yellow rating means customers
  are blocking or reporting the number's messages, red or a flag can lower the messaging limit,
  a restricted number has often reached its limit, and a rating recovers over days. No promise
  that a message will be held or an offer paused, and no offer advice: ALYR sends none yet.
* **Not covered:** a number Meta shows as banned, deleted or disconnected (those are the line
  not working, not its quality; ALYR staff see them in the back office), and the limit's value
  itself (Meta's wording of it is not proven).
"""

from datetime import date, timedelta

import asyncpg

from alyr.catalog import Text
from alyr.modules.agent.facts import Facts
from alyr.modules.agent.model import Action, Finding, Insight
from alyr.modules.agent.words import DAY_LONG, B, rich, sunday_index

KEY = "line_health"
WINDOW_DAYS = 7

# How far down Meta's rating is. NA is "not rated yet", no worse than green.
RANK = {"GREEN": 0, "NA": 0, "YELLOW": 1, "RED": 2}
# The rating a card can say it fell to, in each language (with the article, for the Arabic).
FELL_TO = {"YELLOW": ("yellow", "الأصفر"), "RED": ("red", "الأحمر")}

# One read: the newest line that has a rating, and its changes of rating in the last 7 days. The
# `limit` keeps a number that flips every read from making a long answer.
_READ = (
    "select h.quality_rating, h.number_status, h.health, e.at, e.detail "
    "from (select number_id, quality_rating, number_status, health "
    "      from whatsapp_line_health where quality_rating <> '' "
    "      order by greatest(polled_at, event_at) desc nulls last limit 1) h "
    "left join lateral (select at, detail from whatsapp_line_events "
    "      where kind = 'quality' and number_id = h.number_id and at > $1 "
    "      order by at desc, id desc limit 20) e on true"
)


async def gather(conn: asyncpg.Connection, f: Facts) -> None:
    rows = await conn.fetch(_READ, f.now - timedelta(days=WINDOW_DAYS))
    if not rows:
        return
    drop = None
    for r in rows:
        detail = r["detail"] if isinstance(r["detail"], dict) else {}
        before = RANK.get(str(detail.get("from") or "").upper(), 0)
        after = RANK.get(str(detail.get("to") or "").upper(), 0)
        if r["at"] is not None and after > before:
            drop = {"to": str(detail["to"]).upper(), "on": r["at"].astimezone(f.zone).date()}
            break  # the newest fall
    f.extra[KEY] = {
        "rating": str(rows[0]["quality_rating"]).upper(),
        "status": str(rows[0]["number_status"]).upper(),
        "health": str(rows[0]["health"]).upper(),
        "drop": drop,
    }


def _state(d: dict) -> tuple[str, str] | None:
    """What the stored facts amount to, most serious first, or None when there is nothing to
    say. The second part is a variant of the state."""
    rating, status, health = d["rating"], d["status"], d["health"]
    if not rating:
        return None
    if health == "BLOCKED":
        return "limited", "blocked"
    if rating == "RED":
        return "low", "red"
    if status == "FLAGGED":
        return "low", "flagged"
    if status == "RESTRICTED":
        return "restricted", ""
    if health == "LIMITED":
        return "limited", "limited"
    if rating == "YELLOW":
        return "yellow", ""
    if d["drop"]:
        return "recovered", ""
    return None


def _find(f: Facts) -> Finding | None:
    d = f.extra.get(KEY)
    if not d:
        return None
    state = _state(d)
    if state is None:
        return None
    drop = d["drop"]
    return Finding(numbers={
        "state": state[0], "variant": state[1], "rating": d["rating"], "status": d["status"],
        "health": d["health"], "fell_to": drop["to"] if drop else "",
        "fell_on": drop["on"].isoformat() if drop else "",
    })


def _day(on: date, today: date, lang: str) -> str:
    if on == today:
        return "اليوم" if lang == "ar" else "today"
    if (today - on).days == 1:
        return "أمس" if lang == "ar" else "yesterday"
    name = DAY_LONG[lang][sunday_index(on)]
    return f"يوم {name}" if lang == "ar" else f"on {name}"


def _fell(x: Finding, f: Facts, lang: str, *, only_if: str = "") -> str:
    """"It fell to red on Tuesday. " when the stored fall is the rating the card is about."""
    n = x.numbers
    if not n["fell_to"] or n["fell_to"] not in FELL_TO or (only_if and n["fell_to"] != only_if):
        return ""
    day = _day(date.fromisoformat(n["fell_on"]), f.today, lang)
    word = FELL_TO[n["fell_to"]][1 if lang == "ar" else 0]
    return f"انخفض التقييم إلى {word} {day}. " if lang == "ar" else f"It fell to {word} {day}. "


def _say(x: Finding, f: Facts, lang: str):
    n = x.numbers
    state, variant = n["state"], n["variant"]
    meta = B("Meta")
    if state == "low":
        fell = _fell(x, f, lang, only_if="RED") if variant == "red" else ""
        if lang == "ar":
            title = ("تقييم جودة رقم واتساب لديك أحمر" if variant == "red"
                     else "وضعت {meta} علامة على رقم واتساب لديك بسبب انخفاض الجودة")
            line = (fell + "الجودة المنخفضة تعني أن عملاء يحظرون رسائل هذا الرقم أو يبلّغون عنها، "
                    "ويمكن أن تخفّض {meta} حد الرسائل لكل 24 ساعة. أرسل للعملاء ما يتوقعونه "
                    "فقط. ويتحسّن التقييم خلال أيام عندما تتحسّن الجودة.")
            return rich(title, meta=meta), rich(line, meta=meta)
        title = ("Your WhatsApp number's quality rating is red" if variant == "red"
                 else "Meta has flagged your WhatsApp number for low quality")
        line = (fell + "Low quality means customers are blocking or reporting its messages, and "
                "Meta can lower the number's messaging limit. Send customers only what they "
                "expect. The rating recovers over days as quality improves.")
        return rich(title), rich(line)
    if state == "yellow":
        fell = _fell(x, f, lang, only_if="YELLOW")
        if lang == "ar":
            return (rich("تقييم جودة رقم واتساب لديك أصفر"), rich(
                fell + "الأصفر يعني جودة متوسطة: بعض العملاء يحظرون رسائل هذا الرقم أو "
                "يبلّغون عنها. أرسل للعملاء ما يتوقعونه فقط حتى لا ينخفض التقييم أكثر."))
        return (rich("Your WhatsApp number's quality rating is yellow"), rich(
            fell + "Yellow means medium quality: some customers are blocking or reporting its "
            "messages. Send customers only what they expect, so it does not fall further."))
    if state == "restricted":
        if lang == "ar":
            return (rich("تعرض {meta} رقم واتساب لديك بحالة مقيّد", meta=meta), rich(
                "يحدث هذا غالباً لأن الرقم بلغ حد الرسائل. يُحسب الحد على مدى 24 ساعة، "
                "فانتظر حتى يُعاد ضبطه."))
        return (rich("Meta shows your WhatsApp number as restricted"), rich(
            "This is often because the number reached its messaging limit. The limit counts "
            "over 24 hours, so wait for it to reset."))
    if state == "limited":
        blocked = variant == "blocked"
        if lang == "ar":
            title = ("تقول {meta} إن الإرسال من رقم واتساب لديك محظور" if blocked
                     else "تقول {meta} إن الإرسال من رقم واتساب لديك محدود")
            return rich(title, meta=meta), rich(
                "تقول {meta} إن شرطاً من شروط هذا الرقم غير مستوفى، مثل اعتماد اسم العرض أو "
                "قالب الرسائل.", meta=meta)
        title = ("Meta says sending from your WhatsApp number is blocked" if blocked
                 else "Meta says sending from your WhatsApp number is limited")
        return rich(title), rich(
            "Meta says a requirement for this number is not met, such as an approved display "
            "name or message template.")
    # recovered: a fall in the last 7 days, and the rating is not low now
    fell = _fell(x, f, lang)
    if lang == "ar":
        return (rich("انخفض تقييم جودة رقم واتساب لديك ثم تحسّن"),
                rich(fell + "وهو ليس منخفضاً الآن. لا يلزمك فعل شيء."))
    return (rich("Your WhatsApp number's quality rating fell and has recovered"),
            rich(fell + "It is not low now. Nothing needs doing."))


INSIGHT = Insight(
    KEY, 34, "knowledge", "inbox|orders|bookings|ledger",
    Text("Meta's quality rating for your number is below the best, fell in the last 7 days, or "
         "Meta shows the number as flagged, restricted or limited; nothing shows before Meta "
         "has given a rating",
         "تقييم جودة رقمك لدى Meta أدنى من الأفضل، أو انخفض خلال آخر 7 أيام، أو تعرض Meta "
         "الرقم بحالة معلَّم عليه أو مقيّد أو محدود؛ ولا يظهر شيء قبل أن تعطي Meta تقييماً"),
    _find, _say, Action(Text("Open Connections", "افتح الاتصالات"), "/app/connections"),
)
