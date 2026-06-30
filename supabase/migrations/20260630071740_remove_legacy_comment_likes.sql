DO $$
BEGIN
  IF to_regclass('public.comment_likes') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS update_comment_like_count ON public.comment_likes;
  END IF;

  IF to_regclass('public.comment_reactions') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS update_comment_reaction_like_count ON public.comment_reactions;
  END IF;
END $$;

DROP FUNCTION IF EXISTS public.update_comment_like_count();
DROP TABLE IF EXISTS public.comment_likes;

ALTER TABLE public.comments
  DROP COLUMN IF EXISTS like_count;
