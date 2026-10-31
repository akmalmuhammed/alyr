"""Which database login carries ALYR's cross-business work (ALY-125 part 3, SEC-5, D-137).

The API process has two logins when `ALYR_ADMIN_DATABASE_URL` is set: the application role for
everything a shop's staff or a shop's customer asks for, and `alyr_admin` for work that declares
itself the back office (`app.platform_admin`): the back-office routes, the billing of ALYR's own
clients, the audit log. The second pool hangs off the first as `db.admin`, so a function that
already takes `db` finds it without a new argument. With no admin address, `db.admin` is absent
and everything runs on the one login, as it did before.

The worker has one login of its own, `alyr_worker`, chosen by its `ALYR_DATABASE_URL`; it has no
`.admin` and needs none.

Once the guard is enforced (`python -m alyr.db_roles enforce`), the application role's own
connections no longer open the back office's tables and functions, whatever settings they write;
only these two logins (and the database's owner) do.
"""

from alyr.db import Database


def privileged(db: Database) -> Database:
    """The pool for work that declares the back office: the admin login if there is one, else
    `db` itself."""
    return getattr(db, "admin", None) or db
