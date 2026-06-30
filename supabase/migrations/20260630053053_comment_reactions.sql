CREATE TABLE IF NOT EXISTS public.comment_reactions (
  comment_id UUID NOT NULL REFERENCES public.comments(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  emoji_key  TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (comment_id, user_id, emoji_key),
  CHECK (char_length(emoji_key) BETWEEN 1 AND 64),
  CHECK (emoji_key ~ '^[A-Za-z0-9_+-]+$')
);

CREATE INDEX IF NOT EXISTS idx_comment_reactions_comment_emoji_created_at
  ON public.comment_reactions (comment_id, emoji_key, created_at);

CREATE INDEX IF NOT EXISTS idx_comment_reactions_user_id_created_at
  ON public.comment_reactions (user_id, created_at DESC);

INSERT INTO public.comment_reactions (comment_id, user_id, emoji_key, created_at)
SELECT comment_id, user_id, 'KanonLove', created_at
FROM public.comment_likes
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.update_comment_like_count()
RETURNS TRIGGER AS $$
DECLARE
  target_comment_id UUID;
BEGIN
  IF TG_TABLE_NAME = 'comment_reactions' THEN
    IF TG_OP = 'INSERT' THEN
      IF NEW.emoji_key <> 'KanonLove' THEN
        RETURN NEW;
      END IF;
      target_comment_id := NEW.comment_id;
    ELSE
      IF OLD.emoji_key <> 'KanonLove' THEN
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
            AND emoji_key = 'KanonLove'
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
      AND emoji_key = 'KanonLove'
  );

DROP TRIGGER IF EXISTS update_comment_reaction_like_count ON public.comment_reactions;
CREATE TRIGGER update_comment_reaction_like_count
  AFTER INSERT OR DELETE ON public.comment_reactions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_comment_like_count();

ALTER TABLE public.comment_reactions ENABLE ROW LEVEL SECURITY;

REVOKE INSERT, DELETE ON TABLE public.comment_likes FROM authenticated;
DROP POLICY IF EXISTS comment_likes_insert_own ON public.comment_likes;
DROP POLICY IF EXISTS comment_likes_delete_own ON public.comment_likes;

REVOKE ALL ON TABLE public.comment_reactions FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.comment_reactions TO service_role;

DROP POLICY IF EXISTS comment_reactions_select_own ON public.comment_reactions;
DROP POLICY IF EXISTS comment_reactions_insert_own ON public.comment_reactions;
DROP POLICY IF EXISTS comment_reactions_delete_own ON public.comment_reactions;

NOTIFY pgrst, 'reload schema';
