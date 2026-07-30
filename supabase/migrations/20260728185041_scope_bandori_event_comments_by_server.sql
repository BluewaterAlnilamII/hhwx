-- Existing Bandori event discussions predate multi-server support and all
-- belong to CN. Canonical target IDs now use `<server-code>:<event-id>` so the
-- generic comment tables can isolate one thread per server and event without
-- adding Bandori-specific columns.
UPDATE public.comments
SET target_id = 'cn:' || target_id
WHERE target_type = 'bandori_event'
  AND target_id ~ '^[1-9][0-9]*$';

UPDATE public.comment_notifications
SET target_id = 'cn:' || target_id
WHERE target_type = 'bandori_event'
  AND target_id ~ '^[1-9][0-9]*$';
