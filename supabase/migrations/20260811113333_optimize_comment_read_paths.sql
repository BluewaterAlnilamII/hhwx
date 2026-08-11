CREATE INDEX IF NOT EXISTS idx_comment_reactions_comment_emoji_created_at_user_id
  ON public.comment_reactions (comment_id, emoji_key, created_at, user_id);

DROP INDEX IF EXISTS public.idx_comment_reactions_comment_emoji_created_at;

CREATE INDEX IF NOT EXISTS idx_comments_visible_thread_preview
  ON public.comments (root_id, created_at, id)
  WHERE parent_id IS NOT NULL AND moderation_status = 'visible';

DROP FUNCTION IF EXISTS public.read_comment_reaction_summary_rows(UUID[], UUID);

CREATE FUNCTION public.read_comment_reaction_summary_rows(
  p_comment_ids UUID[],
  p_viewer_user_id UUID
)
RETURNS TABLE (
  comment_id UUID,
  reaction_groups JSONB
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  WITH reaction_summaries AS MATERIALIZED (
    SELECT
      reaction.comment_id,
      reaction.emoji_key,
      COUNT(*) AS reaction_count,
      COALESCE(
        BOOL_OR(reaction.user_id = p_viewer_user_id),
        FALSE
      ) AS reacted_by_viewer,
      MIN(reaction.created_at) AS first_reacted_at
    FROM public.comment_reactions AS reaction
    WHERE reaction.comment_id = ANY(COALESCE(p_comment_ids, ARRAY[]::UUID[]))
    GROUP BY reaction.comment_id, reaction.emoji_key
  ), reaction_groups AS (
    SELECT
      summary.comment_id,
      summary.emoji_key,
      summary.reaction_count,
      summary.reacted_by_viewer,
      summary.first_reacted_at,
      participant_preview.users
    FROM reaction_summaries AS summary
    CROSS JOIN LATERAL (
      SELECT JSONB_AGG(
        JSONB_BUILD_OBJECT(
          'user_id', participant.user_id,
          'username', profile.username,
          'avatar_card_id', profile.avatar_card_id,
          'avatar_card_server', profile.avatar_card_server,
          'avatar_card_train_type', profile.avatar_card_train_type,
          'reacted_at', participant.reacted_at
        )
        ORDER BY participant.reacted_at, participant.user_id
      ) AS users
      FROM (
        SELECT
          reaction.user_id,
          reaction.created_at AS reacted_at
        FROM public.comment_reactions AS reaction
        WHERE reaction.comment_id = summary.comment_id
          AND reaction.emoji_key = summary.emoji_key
        ORDER BY reaction.created_at, reaction.user_id
        LIMIT 8
      ) AS participant
      LEFT JOIN public.profiles AS profile ON profile.id = participant.user_id
    ) AS participant_preview
  )
  SELECT
    reaction_group.comment_id,
    JSONB_AGG(
      JSONB_BUILD_OBJECT(
        'emoji_key', reaction_group.emoji_key,
        'reaction_count', reaction_group.reaction_count,
        'reacted_by_viewer', reaction_group.reacted_by_viewer,
        'first_reacted_at', reaction_group.first_reacted_at,
        'users', reaction_group.users
      )
      ORDER BY reaction_group.first_reacted_at, reaction_group.emoji_key
    ) AS reaction_groups
  FROM reaction_groups AS reaction_group
  GROUP BY reaction_group.comment_id
  ORDER BY reaction_group.comment_id;
$$;

CREATE OR REPLACE FUNCTION public.read_comment_preview_reply_ids(
  p_root_ids UUID[]
)
RETURNS TABLE (
  root_id UUID,
  reply_id UUID
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  WITH ranked_replies AS (
    SELECT
      comment.root_id,
      comment.id,
      ROW_NUMBER() OVER (
        PARTITION BY comment.root_id
        ORDER BY comment.created_at, comment.id
      ) AS reply_rank
    FROM public.comments AS comment
    WHERE comment.root_id = ANY(COALESCE(p_root_ids, ARRAY[]::UUID[]))
      AND comment.parent_id IS NOT NULL
      AND comment.moderation_status = 'visible'
  )
  SELECT
    ranked.root_id,
    ranked.id AS reply_id
  FROM ranked_replies AS ranked
  WHERE ranked.reply_rank <= 3
  ORDER BY ranked.root_id, ranked.reply_rank;
$$;

COMMENT ON FUNCTION public.read_comment_reaction_summary_rows(UUID[], UUID) IS
  'Server-only comment reaction summaries returned as one ordered JSON group array per comment.';

COMMENT ON FUNCTION public.read_comment_preview_reply_ids(UUID[]) IS
  'Server-only batch lookup for the first three visible replies in each requested comment thread.';

REVOKE ALL ON FUNCTION public.read_comment_reaction_summary_rows(UUID[], UUID)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.read_comment_preview_reply_ids(UUID[])
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.read_comment_reaction_summary_rows(UUID[], UUID)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.read_comment_preview_reply_ids(UUID[])
  TO service_role;

NOTIFY pgrst, 'reload schema';
