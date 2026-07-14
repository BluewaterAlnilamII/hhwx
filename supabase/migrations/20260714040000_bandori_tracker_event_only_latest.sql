-- Cutoff 高频 latest 自此只发布活动榜；歌曲榜和月榜继续保留低频历史。

CREATE OR REPLACE FUNCTION public.upsert_bandori_tracker_event_latest(
    p_server text,
    p_target_id integer,
    p_sample_id text,
    p_published_at bigint,
    p_payload_patch jsonb
)
RETURNS TABLE(status text, revision bigint, payload jsonb)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    rpc_result record;
    event_payload jsonb;
BEGIN
    IF p_payload_patch IS NULL
       OR jsonb_typeof(p_payload_patch) <> 'object'
       OR NOT (p_payload_patch ? 'event')
       OR EXISTS (
            SELECT 1
            FROM jsonb_object_keys(p_payload_patch) AS keys(key_name)
            WHERE key_name <> 'event'
       ) THEN
        RAISE EXCEPTION 'event latest patch must contain only event points';
    END IF;

    SELECT * INTO rpc_result
    FROM public.upsert_bandori_tracker_latest(
        p_server,
        'events',
        p_target_id,
        NULL,
        p_sample_id,
        p_published_at,
        p_payload_patch
    );

    event_payload := rpc_result.payload;
    IF rpc_result.status = 'written' AND event_payload ? 'songs' THEN
        event_payload := event_payload - 'songs';
        UPDATE public.bandori_tracker_latest AS latest
        SET payload = event_payload
        WHERE latest.server = p_server
          AND latest.namespace = 'events'
          AND latest.target_id = p_target_id
          AND latest.revision = rpc_result.revision;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'event latest cleanup lost the merged snapshot row';
        END IF;
    END IF;

    RETURN QUERY SELECT
        rpc_result.status::text,
        rpc_result.revision::bigint,
        event_payload;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_bandori_tracker_event_latest(
    text,
    integer,
    text,
    bigint,
    jsonb
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.upsert_bandori_tracker_event_latest(
    text,
    integer,
    text,
    bigint,
    jsonb
) TO service_role;
