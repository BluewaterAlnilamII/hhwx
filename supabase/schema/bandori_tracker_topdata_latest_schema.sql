-- Legacy/reference SQL snapshot retained for setup compatibility.
-- supabase/migrations/** is the sole source of truth for new schema changes.
-- Do not treat edits here as migrations or as an independent schema authority.

-- Snapshot of authenticated Bandori event TOP10 latest structures.
-- hhwx-tracker is the only writer; registered users can bootstrap one complete
-- snapshot before consuming the matching private Broadcast topic.

CREATE TABLE IF NOT EXISTS public.bandori_tracker_topdata_latest_snapshots (
    server text NOT NULL,
    event_id integer NOT NULL,
    schema_version smallint NOT NULL DEFAULT 1,
    revision bigint NOT NULL,
    observed_at bigint NOT NULL,
    sample_id text NOT NULL,
    payload jsonb NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
    PRIMARY KEY (server, event_id),
    CONSTRAINT chk_bandori_tracker_topdata_latest_server
        CHECK (server = 'cn'),
    CONSTRAINT chk_bandori_tracker_topdata_latest_event
        CHECK ((event_id BETWEEN 1 AND 2147483647) IS TRUE),
    CONSTRAINT chk_bandori_tracker_topdata_latest_schema
        CHECK (schema_version = 1),
    CONSTRAINT chk_bandori_tracker_topdata_latest_revision
        CHECK ((revision BETWEEN 1 AND 9007199254740991) IS TRUE),
    CONSTRAINT chk_bandori_tracker_topdata_latest_observed_at
        CHECK ((observed_at BETWEEN 1 AND 9007199254740991) IS TRUE),
    CONSTRAINT chk_bandori_tracker_topdata_latest_sample_id
        CHECK ((pg_catalog.char_length(sample_id) BETWEEN 1 AND 160) IS TRUE),
    CONSTRAINT chk_bandori_tracker_topdata_latest_payload
        CHECK ((
            pg_catalog.jsonb_typeof(payload) = 'object'
            AND payload ?& ARRAY[
                'schemaVersion', 'server', 'namespace', 'targetId', 'revision',
                'sampleId', 'publishedAt', 'points', 'users'
            ]
            AND (
                payload - ARRAY[
                    'schemaVersion', 'server', 'namespace', 'targetId', 'revision',
                    'sampleId', 'publishedAt', 'points', 'users'
                ]::text[]
            ) = '{}'::jsonb
            AND payload -> 'schemaVersion' = '1'::jsonb
            AND payload ->> 'server' = server
            AND payload ->> 'namespace' = 'events'
            AND pg_catalog.jsonb_typeof(payload -> 'targetId') = 'number'
            AND payload ->> 'targetId' ~ '^[0-9]+$'
            AND (payload ->> 'targetId')::bigint = event_id
            AND pg_catalog.jsonb_typeof(payload -> 'revision') = 'number'
            AND payload ->> 'revision' ~ '^[0-9]+$'
            AND (payload ->> 'revision')::bigint = revision
            AND payload ->> 'sampleId' = sample_id
            AND pg_catalog.jsonb_typeof(payload -> 'publishedAt') = 'number'
            AND payload ->> 'publishedAt' ~ '^[0-9]+$'
            AND (payload ->> 'publishedAt')::bigint = observed_at
            AND pg_catalog.jsonb_typeof(payload -> 'points') = 'array'
            AND pg_catalog.jsonb_array_length(payload -> 'points') BETWEEN 1 AND 10
            AND pg_catalog.jsonb_typeof(payload -> 'users') = 'array'
            AND pg_catalog.jsonb_array_length(payload -> 'users') BETWEEN 1 AND 10
            AND pg_catalog.jsonb_array_length(payload -> 'users')
                = pg_catalog.jsonb_array_length(payload -> 'points')
            AND pg_catalog.octet_length(payload::text) <= 262144
        ) IS TRUE)
);

ALTER TABLE public.bandori_tracker_topdata_latest_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bandori_tracker_topdata_latest_select_authenticated
ON public.bandori_tracker_topdata_latest_snapshots;

CREATE POLICY bandori_tracker_topdata_latest_select_authenticated
ON public.bandori_tracker_topdata_latest_snapshots
FOR SELECT
TO authenticated
USING (
    (SELECT auth.uid()) IS NOT NULL
    AND COALESCE(((SELECT auth.jwt()) ->> 'is_anonymous')::boolean, false) = false
);

REVOKE ALL ON TABLE public.bandori_tracker_topdata_latest_snapshots
FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.bandori_tracker_topdata_latest_snapshots TO authenticated;
GRANT SELECT, INSERT, UPDATE
ON TABLE public.bandori_tracker_topdata_latest_snapshots
TO service_role;

CREATE OR REPLACE FUNCTION public.upsert_bandori_tracker_topdata_latest(
    p_server text,
    p_event_id integer,
    p_sample_id text,
    p_published_at bigint,
    p_topdata jsonb
)
RETURNS TABLE (
    status text,
    revision bigint,
    payload jsonb
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    existing_row public.bandori_tracker_topdata_latest_snapshots%ROWTYPE;
    next_revision bigint;
    canonical_payload jsonb;
    point_value jsonb;
    user_value jsonb;
BEGIN
    IF p_server IS DISTINCT FROM 'cn' THEN
        RAISE EXCEPTION 'invalid topdata latest server: %', p_server;
    END IF;
    IF p_event_id IS NULL OR p_event_id NOT BETWEEN 1 AND 2147483647 THEN
        RAISE EXCEPTION 'invalid topdata latest event_id: %', p_event_id;
    END IF;
    IF p_published_at IS NULL
       OR p_published_at NOT BETWEEN 1 AND 9007199254740991 THEN
        RAISE EXCEPTION 'invalid topdata latest publishedAt: %', p_published_at;
    END IF;
    IF p_sample_id IS NULL
       OR pg_catalog.char_length(p_sample_id) > 160
       OR p_sample_id <> pg_catalog.format(
            '%s:topdata:events:%s:%s',
            p_server,
            p_event_id,
            p_published_at
       ) THEN
        RAISE EXCEPTION 'invalid topdata latest sampleId: %', p_sample_id;
    END IF;
    IF p_topdata IS NULL
       OR pg_catalog.jsonb_typeof(p_topdata) <> 'object'
       OR NOT (p_topdata ? 'points')
       OR NOT (p_topdata ? 'users')
       OR pg_catalog.octet_length(p_topdata::text) > 262144
       OR (
            SELECT count(*)
            FROM pg_catalog.jsonb_object_keys(p_topdata)
       ) <> 2 THEN
        RAISE EXCEPTION 'topdata latest input must contain only points and users';
    END IF;
    IF pg_catalog.jsonb_typeof(p_topdata -> 'points') <> 'array'
       OR pg_catalog.jsonb_array_length(p_topdata -> 'points') NOT BETWEEN 1 AND 10 THEN
        RAISE EXCEPTION 'topdata latest points must contain between one and ten entries';
    END IF;
    IF pg_catalog.jsonb_typeof(p_topdata -> 'users') <> 'array'
       OR pg_catalog.jsonb_array_length(p_topdata -> 'users') NOT BETWEEN 1 AND 10
       OR pg_catalog.jsonb_array_length(p_topdata -> 'users')
            <> pg_catalog.jsonb_array_length(p_topdata -> 'points') THEN
        RAISE EXCEPTION 'topdata latest users must exactly match the point count';
    END IF;

    FOR point_value IN
        SELECT value
        FROM pg_catalog.jsonb_array_elements(p_topdata -> 'points')
    LOOP
        IF pg_catalog.jsonb_typeof(point_value) <> 'object'
           OR (
                SELECT count(*)
                FROM pg_catalog.jsonb_object_keys(point_value)
           ) <> 3
           OR NOT (point_value ?& ARRAY['time', 'uid', 'value'])
           OR pg_catalog.jsonb_typeof(point_value -> 'time') <> 'number'
           OR pg_catalog.jsonb_typeof(point_value -> 'uid') <> 'number'
           OR pg_catalog.jsonb_typeof(point_value -> 'value') <> 'number'
           OR point_value ->> 'time' !~ '^[0-9]+$'
           OR point_value ->> 'uid' !~ '^[0-9]+$'
           OR point_value ->> 'value' !~ '^[0-9]+$'
           OR (point_value ->> 'time')::bigint <> p_published_at
           OR (point_value ->> 'uid')::bigint NOT BETWEEN 1 AND 9007199254740991
           OR (point_value ->> 'value')::bigint NOT BETWEEN 1 AND 9007199254740991 THEN
            RAISE EXCEPTION 'topdata latest point is invalid';
        END IF;
    END LOOP;

    IF EXISTS (
        SELECT 1
        FROM pg_catalog.jsonb_array_elements(p_topdata -> 'points') AS points(point)
        GROUP BY point ->> 'uid'
        HAVING count(*) > 1
    ) THEN
        RAISE EXCEPTION 'topdata latest points contain duplicate UIDs';
    END IF;
    IF EXISTS (
        SELECT 1
        FROM (
            SELECT
                (point ->> 'value')::bigint AS score,
                lag((point ->> 'value')::bigint) OVER (ORDER BY ordinal) AS previous_score
            FROM pg_catalog.jsonb_array_elements(p_topdata -> 'points')
                WITH ORDINALITY AS points(point, ordinal)
        ) AS ordered_points
        WHERE previous_score IS NOT NULL AND score > previous_score
    ) THEN
        RAISE EXCEPTION 'topdata latest point values must be non-increasing';
    END IF;

    FOR user_value IN
        SELECT value
        FROM pg_catalog.jsonb_array_elements(p_topdata -> 'users')
    LOOP
        IF pg_catalog.jsonb_typeof(user_value) <> 'object'
           OR (
                SELECT count(*)
                FROM pg_catalog.jsonb_object_keys(user_value)
           ) <> 7
           OR NOT (
                user_value ?& ARRAY[
                    'uid',
                    'name',
                    'introduction',
                    'rank',
                    'sid',
                    'strained',
                    'degrees'
                ]
           )
           OR pg_catalog.jsonb_typeof(user_value -> 'uid') <> 'number'
           OR pg_catalog.jsonb_typeof(user_value -> 'name') <> 'string'
           OR pg_catalog.jsonb_typeof(user_value -> 'introduction') <> 'string'
           OR pg_catalog.jsonb_typeof(user_value -> 'rank') <> 'number'
           OR pg_catalog.jsonb_typeof(user_value -> 'sid') <> 'number'
           OR pg_catalog.jsonb_typeof(user_value -> 'strained') <> 'number'
           OR pg_catalog.jsonb_typeof(user_value -> 'degrees') <> 'array'
           OR pg_catalog.jsonb_array_length(user_value -> 'degrees') > 2
           OR user_value ->> 'uid' !~ '^[0-9]+$'
           OR user_value ->> 'rank' !~ '^[0-9]+$'
           OR user_value ->> 'sid' !~ '^[0-9]+$'
           OR user_value ->> 'strained' !~ '^(0|1)$'
           OR (user_value ->> 'uid')::bigint NOT BETWEEN 1 AND 9007199254740991
           OR (user_value ->> 'rank')::bigint NOT BETWEEN 1 AND 9007199254740991
           OR (user_value ->> 'sid')::bigint NOT BETWEEN 0 AND 9007199254740991
           OR EXISTS (
                SELECT 1
                FROM pg_catalog.jsonb_array_elements(user_value -> 'degrees') AS degree(value)
                WHERE pg_catalog.jsonb_typeof(degree.value) <> 'number'
                   OR degree.value #>> '{}' !~ '^[0-9]+$'
                   OR (degree.value #>> '{}')::bigint NOT BETWEEN 1 AND 9007199254740991
           ) THEN
            RAISE EXCEPTION 'topdata latest user is invalid';
        END IF;
    END LOOP;

    IF EXISTS (
        SELECT 1
        FROM pg_catalog.jsonb_array_elements(p_topdata -> 'users') AS users(user_profile)
        GROUP BY user_profile ->> 'uid'
        HAVING count(*) > 1
    ) THEN
        RAISE EXCEPTION 'topdata latest users contain duplicate UIDs';
    END IF;
    IF EXISTS (
        SELECT 1
        FROM (
            SELECT
                (user_profile ->> 'uid')::bigint AS uid,
                lag((user_profile ->> 'uid')::bigint) OVER (ORDER BY ordinal) AS previous_uid
            FROM pg_catalog.jsonb_array_elements(p_topdata -> 'users')
                WITH ORDINALITY AS users(user_profile, ordinal)
        ) AS ordered_users
        WHERE previous_uid IS NOT NULL AND uid <= previous_uid
    ) THEN
        RAISE EXCEPTION 'topdata latest users must be sorted by UID';
    END IF;
    IF EXISTS (
        (
            SELECT point ->> 'uid'
            FROM pg_catalog.jsonb_array_elements(p_topdata -> 'points') AS points(point)
            EXCEPT
            SELECT user_profile ->> 'uid'
            FROM pg_catalog.jsonb_array_elements(p_topdata -> 'users') AS users(user_profile)
        )
        UNION ALL
        (
            SELECT user_profile ->> 'uid'
            FROM pg_catalog.jsonb_array_elements(p_topdata -> 'users') AS users(user_profile)
            EXCEPT
            SELECT point ->> 'uid'
            FROM pg_catalog.jsonb_array_elements(p_topdata -> 'points') AS points(point)
        )
    ) THEN
        RAISE EXCEPTION 'topdata latest users must exactly cover point UIDs';
    END IF;

    PERFORM pg_advisory_xact_lock(
        pg_catalog.hashtextextended(pg_catalog.format('%s:%s', p_server, p_event_id), 0)
    );

    SELECT *
    INTO existing_row
    FROM public.bandori_tracker_topdata_latest_snapshots AS latest
    WHERE latest.server = p_server
      AND latest.event_id = p_event_id
    FOR UPDATE;

    IF FOUND AND existing_row.observed_at > p_published_at THEN
        RETURN QUERY SELECT 'stale'::text, existing_row.revision, existing_row.payload;
        RETURN;
    END IF;
    IF FOUND AND existing_row.observed_at = p_published_at THEN
        IF existing_row.sample_id = p_sample_id
           AND existing_row.payload -> 'points' = p_topdata -> 'points'
           AND existing_row.payload -> 'users' = p_topdata -> 'users' THEN
            RETURN QUERY SELECT 'duplicate'::text, existing_row.revision, existing_row.payload;
        ELSE
            RETURN QUERY SELECT 'conflict'::text, existing_row.revision, existing_row.payload;
        END IF;
        RETURN;
    END IF;

    IF FOUND AND existing_row.revision >= 9007199254740991 THEN
        RAISE EXCEPTION 'topdata latest revision exhausted';
    END IF;
    next_revision := CASE WHEN FOUND THEN existing_row.revision + 1 ELSE 1 END;
    canonical_payload := pg_catalog.jsonb_build_object(
        'schemaVersion', 1,
        'server', p_server,
        'namespace', 'events',
        'targetId', p_event_id,
        'revision', next_revision,
        'sampleId', p_sample_id,
        'publishedAt', p_published_at,
        'points', p_topdata -> 'points',
        'users', p_topdata -> 'users'
    );
    IF pg_catalog.octet_length(canonical_payload::text) > 262144 THEN
        RAISE EXCEPTION 'topdata latest canonical payload exceeds 262144 bytes';
    END IF;

    INSERT INTO public.bandori_tracker_topdata_latest_snapshots AS latest (
        server,
        event_id,
        schema_version,
        revision,
        observed_at,
        sample_id,
        payload,
        updated_at
    ) VALUES (
        p_server,
        p_event_id,
        1,
        next_revision,
        p_published_at,
        p_sample_id,
        canonical_payload,
        pg_catalog.now()
    )
    ON CONFLICT (server, event_id)
    DO UPDATE SET
        schema_version = EXCLUDED.schema_version,
        revision = EXCLUDED.revision,
        observed_at = EXCLUDED.observed_at,
        sample_id = EXCLUDED.sample_id,
        payload = EXCLUDED.payload,
        updated_at = EXCLUDED.updated_at;

    RETURN QUERY SELECT 'written'::text, next_revision, canonical_payload;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_bandori_tracker_topdata_latest(
    text,
    integer,
    text,
    bigint,
    jsonb
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.upsert_bandori_tracker_topdata_latest(
    text,
    integer,
    text,
    bigint,
    jsonb
) TO service_role;

DROP POLICY IF EXISTS bandori_topdata_private_broadcast_select
ON realtime.messages;

CREATE POLICY bandori_topdata_private_broadcast_select
ON realtime.messages
FOR SELECT
TO authenticated
USING (
    realtime.messages.extension = 'broadcast'
    AND (SELECT auth.uid()) IS NOT NULL
    AND COALESCE(((SELECT auth.jwt()) ->> 'is_anonymous')::boolean, false) = false
    AND (SELECT realtime.topic()) ~
        '^bandori:topdata:cn:events:[1-9][0-9]*$'
);
