-- Erasing a stopped client's data (spec 042, decision D-116): the one door through the guards.
--
-- Four tables refuse to lose a row, on purpose: issued documents and their lines and PDFs
-- (0034), and payments recorded by hand (0038). Those guards stay exactly as they are for the
-- application, for the table owner and for every script. This migration adds one narrow door
-- beside them: the erasure job, running as the owner, names the business it is erasing in
-- `erasing_businesses` for the length of its own transaction, and a DELETE of that business's
-- rows (nobody else's) is let through.
--
-- Why this cannot be used from the application:
--  - the application's role has no privilege on `erasing_businesses` at all (it cannot add a
--    row), and the row is added and removed inside one transaction, so no other session ever
--    sees it (an uncommitted row is invisible);
--  - the check is a function that runs as the owner, so the application does not need to read
--    the table either;
--  - only DELETE is let through. Updating or inserting into those tables is guarded exactly as
--    before.
--
-- The guard functions are not touched. Each trigger that covered DELETE is split in two: the
-- original keeps its name and now covers the rest, and a new `*_delete_guard` covers DELETE with
-- a WHEN condition that skips it only for a business being erased.

create table erasing_businesses (
    business_id uuid primary key,
    started_at timestamptz not null default now()
);

create function business_is_being_erased(p_business uuid) returns boolean
language sql stable security definer set search_path = public as $$
    select exists (select 1 from erasing_businesses where business_id = p_business)
$$;
revoke all on function business_is_being_erased(uuid) from public;
grant execute on function business_is_being_erased(uuid) to alyr_app;

-- Issued documents.
drop trigger documents_guard on documents;
create trigger documents_guard before update on documents
    for each row execute function documents_guard();
create trigger documents_delete_guard before delete on documents
    for each row when (not business_is_being_erased(old.tenant_id))
    execute function documents_guard();

-- Their lines (also guarded on insert).
drop trigger document_lines_guard on document_lines;
create trigger document_lines_guard before insert or update on document_lines
    for each row execute function document_lines_guard();
create trigger document_lines_delete_guard before delete on document_lines
    for each row when (not business_is_being_erased(old.tenant_id))
    execute function document_lines_guard();

-- Their PDFs.
drop trigger document_files_guard on document_files;
create trigger document_files_guard before update on document_files
    for each row execute function document_files_guard();
create trigger document_files_delete_guard before delete on document_files
    for each row when (not business_is_being_erased(old.tenant_id))
    execute function document_files_guard();

-- Payments recorded by hand.
drop trigger manual_payments_guard on manual_payments;
create trigger manual_payments_guard before update on manual_payments
    for each row execute function manual_payments_guard();
create trigger manual_payments_delete_guard before delete on manual_payments
    for each row when (not business_is_being_erased(old.tenant_id))
    execute function manual_payments_guard();
