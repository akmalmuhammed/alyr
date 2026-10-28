-- How a shop's customers pay for an order (ALY-170; spec 024).
--
-- Until a shop has its own online account, it takes cash, a bank transfer or a card machine
-- when the customer collects (D-044: the payment step never blocks go-live). `pay_online`
-- says whether the order page offers a payment link; when it is off, an order is placed
-- unpaid, holds its stock for good, and staff mark it paid when the money arrives
-- (`manual_payments`, spec 013). `pay_later_ways` is what the shop says it accepts, in the
-- words the customer reads.
alter table shop_settings
    add column pay_online boolean not null default true,
    add column pay_later_ways text[] not null default '{}'
        check (pay_later_ways <@ array['cash', 'bank_transfer', 'card_terminal']::text[]),
    add constraint shop_settings_pay_way_needed check (pay_online or cardinality(pay_later_ways) > 0);
