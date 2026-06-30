INSERT INTO public.comment_reactions (comment_id, user_id, emoji_key, created_at)
SELECT comment_id, user_id, 'KokoroYay', created_at
FROM public.comment_reactions
WHERE emoji_key = 'KanonLove'
ON CONFLICT (comment_id, user_id, emoji_key) DO NOTHING;

DELETE FROM public.comment_reactions
WHERE emoji_key = 'KanonLove';

CREATE OR REPLACE FUNCTION public.update_comment_like_count()
RETURNS TRIGGER AS $$
DECLARE
  target_comment_id UUID;
BEGIN
  IF TG_TABLE_NAME = 'comment_reactions' THEN
    IF TG_OP = 'INSERT' THEN
      IF NEW.emoji_key <> 'KokoroYay' THEN
        RETURN NEW;
      END IF;
      target_comment_id := NEW.comment_id;
    ELSE
      IF OLD.emoji_key <> 'KokoroYay' THEN
        RETURN OLD;
      END IF;
      target_comment_id := OLD.comment_id;
    END IF;
  ELSE
    IF TG_OP = 'INSERT' THEN
      target_comment_id := NEW.comment_id;
    ELSE
      target_comment_id := OLD.comment_id;
    END IF;
  END IF;

  UPDATE public.comments
    SET like_count = (
          SELECT COUNT(*)::INTEGER
          FROM public.comment_reactions
          WHERE comment_id = target_comment_id
            AND emoji_key = 'KokoroYay'
        ),
        updated_at = NOW()
    WHERE id = target_comment_id;

  IF TG_OP = 'INSERT' THEN
    RETURN NEW;
  END IF;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql
SET search_path = public, pg_temp;

UPDATE public.comments
  SET like_count = (
    SELECT COUNT(*)::INTEGER
    FROM public.comment_reactions
    WHERE comment_id = public.comments.id
      AND emoji_key = 'KokoroYay'
  );

NOTIFY pgrst, 'reload schema';
