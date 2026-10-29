-- An order the owner placed as their own test customer is marked, once, as it is made
-- (ALY-168, D-064, spec 028).
--
-- While a business sets itself up, the owner orders from their own test line as the customer
-- `TEST.<user>` (core/onboarding.py). That order is real in every way the owner needs to see
-- (the page, the stock it takes, the order list, the message when it is ready), but it must
-- never be counted in a report, in the ALYR Agent, in the weekly result or in a margin. So the
-- order says what it is.
--
-- A trigger sets it, not the code that places the order, so no way of making an order (the
-- order page, the chat, a file, connected mode, a seed) can forget it. A real customer's
-- WhatsApp ID is a phone number, so it never starts with `TEST.`.
--
-- Nothing is backfilled: until now only an owner who typed "menu" on the test line of a shop
-- without the orders module could have placed one, and an order the owner can see is marked
-- from the next one on.
alter table orders add column is_test boolean not null default false;

create function mark_test_order() returns trigger
language plpgsql as $$
begin
    new.is_test := exists (
        select 1 from contacts c where c.id = new.contact_id and c.wa_user_id like 'TEST.%'
    );
    return new;
end;
$$;

create trigger orders_mark_test before insert on orders
    for each row execute function mark_test_order();
