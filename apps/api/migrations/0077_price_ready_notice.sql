-- The owner is emailed once when ALYR publishes their price (ALY-274, CJ-14).
--
-- The column is claimed before the email is sent, so publishing a quote twice (or two workers)
-- never sends it twice. It is cleared again if the provider refuses the message, so the next
-- publish tries once more. Writing it needs the back office, like every other change to a quote.
alter table quotes add column owner_notified_at timestamptz;
