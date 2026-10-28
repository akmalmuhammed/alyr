# Spec 026: Bookable resources (more than one customer at a time)

Status: engine and API built in ALY-258 (step 2 of ALY-27). Decision: D-062. The workspace screens for resources, services and hours are the next issue.

## The problem

A shop's bookings were held to one customer at a time **for the whole shop**: migration 0010 made the database refuse any two overlapping bookings of one tenant (`bookings_no_overlap`). A salon with two chairs, a clinic with two doctors or a workshop with two technicians could take one customer at a time. Onboarding already offers these businesses a self-serve path (D-031), so they met this limit on their first day.

## The rule now

**One customer at a time per resource**, where a resource is whatever the shop can only use for one customer at a time: a chair, a person, a room.

- A shop that lists **no resources** is held to the old rule, exactly: one lane. Nothing changes for it, and no existing shop was migrated into resources.
- A shop that lists resources takes as many customers at the same time as it has resources that do the service.

## What a shop can do (API; screens follow)

| Route | Who | What |
|---|---|---|
| `GET /api/resources` | any staff | The shop's resources in order, each with the services narrowed to it (empty = does every service). Empty list = the shop has none |
| `POST /api/resources` | owner, admin | Add one, with an English name and an optional Arabic name |
| `PATCH /api/resources/{id}` | owner, admin | Rename |
| `POST /api/resources/{id}/active` | owner, admin | Switch off (takes no new bookings; the ones it has stay) or on. The last active one cannot be switched off |
| `PUT /api/services/{id}/resources` | owner, admin | Which resources do this service. An empty list means all of them |

The API never deletes a resource, it switches it off, so a booking made last year still shows the chair it had; the database refuses to delete a resource a booking points at.

## How a time is decided

- **Free times** for a service on a day: a time is free if **at least one** active resource that does the service has no booking overlapping it. The customer sees one list; the page needs no change.
- **Taking a time:** the booking takes the **first free** resource in the shop's order, unless one was asked for (the engine accepts it; the public page does not offer the choice yet). Under the shop's lock, so two customers cannot be given the same last one.
- **Moving:** a move keeps the same resource when it is free at the new time, and takes another when it is not. If none is free the move is refused and the booking stays where it was.
- **Cancelling, completing, no-show:** unchanged; cancelling frees exactly the resource it held.
- **Reminders and confirmations:** unchanged.

## The first resource

When a shop adds its first resource, the bookings still to come (booked, ending in the future) move onto it, so they keep blocking it. Without that, the shop's one lane and its new chair would both be open at the same time and the same customer slot could be sold twice. Past bookings keep no resource.

## The database is the last guard

`bookings_no_overlap` now reads: no two **booked** bookings of one shop overlap on the same `coalesce(resource_id, tenant_id)`. A booking with no resource sits in the shop's one lane (its tenant ID stands in for the resource), which is the old rule. So even code that forgot to check cannot put two customers on one chair, and the shop's one lane is still held to one customer.

## What is recorded

`bookings.resource_id` (null for a shop with none), and the activity record's `booked` and `moved` entries carry the resource's name. The staff list of bookings (`GET /api/bookings`) says which resource holds each one.

## Tables (migration 0055)

`booking_resources` (tenant, name, Arabic name, active, sort), `service_resources` (service, resource), `bookings.resource_id`. Both new tables carry the tenant column with forced row-level security and the standard policy.

## At a thousand shops

- Every lookup is by tenant and resource and uses `bookings_resource (tenant_id, resource_id, starts_at) where status = 'booked'`; a shop's free times read only that shop's rows.
- The only shared lock is per shop (`pg_advisory_xact_lock` on the tenant), as before; shops never wait for each other.
- Nothing is kept in a server's memory.

## Not in this spec

- **Workspace screens** for resources, services and opening hours, and walk-ins and moving a booking from the workspace (next issue, ALY-27 steps 3 and 4).
- **Customer choice of resource** on the booking page ("with Huda").
- **A resource's own hours and days off**, buffers between visits, deposits, the review request (the rest of ALY-27).
- **Linking a resource to a login** (a stylist's own calendar).
- Onboarding creating a starting set of chairs for a salon.

## Checks

`apps/api/tests/test_booking_resources.py`, through the real routes, the engine and PostgreSQL: a shop with none is unchanged; two customers on two resources and a third refused; cancelling frees exactly that resource; a service narrowed to some resources; a switched-off resource; the last one cannot be switched off; the first resource takes over the bookings to come; moving keeps or changes the chair and a refused move leaves the booking where it was; four customers at the same moment share two resources and no more; the database itself refuses two bookings on one resource; agents can read but not change; one shop's resources are not another's. Every test in `test_bookings.py` passes untouched.
