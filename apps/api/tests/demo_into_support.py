"""Shared helpers for the tests of `python -m alyr.seed_into_business` (spec 063)."""

import asyncio

from alyr.seed_into_business import cli
from test_consent import owner_sql
from test_onboarding import new_business

__all__ = ["bakery", "mark", "run", "sql", "table_counts"]


def bakery(client, name=None):
    """A business made through the real sign-up, as a bakery, the way the founder's was. Returns
    (tenant id, slug, owner's address)."""
    tenant_id, slug, _ = new_business(client, name=name, kind="bakery")
    owner = owner_sql(
        "select u.email from memberships m join users u on u.id = m.user_id "
        "where m.tenant_id = $1 and m.role = 'owner'", tenant_id)[0]["email"]
    return tenant_id, slug, owner


def mark(tenant_id, allowed=True):
    """What the back office's switch does."""
    owner_sql("update tenants set demo_data_allowed = $2 where id = $1", tenant_id, allowed)


def run(*argv):
    """The command, as a person types it. Returns (exit code, what it printed)."""
    lines: list[str] = []
    original = cli.print if hasattr(cli, "print") else None
    cli.print = lambda *a, **k: lines.append(" ".join(str(x) for x in a))
    try:
        code = asyncio.run(cli.main(list(argv)))
    finally:
        if original is None:
            del cli.print
        else:
            cli.print = original
    return code, "\n".join(lines)


def sql(query, *args):
    return owner_sql(query, *args)


def table_counts(tenant_id) -> dict:
    """Every tenant table's row count for one business: the picture the tests compare."""
    names = [r["table_name"] for r in owner_sql(
        "select c.table_name from information_schema.columns c join information_schema.tables t "
        "on t.table_name = c.table_name and t.table_schema = c.table_schema and "
        "t.table_type = 'BASE TABLE' where c.table_schema = 'public' and "
        "c.column_name = 'tenant_id' order by 1")]
    return {n: owner_sql(f'select count(*) as n from "{n}" where tenant_id = $1', tenant_id)[0]["n"]
            for n in names}
