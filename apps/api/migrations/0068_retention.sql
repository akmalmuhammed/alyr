-- How long the working copies are kept (go-live checklist item 19, ALY-119, D-075, specs/038).
--
-- The worker deletes, once a day and one business at a time, the jobs that finished more than
-- 30 days ago (90 for one that failed for good) and the IDs of WhatsApp messages handled more
-- than 30 days ago (`core/retention.py`). These indexes let it find them without reading every
-- job a business ever had.

create index jobs_finished on jobs (tenant_id, finished_at) where status in ('done', 'failed');
create index processed_messages_age on processed_messages (tenant_id, created_at);
