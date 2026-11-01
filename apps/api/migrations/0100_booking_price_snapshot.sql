-- ALY-259, decision D-140, spec 043: an owner can now change a service's price from the
-- workspace, so a booking has to keep the price it was made at. Until now every reader of a
-- booking's price (what is left to pay, the receipt or invoice, the Agent's value of the week
-- ahead) read the service's price today; the deposit was already worked out once, when the
-- booking was made, so a later price change would have left the two out of step.
--
-- The price is filled by the database when a booking is inserted without one, so every way a
-- booking is made (the booking page, staff, the seeds) keeps it, and no insert has to remember.

alter table bookings add column price bigint check (price >= 0);

-- The bookings that exist keep what their service costs now. The shop is selected the way 0033
-- does it, and every statement names it, so this also works for an owner that does not bypass
-- row-level security.
do $$
declare
    t record;
begin
    for t in select id from tenants loop
        perform set_config('app.tenant_id', t.id::text, true);
        update bookings b set price = s.price
        from services s
        where b.tenant_id = t.id and s.tenant_id = t.id and s.id = b.service_id
          and b.price is null;
        -- A booking whose service row is gone has no price to keep.
        update bookings set price = 0 where tenant_id = t.id and price is null;
    end loop;
    perform set_config('app.tenant_id', '', true);
end $$;

alter table bookings alter column price set not null;

create function bookings_keep_price() returns trigger language plpgsql as $$
begin
    if new.price is null then
        select s.price into new.price from services s where s.id = new.service_id;
        new.price := coalesce(new.price, 0);
    end if;
    return new;
end $$;
create trigger bookings_price before insert on bookings
    for each row execute function bookings_keep_price();
