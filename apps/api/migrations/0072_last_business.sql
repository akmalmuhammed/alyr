-- The business a person opened last, so signing in opens it again (go-live item 40, specs/040,
-- D-081). Set when they switch business; a business they no longer work for is passed over.
alter table users add column last_tenant_id uuid references tenants (id) on delete set null;
