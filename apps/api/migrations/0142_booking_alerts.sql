-- The owner is told about bookings (first client, D-192, specs/069-owner-alerts).
--
-- Alerts for new orders have existed since 0071 (`contacts.order_alerts`); a salon's owner learns
-- of a new booking or a cancellation only by opening the Bookings tab. Two additive columns, no
-- new table (so RLS, the tenant index, forget and erase rules already cover them):
--
--  * `contacts.booking_alerts`: a staff number told on WhatsApp about each new booking and each
--    cancellation by the customer. Off until an owner or admin links their phone (which turns it
--    on for them) or someone marks the number, exactly as `order_alerts` is for orders. Like the
--    weekly report it may only be on for a staff number.
--  * `memberships.booking_emails`: one email to an owner for each new booking and each
--    cancellation by the customer, so an owner learns of a booking with no WhatsApp at all. On by
--    default for an owner, and the owner can turn it off; it never holds the customer's name or
--    phone number (docs/data-residency.md).

alter table contacts add column booking_alerts boolean not null default false;
alter table contacts add constraint contacts_booking_alerts_staff
    check (not booking_alerts or role = 'staff');

alter table memberships add column booking_emails boolean not null default true;
