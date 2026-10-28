"""Every migration has its own number (ALY-204).

Two builders working in parallel once took 0043 for different migrations. The runner applies files
in name order and records each by its full name, so nothing failed, but two files with one number
is a trap: a "next free number" check is wrong, and a rename can reorder what was applied. This
test fails when a number is shared, so the second pull request that takes a number finds out in CI
instead of after the merge.

The pair at 0043 is already recorded under both names on the databases that exist (a laptop and
scratch databases), so it stays as it is: renaming a file that was applied would run it again.
Nothing else may join it.
"""

import re
from collections import defaultdict

from alyr.migrate import MIGRATIONS

NAME = re.compile(r"^(\d{4})_[a-z0-9_]+\.sql$")

# Applied under both names already. Never add to this: take the next free number instead.
SHARED_ALREADY = {
    "0043": {"0043_decimal_quantities.sql", "0043_documents_connected.sql"},
}


def by_number() -> dict[str, set[str]]:
    found: dict[str, set[str]] = defaultdict(set)
    for path in MIGRATIONS.glob("*.sql"):
        match = NAME.match(path.name)
        assert match, f"{path.name}: a migration is named NNNN_what_it_does.sql (lower case)"
        found[match.group(1)].add(path.name)
    return found


def test_each_migration_number_is_used_once():
    clashes = {
        number: sorted(names)
        for number, names in by_number().items()
        if len(names) > 1 and names != SHARED_ALREADY.get(number)
    }
    assert not clashes, (
        f"these migration numbers are used by more than one file: {clashes}. "
        "Take the next free number (look at main again first) and rename your file."
    )


def test_the_shared_number_list_does_not_grow():
    """The allowance above is for the two files that exist. If one is renamed or removed, say so."""
    found = by_number()
    for number, names in SHARED_ALREADY.items():
        assert found.get(number) == names, (
            f"{number} is no longer exactly {sorted(names)}: remove it from SHARED_ALREADY"
        )
