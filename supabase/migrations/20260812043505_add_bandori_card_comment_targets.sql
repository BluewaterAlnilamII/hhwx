-- Cards reuse the generic comment tables. Ordinary card IDs identify one
-- cross-server entity, while the application encodes the registered EN/CN
-- numeric-ID collisions in target_id. No table grants or RLS policies change:
-- public clients retain read-only access to visible comments and all writes
-- continue through the server API.

ALTER TABLE public.comments
  DROP CONSTRAINT IF EXISTS comments_target_type_check;

ALTER TABLE public.comments
  ADD CONSTRAINT comments_target_type_check
  CHECK (target_type IN ('bandori_event', 'bandori_card'));

ALTER TABLE public.comment_notifications
  DROP CONSTRAINT IF EXISTS comment_notifications_target_type_check;

ALTER TABLE public.comment_notifications
  ADD CONSTRAINT comment_notifications_target_type_check
  CHECK (target_type IN ('bandori_event', 'bandori_card'));

-- A rollback may restore the previous event-only constraints only after
-- confirming that no bandori_card rows remain in either table.

NOTIFY pgrst, 'reload schema';
