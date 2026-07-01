DELETE FROM public.comment_notifications
WHERE type = 'comment_like';

DROP INDEX IF EXISTS public.idx_comment_notifications_unique_like;

ALTER TABLE public.comment_notifications
  DROP CONSTRAINT IF EXISTS comment_notifications_type_check,
  DROP CONSTRAINT IF EXISTS comment_notifications_check,
  DROP CONSTRAINT IF EXISTS comment_notifications_reply_activity_check,
  DROP CONSTRAINT IF EXISTS comment_notifications_activity_shape_check,
  DROP CONSTRAINT IF EXISTS comment_notifications_reaction_emoji_key_check;

ALTER TABLE public.comment_notifications
  ADD COLUMN IF NOT EXISTS reaction_emoji_key TEXT;

ALTER TABLE public.comment_notifications
  ADD CONSTRAINT comment_notifications_type_check
    CHECK (type IN ('comment_reply', 'comment_reaction')),
  ADD CONSTRAINT comment_notifications_reaction_emoji_key_check
    CHECK (
      reaction_emoji_key IS NULL OR (
        char_length(reaction_emoji_key) BETWEEN 1 AND 64
        AND reaction_emoji_key ~ '^[A-Za-z0-9_+-]+$'
      )
    ),
  ADD CONSTRAINT comment_notifications_activity_shape_check
    CHECK (
      (type = 'comment_reply' AND activity_comment_id IS NOT NULL AND reaction_emoji_key IS NULL) OR
      (type = 'comment_reaction' AND activity_comment_id IS NULL AND reaction_emoji_key IS NOT NULL)
    );

CREATE INDEX IF NOT EXISTS idx_comment_notifications_recipient_type_created
  ON public.comment_notifications (recipient_user_id, type, created_at DESC, id DESC);

NOTIFY pgrst, 'reload schema';
