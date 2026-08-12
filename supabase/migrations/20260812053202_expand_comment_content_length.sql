-- Shared Bandori discussions support longer strategy and card-analysis posts.
-- The legacy Othello guestbook remains capped at 500 characters. This changes
-- no grants or RLS policies and is backward-compatible with the old app limit.

ALTER TABLE public.comments
  DROP CONSTRAINT IF EXISTS comments_content_check;

ALTER TABLE public.comments
  ADD CONSTRAINT comments_content_check
  CHECK (
    content IS NULL
    OR (
      char_length(btrim(content)) > 0
      AND char_length(content) <= 1000
    )
  );

-- Restoring the old limit requires first confirming that no visible or
-- moderated comment content is longer than 500 characters.

NOTIFY pgrst, 'reload schema';
