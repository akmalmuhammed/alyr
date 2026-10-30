-- Staff told about a new order on WhatsApp (go-live checklist item 42, D-079).
--
-- Until now a new order showed only on an open workspace screen. A staff number the owner
-- marks with `order_alerts` gets a short WhatsApp message for every order placed: its number,
-- what it holds, the total, how it is paid and how it reaches the customer. Off by default:
-- a busy shop would otherwise get a message per order on every number it registered.

alter table contacts add column order_alerts boolean not null default false;
