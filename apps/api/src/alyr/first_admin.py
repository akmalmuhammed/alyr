"""Make the first person who can sign in to a new production database (ALY-10).

A new database has nobody in it, so nobody can sign in, and the back office (/ops) that
adds everyone else is out of reach. This creates ALYR's own business, its owner, and makes
that owner a member of ALYR staff:

    python -m alyr.first_admin --email akmal@alyr.qa --name "Akmal Muhammed" --own-number

`--own-number` also attaches ALYR's own WhatsApp number (ALYR_META_PHONE_NUMBER_ID and
ALYR_META_WABA_ID, the number the Meta app sends from) to ALYR's business, so messages to it
reach ALYR's inbox. Shops' numbers are attached from the back office, never here.

Run it once per database, as a one-off job with the owner's address (ALYR_MIGRATION_URL).
Running it again with the same email changes nothing. Once anyone is ALYR staff it refuses
a different email: more staff are added from the back office, which records who added them.
"""

import argparse
import asyncio

import asyncpg

from alyr.config import get_settings

ALYR_SLUG = "alyr"


class AlreadySetUp(Exception):
    """ALYR staff exist already; the back office adds the rest."""


async def create_first_admin(
    owner_dsn: str, email: str, name: str, number_id: str = "", waba_id: str = ""
) -> str:
    """Create ALYR's business, its owner and the first member of ALYR staff, and attach
    ALYR's own WhatsApp number when one is given. Returns the business's id. Needs the
    owner role: the app role cannot write these tables."""
    email = email.strip().lower()
    name = name.strip()
    if "@" not in email or not name:
        raise ValueError("an email address and a name are needed")
    conn = await asyncpg.connect(owner_dsn)
    try:
        async with conn.transaction():
            others = await conn.fetchval(
                "select count(*) from platform_admins where email <> $1", email
            )
            if others:
                raise AlreadySetUp(
                    "ALYR staff exist already; add more from the back office (/ops > Staff)"
                )
            tenant_id = await conn.fetchval(
                "select id from tenants where slug = $1", ALYR_SLUG
            )
            if tenant_id is None:
                client_id = await conn.fetchval(
                    "insert into clients (name, access_from, access_note) "
                    "values ('ALYR', now(), 'ALYR itself') returning id"
                )
                tenant_id = await conn.fetchval(
                    "insert into tenants (name, name_ar, slug, client_id) "
                    "values ('ALYR', 'ALYR', $1, $2) returning id",
                    ALYR_SLUG, client_id,
                )
            user_id = await conn.fetchval(
                "insert into users (email, name) values ($1, $2) "
                "on conflict (email) do update set name = excluded.name returning id",
                email, name,
            )
            await conn.execute(
                "insert into memberships (tenant_id, user_id, role) values ($1, $2, 'owner') "
                "on conflict do nothing",
                tenant_id, user_id,
            )
            await conn.execute(
                "insert into platform_admins (email, name, added_by) "
                "values ($1, $2, 'first admin') on conflict (email) do nothing",
                email, name,
            )
            if number_id:
                holder = await conn.fetchval(
                    "select tenant_id from channel_numbers where number_id = $1", number_id
                )
                if holder is not None and holder != tenant_id:
                    raise AlreadySetUp("that WhatsApp number belongs to another business")
                await conn.execute(
                    "insert into channel_numbers (number_id, tenant_id, channel, waba_id) "
                    "values ($1, $2, 'meta', $3) "
                    "on conflict (number_id) do update set waba_id = excluded.waba_id",
                    number_id, tenant_id, waba_id or None,
                )
        return str(tenant_id)
    finally:
        await conn.close()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--email", required=True)
    parser.add_argument("--name", required=True)
    parser.add_argument("--own-number", action="store_true",
                        help="attach ALYR's own WhatsApp number from the Meta settings")
    args = parser.parse_args()
    settings = get_settings()
    number_id = waba_id = ""
    if args.own_number:
        # "unset" is the placeholder Secret Manager holds for a value not given yet.
        number_id, waba_id = (
            "" if value == "unset" else value
            for value in (settings.meta_phone_number_id, settings.meta_waba_id)
        )
        if not number_id:
            print("first_admin: no ALYR_META_PHONE_NUMBER_ID yet; own number not attached")
    try:
        tenant_id = asyncio.run(
            create_first_admin(settings.migration_url, args.email, args.name, number_id, waba_id)
        )
    except AlreadySetUp as error:
        raise SystemExit(f"first_admin: {error}") from None
    email = args.email.strip().lower()
    print(f"ready: {email} owns ALYR ({tenant_id}) and may use the back office")
    if number_id:
        print("ALYR's own WhatsApp number is attached to ALYR's business")


if __name__ == "__main__":
    main()
