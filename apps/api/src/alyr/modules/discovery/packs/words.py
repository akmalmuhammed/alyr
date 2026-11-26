"""The packs' own words: their refusals and one log sentence. Merged into `words.py`'s tables on
import, the way the Answers check's are (`answer_words.py`). Arabic is a careful draft until the
native review (ALY-66)."""

ERRORS: dict[str, tuple[str, str]] = {
    "bad_family": (
        "Choose a kind of business from the list.",
        "اختر نوع النشاط من القائمة.",
    ),
    # `bad_trade` is the Answers check's ("Choose a trade from the list."), used here as well.
}

# A part of the score that only first-party rules may use: logged as one step, like the others.
STEP: dict[str, str] = {
    "rules.more": "Checked against the business's own records: "
    "{passed} passed, {failed} found, {unmeasured} not measured.",
}
