"""Shared helpers for the Discovery Phase 2 tests (spec 066): a shop of its own with the sample
business on and a first check-up run (ten proposals wait), ways to find a proposal by its rule and
place, a WhatsApp line for the asks, and the staff members a branch manager test needs.

Every business, person, number and review here is made up.
"""

from uuid import UUID, uuid4

from discovery_support import discovery_shop, run_check_up, turn_on_sample
from test_consent import owner_sql
from test_sign_in import sign_in

BASE = "/api/discovery"


def prepared_shop(client_factory, monkeypatch, *, roles=("owner",), run: bool = True):
    """A shop with Discovery on, the sample business on (its facts written) and, unless said
    otherwise, one check-up run: at stage 0 the rules call for ten changes."""
    shop = discovery_shop(client_factory, monkeypatch, roles=roles)
    turn_on_sample(shop)
    if run:
        run_check_up(shop.owner)
    return shop


def place_id(client, area: str) -> str:
    """The id of the sample place whose name ends with the area ("Al Sadd")."""
    for item in client.get(f"{BASE}/locations").json()["items"]:
        if item["name"].endswith(area):
            return item["id"]
    raise AssertionError(f"no place called {area}")


def proposals(client, status: str = "all", **query) -> list[dict]:
    answer = client.get(f"{BASE}/proposals", params={"status": status, **query})
    assert answer.status_code == 200, answer.text
    return answer.json()["items"]


def find(client, rule_id: str, area: str | None = None, *, target: str | None = None,
         status: str = "all") -> dict:
    """The one proposal of a rule (at a place, on a target)."""
    found = [p for p in proposals(client, status) if p["rule_id"] == rule_id
             and (area is None or p["location"]["name"].endswith(area))
             and (target is None or p["target"] == target)]
    assert len(found) == 1, (rule_id, area, [(p["rule_id"], p["location"]["name"]) for p in found])
    return found[0]


def approve(client, proposal: dict, *, expect: int = 200, **more):
    answer = client.post(f"{BASE}/proposals/{proposal['id']}/approve",
                         json={"change_hash": proposal["change_hash"], **more})
    assert answer.status_code == expect, (answer.status_code, answer.text)
    return answer.json()


def get(client, proposal_id: str, lang: str = "en") -> dict:
    answer = client.get(f"{BASE}/proposals/{proposal_id}", params={"lang": lang})
    assert answer.status_code == 200, answer.text
    return answer.json()


def finding_of(client, proposal: dict) -> dict:
    answer = client.get(f"{BASE}/findings/{proposal['finding_id']}")
    assert answer.status_code == 200, answer.text
    return answer.json()


def activity(shop, action: str, subject_id: str | None = None) -> list[dict]:
    return [dict(r) for r in owner_sql(
        "select action, actor_name, channel, detail from activity where tenant_id = $1 "
        "and subject = 'discovery' and action = $2 and ($3::uuid is null or subject_id = $3) "
        "order by created_at", shop.tenant_id, action, UUID(subject_id) if subject_id else None)]


def add_member(shop, role: str, *, name: str | None = None) -> str:
    """A new member of the shop with this role: returns the email."""
    email = f"{role}-{uuid4().hex[:10]}@docs.example"
    user = owner_sql("insert into users (email, name) values ($1, $2) returning id",
                     email, name or role.title())[0]["id"]
    owner_sql("insert into memberships (tenant_id, user_id, role) values ($1, $2, $3)",
              shop.tenant_id, user, role)
    return email


def user_id(shop, email: str) -> str:
    return str(owner_sql("select id from users where email = $1", email)[0]["id"])


def branch_manager(client_factory, shop, area: str, *, name: str = "Reem") -> tuple:
    """A staff-role member linked to one place, signed in: (client, user id)."""
    email = add_member(shop, "agent", name=name)
    client = client_factory()
    sign_in(client, email)
    uid = user_id(shop, email)
    answer = shop.owner.put(f"{BASE}/locations/{place_id(shop.owner, area)}/managers",
                            json={"user_ids": [uid]})
    assert answer.status_code == 200, answer.text
    return client, uid


def whatsapp_line(shop) -> str:
    """A slug and a private simulator line for the shop, so a phone can write to it."""
    slug = f"disc-{uuid4().hex[:8]}"
    owner_sql("update tenants set slug = $2 where id = $1", shop.tenant_id, slug)
    owner_sql("insert into channel_numbers (number_id, tenant_id, channel) "
              "values ($1, $2, 'simulator')", f"sim-{slug}", shop.tenant_id)
    return slug


def phone_says(client, slug: str, phone: str, text: str = "", reply_id: str = "") -> list[dict]:
    answer = client.post("/sim/messages", json={
        "from_number": phone, "text": text, "reply_id": reply_id, "shop": slug})
    assert answer.status_code == 200, answer.text
    return answer.json()["messages"]


def link_phone(client, slug: str, phone: str) -> str:
    """The signed-in person asks for a code and sends `LINK <code>` from their phone."""
    code = client.post("/api/owner/whatsapp-link")
    assert code.status_code == 200, code.text
    return phone_says(client, slug, phone, f"LINK {code.json()['code']}")[-1]["body"]


def contact_of(shop, phone: str) -> dict:
    return dict(owner_sql("select * from contacts where tenant_id = $1 and phone = $2",
                          shop.tenant_id, phone)[0])


def messages_to(shop, phone: str) -> list[dict]:
    return [dict(r) for r in owner_sql(
        "select m.direction, m.kind, m.body, m.payload, m.status, m.error from messages m "
        "join contacts c on c.id = m.contact_id where c.tenant_id = $1 and c.phone = $2 "
        "order by m.created_at, m.id", shop.tenant_id, phone)]


def asks(shop) -> list[dict]:
    return [dict(r) for r in owner_sql(
        "select * from discovery_asks where tenant_id = $1 order by created_at, id",
        shop.tenant_id)]
