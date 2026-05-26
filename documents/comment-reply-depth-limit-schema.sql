-- Incremental migration for flattening event comment replies to one visible layer.
-- Run after the baseline comments schema is already installed.

CREATE OR REPLACE FUNCTION public.increment_comment_reply_count()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.parent_id IS NOT NULL THEN
    UPDATE public.comments
      SET reply_count = reply_count + 1,
          updated_at = NOW()
      WHERE id = NEW.parent_id;

    IF NEW.root_id IS NOT NULL AND NEW.root_id <> NEW.parent_id THEN
      UPDATE public.comments
        SET reply_count = reply_count + 1,
            updated_at = NOW()
        WHERE id = NEW.root_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

UPDATE public.comments AS comment
SET reply_count = COALESCE(counts.reply_count, 0)
FROM (
  SELECT
    comment.id,
    CASE
      WHEN comment.parent_id IS NULL THEN (
        SELECT COUNT(*)::integer
        FROM public.comments AS reply
        WHERE reply.root_id = comment.id
          AND reply.parent_id IS NOT NULL
      )
      ELSE (
        SELECT COUNT(*)::integer
        FROM public.comments AS reply
        WHERE reply.parent_id = comment.id
      )
    END AS reply_count
  FROM public.comments AS comment
) AS counts
WHERE counts.id = comment.id;

