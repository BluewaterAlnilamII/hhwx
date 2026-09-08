CREATE OR REPLACE FUNCTION public.read_comment_reaction_summary_rows(
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
          'public_uid', profile.public_uid,
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

REVOKE ALL ON FUNCTION public.read_comment_reaction_summary_rows(UUID[], UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.read_comment_reaction_summary_rows(UUID[], UUID) TO service_role;

NOTIFY pgrst, 'reload schema';
