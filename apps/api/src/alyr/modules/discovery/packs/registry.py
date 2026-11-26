"""Reading the packs (`data.py`) into something the engine can use, and checking them.

`Registry.from_data` takes plain dictionaries and the rules that exist, and refuses a pack that
names a rule, an overlay or a trade that is not there: a mistake in a pack stops the API at start,
never a check-up halfway. `select(family, trade)` is what a business is checked against: the core,
its family, the overlays the family and the trade bring, in that order, minus what they skip.

Everything here is pure: no database, no I/O.
"""

from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass, field

from alyr.modules.discovery.packs.data import BUSINESS_TYPES, FIRST_PARTY

KINDS = ("core", "family", "overlay")
CHECK_STATES = ("pass", "fail", "not_measured")


class PackError(ValueError):
    """A pack that cannot be read, or a family or trade that is not in the registry."""


@dataclass(frozen=True)
class Trade:
    key: str
    title_en: str
    title_ar: str
    overlays: tuple[str, ...] = ()

    def title(self, lang: str) -> str:
        return self.title_ar if lang == "ar" else self.title_en


@dataclass(frozen=True)
class Pack:
    id: str
    kind: str
    family: str | None
    title_en: str
    title_ar: str
    trades: tuple[Trade, ...] = ()
    rules: tuple[str, ...] = ()  # as written, `@firstparty` not yet expanded
    overlays: tuple[str, ...] = ()
    skip: tuple[str, ...] = ()
    never_edit: tuple[str, ...] = ()

    def title(self, lang: str) -> str:
        return self.title_ar if lang == "ar" else self.title_en

    def trade(self, key: str | None) -> Trade | None:
        return next((t for t in self.trades if t.key == key), None)


@dataclass(frozen=True)
class Selection:
    """What one business is checked against."""

    family: str | None
    trade: str | None
    packs: tuple[Pack, ...]
    rule_ids: tuple[str, ...]
    # rule id -> the pack that brought it (the first that lists it), for the counts per pack
    owner: Mapping[str, str] = field(default_factory=dict)
    never_edit: frozenset[str] = frozenset()

    @property
    def key(self) -> str:
        """`food/bakery`, `food` with no trade, `core` with no family: what `Context.pack` holds."""
        if self.family is None:
            return "core"
        return f"{self.family}/{self.trade}" if self.trade else self.family

    @property
    def overlays(self) -> tuple[str, ...]:
        return tuple(p.id for p in self.packs if p.kind == "overlay")

    def record(self) -> dict:
        """What a run keeps of the pack it was checked against (`discovery_runs.pack`)."""
        return {
            "family": self.family,
            "trade": self.trade,
            "overlays": list(self.overlays),
            "packs": [p.id for p in self.packs],
        }


def _text(value: object, what: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise PackError(f"{what} must be a non-empty string")
    return value


def _names(value: object, what: str) -> tuple[str, ...]:
    if value is None:
        return ()
    if not isinstance(value, list | tuple) or not all(isinstance(v, str) and v for v in value):
        raise PackError(f"{what} must be a list of names")
    if len(set(value)) != len(value):
        raise PackError(f"{what} names something twice")
    return tuple(value)


def pack_of(data: Mapping) -> Pack:
    """One pack from its dictionary, its shape checked (what it names is checked by the
    registry)."""
    if not isinstance(data, Mapping):
        raise PackError("a pack is a mapping")
    known = {"id", "kind", "family", "title_en", "title_ar", "trades", "rules", "overlays",
             "skip", "never_edit"}
    if set(data) - known:
        raise PackError(f"unknown keys in a pack: {sorted(set(data) - known)}")
    pid = _text(data.get("id"), "id")
    kind = data.get("kind")
    if kind not in KINDS:
        raise PackError(f"{pid}: kind must be one of {KINDS}")
    family = data.get("family")
    if kind == "family" and family != pid:
        raise PackError(f"{pid}: a family pack's family is its own id")
    if kind != "family" and family is not None:
        raise PackError(f"{pid}: only a family pack has a family")
    trades = []
    for item in data.get("trades") or []:
        if not isinstance(item, Mapping) or set(item) - {"key", "title_en", "title_ar",
                                                         "overlays"}:
            raise PackError(f"{pid}: a trade is {{key, title_en, title_ar, overlays}}")
        trades.append(Trade(
            _text(item.get("key"), f"{pid} trade key"),
            _text(item.get("title_en"), f"{pid} trade title_en"),
            _text(item.get("title_ar"), f"{pid} trade title_ar"),
            _names(item.get("overlays"), f"{pid} trade overlays"),
        ))
    if trades and kind != "family":
        raise PackError(f"{pid}: only a family has trades")
    return Pack(
        pid, kind, family,
        _text(data.get("title_en"), f"{pid} title_en"),
        _text(data.get("title_ar"), f"{pid} title_ar"),
        tuple(trades),
        _names(data.get("rules"), f"{pid} rules"),
        _names(data.get("overlays"), f"{pid} overlays"),
        _names(data.get("skip"), f"{pid} skip"),
        _names(data.get("never_edit"), f"{pid} never_edit"),
    )


class Registry:
    """Every pack, checked against the rules that exist."""

    def __init__(self, packs: Sequence[Pack], rule_ids: Sequence[str],
                 first_party: Sequence[str] = (),
                 business_types: Mapping[str, tuple[str, str]] = BUSINESS_TYPES) -> None:
        self.packs: tuple[Pack, ...] = tuple(packs)
        self.by_id = {p.id: p for p in self.packs}
        self.rule_ids = tuple(rule_ids)
        self.first_party = tuple(first_party)
        self.business_types = dict(business_types)
        self._check()

    @classmethod
    def from_data(cls, data: Iterable[Mapping], rule_ids: Sequence[str],
                  first_party: Sequence[str] = (),
                  business_types: Mapping[str, tuple[str, str]] = BUSINESS_TYPES) -> "Registry":
        return cls([pack_of(d) for d in data], rule_ids, first_party, business_types)

    # ── checking ───────────────────────────────────────────────────────────────────────

    def _check(self) -> None:
        if len(self.by_id) != len(self.packs):
            raise PackError("two packs have the same id")
        cores = [p for p in self.packs if p.kind == "core"]
        if len(cores) != 1:
            raise PackError("there is exactly one core pack")
        known = set(self.rule_ids)
        if len(known) != len(self.rule_ids):
            raise PackError("two rules have the same id")
        if not set(self.first_party) <= known:
            raise PackError("a first-party rule is not in the rules")
        trades: set[str] = set()
        for pack in self.packs:
            for rule_id in pack.rules:
                if rule_id != FIRST_PARTY and rule_id not in known:
                    raise PackError(f"{pack.id}: no rule {rule_id!r}")
            for rule_id in pack.skip:
                if rule_id not in known:
                    raise PackError(f"{pack.id}: skips no rule {rule_id!r}")
            for overlay in pack.overlays + tuple(o for t in pack.trades for o in t.overlays):
                if overlay not in self.by_id or self.by_id[overlay].kind != "overlay":
                    raise PackError(f"{pack.id}: no overlay {overlay!r}")
            for trade in pack.trades:
                if trade.key in trades:
                    raise PackError(f"{pack.id}: the trade {trade.key!r} is in two families")
                trades.add(trade.key)
            if pack.kind == "family" and not pack.trades:
                raise PackError(f"{pack.id}: a family needs at least one trade")
        # A family or trade an owner may be set to must exist.
        for business_type, (family, trade) in self.business_types.items():
            pack = self.by_id.get(family)
            if pack is None or pack.kind != "family" or pack.trade(trade) is None:
                raise PackError(f"business type {business_type!r} points at no family or trade")

    # ── reading ────────────────────────────────────────────────────────────────────────

    @property
    def core(self) -> Pack:
        return next(p for p in self.packs if p.kind == "core")

    def families(self) -> list[Pack]:
        return [p for p in self.packs if p.kind == "family"]

    def expand(self, pack: Pack) -> tuple[str, ...]:
        """The rule ids a pack itself adds, `@firstparty` written out."""
        out: list[str] = []
        for rule_id in pack.rules:
            for one in self.first_party if rule_id == FIRST_PARTY else (rule_id,):
                if one not in out:
                    out.append(one)
        return tuple(out)

    def select(self, family: str | None, trade: str | None = None) -> Selection:
        """What a business of this family and trade is checked against. No family: the core
        only. Raises `PackError` for a family or trade the registry does not have."""
        chosen: list[Pack] = [self.core]
        if family is not None:
            pack = self.by_id.get(family)
            if pack is None or pack.kind != "family":
                raise PackError(f"no family {family!r}")
            chosen.append(pack)
            overlays = list(pack.overlays)
            if trade is not None:
                found = pack.trade(trade)
                if found is None:
                    raise PackError(f"no trade {trade!r} in {family!r}")
                overlays += [o for o in found.overlays if o not in overlays]
            chosen += [self.by_id[o] for o in overlays]
        elif trade is not None:
            raise PackError("a trade needs its family")
        skipped = {r for p in chosen for r in p.skip}
        owner: dict[str, str] = {}
        for pack in chosen:
            for rule_id in self.expand(pack):
                if rule_id not in skipped:
                    owner.setdefault(rule_id, pack.id)
        # In the rules' own order, so a check-up logs and saves them the same way every time.
        ordered = tuple(r for r in self.rule_ids if r in owner)
        return Selection(
            family, trade if family is not None else None, tuple(chosen), ordered, owner,
            frozenset(f for p in chosen for f in p.never_edit),
        )

    def for_business_type(self, business_type: str | None) -> tuple[str | None, str | None]:
        """The family and trade a business starts with, from its type (D-196)."""
        found = self.business_types.get((business_type or "").strip().lower())
        if found is None or found[0] not in self.by_id:
            return None, None
        return found


def allowed_writes(writes: Iterable[tuple[str, str]], never_edit: Iterable[str]) -> frozenset:
    """What a source may write for this business: its `(target, field)` pairs without the fields
    the pack never lets a proposal change (a clinic's service text)."""
    never = set(never_edit)
    return frozenset(w for w in writes if w[1] not in never)


def tally(entries: Iterable[Mapping]) -> dict:
    """"N of M checks match": `matched` passed, `measured` passed or found, `not_measured` could
    not be told and is left out of `measured`; `total` is every check the pack ran."""
    states = [e.get("state") for e in entries if e.get("state") in CHECK_STATES]
    matched = states.count("pass")
    found = states.count("fail")
    unmeasured = states.count("not_measured")
    return {
        "matched": matched,
        "measured": matched + found,
        "total": len(states),
        "not_measured": unmeasured,
    }
