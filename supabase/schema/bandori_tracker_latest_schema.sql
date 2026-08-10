-- Legacy/reference SQL snapshot retained for setup compatibility.
-- supabase/migrations/** is the sole source of truth for new schema changes.
-- Do not treat edits here as migrations or as an independent schema authority.

-- Snapshot of the authenticated cutoff latest structure.
-- hhwx-bandori-backend publishes snapshots through the service role. Browser clients
-- can only read snapshots and receive matching private Broadcast topics.

CREATE TABLE IF NOT EXISTS public.bandori_tracker_latest (
    server text NOT NULL,
    namespace text NOT NULL,
    target_id integer NOT NULL,
    period text,
    schema_version smallint NOT NULL DEFAULT 1,
    revision bigint NOT NULL,
    observed_at bigint NOT NULL,
    sample_id text NOT NULL,
    payload jsonb NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (server, namespace, target_id),
    CONSTRAINT chk_bandori_tracker_latest_server
        CHECK (server IN ('jp', 'en', 'tw', 'cn')),
    CONSTRAINT chk_bandori_tracker_latest_namespace
        CHECK (namespace IN ('events', 'monthly')),
    CONSTRAINT chk_bandori_tracker_latest_target
        CHECK (
            (namespace = 'events' AND target_id > 0 AND period IS NULL)
            OR (
                namespace = 'monthly'
                AND target_id >= 0
                AND period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
                AND period = (
                    (2025 + target_id / 12)::text
                    || '-'
                    || lpad(((target_id % 12) + 1)::text, 2, '0')
                )
            )
        ),
    CONSTRAINT chk_bandori_tracker_latest_schema_version
        CHECK (schema_version = 1),
    CONSTRAINT chk_bandori_tracker_latest_revision
        CHECK (revision > 0),
    CONSTRAINT chk_bandori_tracker_latest_observed_at
        CHECK (observed_at > 0),
    CONSTRAINT chk_bandori_tracker_latest_sample_id
        CHECK (length(sample_id) BETWEEN 1 AND 160),
    CONSTRAINT chk_bandori_tracker_latest_payload
        CHECK (jsonb_typeof(payload) = 'object')
);

ALTER TABLE public.bandori_tracker_latest ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bandori_tracker_latest_select_authenticated
ON public.bandori_tracker_latest;

CREATE POLICY bandori_tracker_latest_select_authenticated
ON public.bandori_tracker_latest
FOR SELECT
TO authenticated
USING (
    (SELECT auth.uid()) IS NOT NULL
    AND COALESCE(((SELECT auth.jwt()) ->> 'is_anonymous')::boolean, false) = false
);

REVOKE ALL ON TABLE public.bandori_tracker_latest FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.bandori_tracker_latest TO authenticated;
GRANT ALL ON TABLE public.bandori_tracker_latest TO service_role;

CREATE OR REPLACE FUNCTION public.upsert_bandori_tracker_latest(
    p_server text,
    p_namespace text,
    p_target_id integer,
    p_period text,
    p_sample_id text,
    p_published_at bigint,
    p_payload_patch jsonb
)
RETURNS TABLE (
    status text,
    revision bigint,
    payload jsonb
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
    existing_row public.bandori_tracker_latest%ROWTYPE;
    existing_point jsonb;
    incoming_point jsonb;
    merged_event jsonb := '[]'::jsonb;
    merged_songs jsonb := '[]'::jsonb;
    merged_monthly jsonb := '[]'::jsonb;
    expected_patch jsonb;
    merged_payload jsonb;
    next_revision bigint;
    snapshot_published_at bigint;
    snapshot_sample_id text;
    incoming_time bigint;
    existing_time bigint;
    was_applied boolean := false;
BEGIN
    IF p_server NOT IN ('jp', 'en', 'tw', 'cn') THEN
        RAISE EXCEPTION 'invalid cutoff latest server: %', p_server;
    END IF;
    IF p_namespace NOT IN ('events', 'monthly') THEN
        RAISE EXCEPTION 'invalid cutoff latest namespace: %', p_namespace;
    END IF;
    IF p_target_id IS NULL OR p_target_id < 0 OR (p_namespace = 'events' AND p_target_id = 0) THEN
        RAISE EXCEPTION 'invalid cutoff latest target_id: %', p_target_id;
    END IF;
    IF p_namespace = 'events' AND p_period IS NOT NULL THEN
        RAISE EXCEPTION 'event snapshot period must be null';
    END IF;
    IF p_namespace = 'monthly'
       AND (
           p_period IS NULL
           OR p_period !~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
           OR p_period <> (
               (2025 + p_target_id / 12)::text
               || '-'
               || lpad(((p_target_id % 12) + 1)::text, 2, '0')
           )
       ) THEN
        RAISE EXCEPTION 'invalid cutoff latest monthly period: %', p_period;
    END IF;
    IF p_published_at IS NULL OR p_published_at <= 0 THEN
        RAISE EXCEPTION 'invalid cutoff latest publishedAt: %', p_published_at;
    END IF;
    IF p_sample_id IS NULL
       OR p_sample_id <> format('%s:%s:%s:%s', p_server, p_namespace, p_target_id, p_published_at) THEN
        RAISE EXCEPTION 'invalid cutoff latest sampleId: %', p_sample_id;
    END IF;
    IF p_payload_patch IS NULL OR jsonb_typeof(p_payload_patch) <> 'object' THEN
        RAISE EXCEPTION 'cutoff latest payload patch must be an object';
    END IF;

    -- Serialize writers even when the target row does not exist yet.
    PERFORM pg_advisory_xact_lock(
        hashtextextended(format('%s:%s:%s', p_server, p_namespace, p_target_id), 0)
    );

    SELECT *
    INTO existing_row
    FROM public.bandori_tracker_latest AS latest
    WHERE latest.server = p_server
      AND latest.namespace = p_namespace
      AND latest.target_id = p_target_id
    FOR UPDATE;

    IF FOUND THEN
        merged_event := COALESCE(existing_row.payload -> 'event', '[]'::jsonb);
        merged_songs := COALESCE(existing_row.payload -> 'songs', '[]'::jsonb);
        merged_monthly := COALESCE(existing_row.payload -> 'monthly', '[]'::jsonb);
    END IF;

    -- The current sample can only be retried with the exact canonical patch
    -- that originally produced its top-level sample identity. This rejects
    -- empty/subset retries without adding a private hash to the public payload.
    IF FOUND AND existing_row.sample_id = p_sample_id THEN
        expected_patch := '{}'::jsonb;
        IF p_namespace = 'events' THEN
            SELECT COALESCE(
                jsonb_agg(value ORDER BY (value ->> 0)::integer),
                '[]'::jsonb
            )
            INTO merged_event
            FROM jsonb_array_elements(merged_event)
            WHERE (value ->> 1)::bigint = p_published_at;

            SELECT COALESCE(
                jsonb_agg(value ORDER BY (value ->> 1)::integer, (value ->> 0)::integer),
                '[]'::jsonb
            )
            INTO merged_songs
            FROM jsonb_array_elements(merged_songs)
            WHERE (value ->> 2)::bigint = p_published_at;

            IF jsonb_array_length(merged_event) > 0 THEN
                expected_patch := expected_patch || jsonb_build_object('event', merged_event);
            END IF;
            IF jsonb_array_length(merged_songs) > 0 THEN
                expected_patch := expected_patch || jsonb_build_object('songs', merged_songs);
            END IF;
        ELSE
            SELECT COALESCE(
                jsonb_agg(value ORDER BY (value ->> 0)::integer),
                '[]'::jsonb
            )
            INTO merged_monthly
            FROM jsonb_array_elements(merged_monthly)
            WHERE (value ->> 1)::bigint = p_published_at;
            expected_patch := jsonb_build_object('monthly', merged_monthly);
        END IF;

        RETURN QUERY SELECT
            (CASE WHEN p_payload_patch = expected_patch THEN 'duplicate' ELSE 'conflict' END)::text,
            existing_row.revision,
            existing_row.payload;
        RETURN;
    END IF;

    IF p_namespace = 'events' THEN
        IF p_payload_patch ? 'monthly' THEN
            RAISE EXCEPTION 'event snapshot patch cannot contain monthly points';
        END IF;
        IF EXISTS (
            SELECT 1
            FROM jsonb_array_elements(COALESCE(p_payload_patch -> 'event', '[]'::jsonb))
            GROUP BY value ->> 0
            HAVING count(*) > 1
        ) THEN
            RAISE EXCEPTION 'event snapshot patch contains duplicate tiers';
        END IF;
        IF EXISTS (
            SELECT 1
            FROM jsonb_array_elements(COALESCE(p_payload_patch -> 'songs', '[]'::jsonb))
            GROUP BY value ->> 0, value ->> 1
            HAVING count(*) > 1
        ) THEN
            RAISE EXCEPTION 'event snapshot patch contains duplicate song/tier keys';
        END IF;

        FOR incoming_point IN
            SELECT value
            FROM jsonb_array_elements(COALESCE(p_payload_patch -> 'event', '[]'::jsonb))
        LOOP
            IF jsonb_typeof(incoming_point) <> 'array'
               OR jsonb_array_length(incoming_point) NOT IN (3, 4)
               OR jsonb_typeof(incoming_point -> 0) <> 'number'
               OR jsonb_typeof(incoming_point -> 1) <> 'number'
               OR jsonb_typeof(incoming_point -> 2) <> 'number'
               OR (jsonb_array_length(incoming_point) = 4 AND jsonb_typeof(incoming_point -> 3) <> 'number')
               OR (incoming_point ->> 0) !~ '^[0-9]+$'
               OR (incoming_point ->> 1) !~ '^[0-9]+$'
               OR (incoming_point ->> 2) !~ '^[0-9]+$'
               OR (jsonb_array_length(incoming_point) = 4 AND (incoming_point ->> 3) !~ '^[0-9]+$')
               OR (incoming_point ->> 0)::integer <= 0
               OR (incoming_point ->> 1)::bigint <= 0
               OR (incoming_point ->> 1)::bigint <> p_published_at
               OR (incoming_point ->> 2)::integer <= 0
               OR (jsonb_array_length(incoming_point) = 4 AND (incoming_point ->> 3)::integer <= 0) THEN
                RAISE EXCEPTION 'invalid cutoff latest event point: %', incoming_point;
            END IF;

            existing_point := NULL;
            SELECT value INTO existing_point
            FROM jsonb_array_elements(merged_event)
            WHERE (value ->> 0)::integer = (incoming_point ->> 0)::integer
            LIMIT 1;

            IF existing_point IS NULL THEN
                merged_event := merged_event || jsonb_build_array(incoming_point);
                was_applied := true;
            ELSE
                incoming_time := (incoming_point ->> 1)::bigint;
                existing_time := (existing_point ->> 1)::bigint;
                IF incoming_time > existing_time THEN
                    SELECT COALESCE(
                        jsonb_agg(
                            CASE
                                WHEN (value ->> 0)::integer = (incoming_point ->> 0)::integer
                                THEN incoming_point
                                ELSE value
                            END
                            ORDER BY (value ->> 0)::integer
                        ),
                        '[]'::jsonb
                    )
                    INTO merged_event
                    FROM jsonb_array_elements(merged_event);
                    was_applied := true;
                ELSIF incoming_time = existing_time AND incoming_point <> existing_point THEN
                    RETURN QUERY SELECT 'conflict'::text, existing_row.revision, existing_row.payload;
                    RETURN;
                END IF;
            END IF;
        END LOOP;

        FOR incoming_point IN
            SELECT value
            FROM jsonb_array_elements(COALESCE(p_payload_patch -> 'songs', '[]'::jsonb))
        LOOP
            IF jsonb_typeof(incoming_point) <> 'array'
               OR jsonb_array_length(incoming_point) NOT IN (4, 5)
               OR jsonb_typeof(incoming_point -> 0) <> 'number'
               OR jsonb_typeof(incoming_point -> 1) <> 'number'
               OR jsonb_typeof(incoming_point -> 2) <> 'number'
               OR jsonb_typeof(incoming_point -> 3) <> 'number'
               OR (jsonb_array_length(incoming_point) = 5 AND jsonb_typeof(incoming_point -> 4) <> 'number')
               OR (incoming_point ->> 0) !~ '^[0-9]+$'
               OR (incoming_point ->> 1) !~ '^[0-9]+$'
               OR (incoming_point ->> 2) !~ '^[0-9]+$'
               OR (incoming_point ->> 3) !~ '^[0-9]+$'
               OR (jsonb_array_length(incoming_point) = 5 AND (incoming_point ->> 4) !~ '^[0-9]+$')
               OR (incoming_point ->> 0)::integer <= 0
               OR (incoming_point ->> 1)::integer <= 0
               OR (incoming_point ->> 2)::bigint <= 0
               OR (incoming_point ->> 2)::bigint <> p_published_at
               OR (incoming_point ->> 3)::integer <= 0
               OR (jsonb_array_length(incoming_point) = 5 AND (incoming_point ->> 4)::integer <= 0) THEN
                RAISE EXCEPTION 'invalid cutoff latest song point: %', incoming_point;
            END IF;

            existing_point := NULL;
            SELECT value INTO existing_point
            FROM jsonb_array_elements(merged_songs)
            WHERE (value ->> 0)::integer = (incoming_point ->> 0)::integer
              AND (value ->> 1)::integer = (incoming_point ->> 1)::integer
            LIMIT 1;

            IF existing_point IS NULL THEN
                merged_songs := merged_songs || jsonb_build_array(incoming_point);
                was_applied := true;
            ELSE
                incoming_time := (incoming_point ->> 2)::bigint;
                existing_time := (existing_point ->> 2)::bigint;
                IF incoming_time > existing_time THEN
                    SELECT COALESCE(
                        jsonb_agg(
                            CASE
                                WHEN (value ->> 0)::integer = (incoming_point ->> 0)::integer
                                 AND (value ->> 1)::integer = (incoming_point ->> 1)::integer
                                THEN incoming_point
                                ELSE value
                            END
                            ORDER BY (value ->> 1)::integer, (value ->> 0)::integer
                        ),
                        '[]'::jsonb
                    )
                    INTO merged_songs
                    FROM jsonb_array_elements(merged_songs);
                    was_applied := true;
                ELSIF incoming_time = existing_time AND incoming_point <> existing_point THEN
                    RETURN QUERY SELECT 'conflict'::text, existing_row.revision, existing_row.payload;
                    RETURN;
                END IF;
            END IF;
        END LOOP;
    ELSE
        IF p_payload_patch ? 'event' OR p_payload_patch ? 'songs' THEN
            RAISE EXCEPTION 'monthly snapshot patch cannot contain event or song points';
        END IF;
        IF EXISTS (
            SELECT 1
            FROM jsonb_array_elements(COALESCE(p_payload_patch -> 'monthly', '[]'::jsonb))
            GROUP BY value ->> 0
            HAVING count(*) > 1
        ) THEN
            RAISE EXCEPTION 'monthly snapshot patch contains duplicate tiers';
        END IF;

        FOR incoming_point IN
            SELECT value
            FROM jsonb_array_elements(COALESCE(p_payload_patch -> 'monthly', '[]'::jsonb))
        LOOP
            IF jsonb_typeof(incoming_point) <> 'array'
               OR jsonb_array_length(incoming_point) NOT IN (3, 4)
               OR jsonb_typeof(incoming_point -> 0) <> 'number'
               OR jsonb_typeof(incoming_point -> 1) <> 'number'
               OR jsonb_typeof(incoming_point -> 2) <> 'number'
               OR (jsonb_array_length(incoming_point) = 4 AND jsonb_typeof(incoming_point -> 3) <> 'number')
               OR (incoming_point ->> 0) !~ '^[0-9]+$'
               OR (incoming_point ->> 1) !~ '^[0-9]+$'
               OR (incoming_point ->> 2) !~ '^[0-9]+$'
               OR (jsonb_array_length(incoming_point) = 4 AND (incoming_point ->> 3) !~ '^[0-9]+$')
               OR (incoming_point ->> 0)::integer <= 0
               OR (incoming_point ->> 1)::bigint <= 0
               OR (incoming_point ->> 1)::bigint <> p_published_at
               OR (incoming_point ->> 2)::integer <= 0
               OR (jsonb_array_length(incoming_point) = 4 AND (incoming_point ->> 3)::integer <= 0) THEN
                RAISE EXCEPTION 'invalid cutoff latest monthly point: %', incoming_point;
            END IF;

            existing_point := NULL;
            SELECT value INTO existing_point
            FROM jsonb_array_elements(merged_monthly)
            WHERE (value ->> 0)::integer = (incoming_point ->> 0)::integer
            LIMIT 1;

            IF existing_point IS NULL THEN
                merged_monthly := merged_monthly || jsonb_build_array(incoming_point);
                was_applied := true;
            ELSE
                incoming_time := (incoming_point ->> 1)::bigint;
                existing_time := (existing_point ->> 1)::bigint;
                IF incoming_time > existing_time THEN
                    SELECT COALESCE(
                        jsonb_agg(
                            CASE
                                WHEN (value ->> 0)::integer = (incoming_point ->> 0)::integer
                                THEN incoming_point
                                ELSE value
                            END
                            ORDER BY (value ->> 0)::integer
                        ),
                        '[]'::jsonb
                    )
                    INTO merged_monthly
                    FROM jsonb_array_elements(merged_monthly);
                    was_applied := true;
                ELSIF incoming_time = existing_time AND incoming_point <> existing_point THEN
                    RETURN QUERY SELECT 'conflict'::text, existing_row.revision, existing_row.payload;
                    RETURN;
                END IF;
            END IF;
        END LOOP;
    END IF;

    IF NOT was_applied THEN
        IF existing_row.revision IS NULL THEN
            RAISE EXCEPTION 'cutoff latest patch contains no points';
        END IF;
        RETURN QUERY SELECT
            (CASE WHEN existing_row.sample_id = p_sample_id THEN 'duplicate' ELSE 'stale' END)::text,
            existing_row.revision,
            existing_row.payload;
        RETURN;
    END IF;

    SELECT COALESCE(
        jsonb_agg(value ORDER BY (value ->> 0)::integer),
        '[]'::jsonb
    ) INTO merged_event
    FROM jsonb_array_elements(merged_event);

    SELECT COALESCE(
        jsonb_agg(value ORDER BY (value ->> 1)::integer, (value ->> 0)::integer),
        '[]'::jsonb
    ) INTO merged_songs
    FROM jsonb_array_elements(merged_songs);

    SELECT COALESCE(
        jsonb_agg(value ORDER BY (value ->> 0)::integer),
        '[]'::jsonb
    ) INTO merged_monthly
    FROM jsonb_array_elements(merged_monthly);

    next_revision := COALESCE(existing_row.revision, 0) + 1;
    snapshot_published_at := GREATEST(COALESCE(existing_row.observed_at, p_published_at), p_published_at);
    snapshot_sample_id := format(
        '%s:%s:%s:%s',
        p_server,
        p_namespace,
        p_target_id,
        snapshot_published_at
    );
    merged_payload := jsonb_build_object(
        'schemaVersion', 1,
        'server', p_server,
        'namespace', p_namespace,
        'targetId', p_target_id,
        'revision', next_revision,
        'sampleId', snapshot_sample_id,
        'publishedAt', snapshot_published_at
    );

    IF p_namespace = 'events' THEN
        IF jsonb_array_length(merged_event) > 0 THEN
            merged_payload := merged_payload || jsonb_build_object('event', merged_event);
        END IF;
        IF jsonb_array_length(merged_songs) > 0 THEN
            merged_payload := merged_payload || jsonb_build_object('songs', merged_songs);
        END IF;
    ELSE
        merged_payload := merged_payload
            || jsonb_build_object('period', p_period, 'monthly', merged_monthly);
    END IF;

    INSERT INTO public.bandori_tracker_latest AS latest (
        server,
        namespace,
        target_id,
        period,
        schema_version,
        revision,
        observed_at,
        sample_id,
        payload,
        updated_at
    ) VALUES (
        p_server,
        p_namespace,
        p_target_id,
        p_period,
        1,
        next_revision,
        snapshot_published_at,
        snapshot_sample_id,
        merged_payload,
        now()
    )
    ON CONFLICT (server, namespace, target_id)
    DO UPDATE SET
        period = EXCLUDED.period,
        schema_version = EXCLUDED.schema_version,
        revision = EXCLUDED.revision,
        observed_at = GREATEST(latest.observed_at, EXCLUDED.observed_at),
        sample_id = EXCLUDED.sample_id,
        payload = EXCLUDED.payload,
        updated_at = EXCLUDED.updated_at;

    RETURN QUERY SELECT 'written'::text, next_revision, merged_payload;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_bandori_tracker_latest(
    text,
    text,
    integer,
    text,
    text,
    bigint,
    jsonb
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.upsert_bandori_tracker_latest(
    text,
    text,
    integer,
    text,
    text,
    bigint,
    jsonb
) TO service_role;

-- Tracker 的高频链路只允许活动榜。保留上面的通用 RPC 以兼容既有数据，
-- 但新的服务端调用统一经过此包装层，并在同一事务内清除旧歌曲榜 latest。
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

DROP POLICY IF EXISTS bandori_cutoff_private_broadcast_select
ON realtime.messages;

CREATE POLICY bandori_cutoff_private_broadcast_select
ON realtime.messages
FOR SELECT
TO authenticated
USING (
    realtime.messages.extension = 'broadcast'
    AND (SELECT auth.uid()) IS NOT NULL
    AND COALESCE(((SELECT auth.jwt()) ->> 'is_anonymous')::boolean, false) = false
    AND (SELECT realtime.topic()) ~
        '^bandori:cutoff:(jp|en|tw|cn):(events:[1-9][0-9]*|monthly:[0-9]{4}-(0[1-9]|1[0-2]))$'
);
