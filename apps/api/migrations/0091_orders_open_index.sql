-- The workspace's Orders screen lists the orders of the last 30 days and every order still
-- open (D-130). The open ones are found on their own small index, so a shop's years of finished
-- orders are not looked through to find the few that still need someone.
create index orders_open on orders (tenant_id, number desc)
    where status in ('new', 'confirmed', 'ready') or (payment = 'unpaid' and status <> 'cancelled');

-- Staff phones (the owner who gets the weekly report, the numbers marked for new-order alerts)
-- were found by looking through all of a shop's customers.
create index contacts_staff on contacts (tenant_id) where role = 'staff';
