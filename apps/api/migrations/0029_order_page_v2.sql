-- The customer order page, version 2 (ALY-112, decision D-039).
--
-- 1. Two shop settings for the page: whether every customer gets the compact wholesale table,
--    and the number customers message on WhatsApp (a public link or a QR code on a counter
--    opens the page for anyone, and a customer who wants to order starts from that number to
--    get a link of their own). How a sold-out item looks on the page is ALY-107's
--    `sold_out_display` (migration 0031), which the page reads.
-- 2. The table an order was placed from, taken from the link printed on that table's QR
--    code, so the kitchen and the counter know where to bring it.

alter table shop_settings
    add column wholesale_layout boolean not null default false,
    add column whatsapp_number text not null default ''
        check (whatsapp_number ~ '^[0-9]{0,15}$');

alter table orders
    add column table_label text not null default ''
        check (char_length(table_label) <= 20);
