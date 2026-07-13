BEGIN;

DO $$
BEGIN
    IF has_table_privilege('anon', 'public.bandori_tracker_latest', 'SELECT') THEN
        RAISE EXCEPTION 'anon must not read bandori_tracker_latest';
    END IF;
    IF NOT has_table_privilege('authenticated', 'public.bandori_tracker_latest', 'SELECT') THEN
        RAISE EXCEPTION 'authenticated must be able to select bandori_tracker_latest';
    END IF;
    IF has_table_privilege('authenticated', 'public.bandori_tracker_latest', 'INSERT')
       OR has_table_privilege('authenticated', 'public.bandori_tracker_latest', 'UPDATE')
       OR has_table_privilege('authenticated', 'public.bandori_tracker_latest', 'DELETE') THEN
        RAISE EXCEPTION 'authenticated must not mutate bandori_tracker_latest';
    END IF;
    IF has_function_privilege(
        'authenticated',
        'public.upsert_bandori_tracker_latest(text,text,integer,text,text,bigint,jsonb)',
        'EXECUTE'
    ) THEN
        RAISE EXCEPTION 'authenticated must not execute cutoff latest RPC';
    END IF;
    IF NOT has_function_privilege(
        'service_role',
        'public.upsert_bandori_tracker_latest(text,text,integer,text,text,bigint,jsonb)',
        'EXECUTE'
    ) THEN
        RAISE EXCEPTION 'service_role must execute cutoff latest RPC';
    END IF;
    IF NOT EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'bandori_tracker_latest'
          AND policyname = 'bandori_tracker_latest_select_authenticated'
          AND 'authenticated' = ANY (roles)
    ) THEN
        RAISE EXCEPTION 'authenticated latest SELECT policy is missing';
    END IF;
    IF NOT EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'realtime'
          AND tablename = 'messages'
          AND policyname = 'bandori_cutoff_private_broadcast_select'
          AND cmd = 'SELECT'
          AND 'authenticated' = ANY (roles)
    ) THEN
        RAISE EXCEPTION 'cutoff Private Broadcast SELECT policy is missing';
    END IF;
    IF EXISTS (
        SELECT 1
        FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = 'bandori_tracker_latest'
    ) THEN
        RAISE EXCEPTION 'bandori_tracker_latest must not be in supabase_realtime';
    END IF;
END;
$$;

SET LOCAL ROLE service_role;

DO $$
DECLARE
    result record;
BEGIN
    SELECT * INTO result
    FROM public.upsert_bandori_tracker_latest(
        'cn',
        'events',
        987654321,
        NULL,
        'cn:events:987654321:1999999999000',
        1999999999000,
        jsonb_build_object(
            'event',
            jsonb_build_array(
                jsonb_build_array(100, 1999999999000, 123456),
                jsonb_build_array(1000, 1999999999000, 100000)
            )
        )
    );
    IF result.status <> 'written' OR result.revision <> 1 THEN
        RAISE EXCEPTION 'initial write returned unexpected result: %', row_to_json(result);
    END IF;

    SELECT * INTO result
    FROM public.upsert_bandori_tracker_latest(
        'cn',
        'events',
        987654321,
        NULL,
        'cn:events:987654321:1999999999000',
        1999999999000,
        jsonb_build_object(
            'event',
            jsonb_build_array(
                jsonb_build_array(100, 1999999999000, 123456),
                jsonb_build_array(1000, 1999999999000, 100000)
            )
        )
    );
    IF result.status <> 'duplicate' OR result.revision <> 1 THEN
        RAISE EXCEPTION 'exact retry returned unexpected result: %', row_to_json(result);
    END IF;

    SELECT * INTO result
    FROM public.upsert_bandori_tracker_latest(
        'cn',
        'events',
        987654321,
        NULL,
        'cn:events:987654321:1999999999000',
        1999999999000,
        jsonb_build_object('event', jsonb_build_array(jsonb_build_array(100, 1999999999000, 123456)))
    );
    IF result.status <> 'conflict' OR result.revision <> 1 THEN
        RAISE EXCEPTION 'same-sample subset retry returned unexpected result: %', row_to_json(result);
    END IF;

    SELECT * INTO result
    FROM public.upsert_bandori_tracker_latest(
        'cn',
        'events',
        987654321,
        NULL,
        'cn:events:987654321:1999999999000',
        1999999999000,
        '{}'::jsonb
    );
    IF result.status <> 'conflict' OR result.revision <> 1 THEN
        RAISE EXCEPTION 'same-sample empty retry returned unexpected result: %', row_to_json(result);
    END IF;

    SELECT * INTO result
    FROM public.upsert_bandori_tracker_latest(
        'cn',
        'events',
        987654321,
        NULL,
        'cn:events:987654321:1999999998000',
        1999999998000,
        jsonb_build_object('event', jsonb_build_array(jsonb_build_array(100, 1999999998000, 120000)))
    );
    IF result.status <> 'stale' OR result.revision <> 1 THEN
        RAISE EXCEPTION 'stale write returned unexpected result: %', row_to_json(result);
    END IF;

    SELECT * INTO result
    FROM public.upsert_bandori_tracker_latest(
        'cn',
        'events',
        987654321,
        NULL,
        'cn:events:987654321:1999999999000',
        1999999999000,
        jsonb_build_object('event', jsonb_build_array(jsonb_build_array(100, 1999999999000, 999999)))
    );
    IF result.status <> 'conflict' OR result.revision <> 1 THEN
        RAISE EXCEPTION 'same-time conflict returned unexpected result: %', row_to_json(result);
    END IF;

    SELECT * INTO result
    FROM public.upsert_bandori_tracker_latest(
        'cn',
        'events',
        987654321,
        NULL,
        'cn:events:987654321:2000000000000',
        2000000000000,
        jsonb_build_object('event', jsonb_build_array(jsonb_build_array(1000, 2000000000000, 100000)))
    );
    IF result.status <> 'written' OR result.revision <> 2
       OR result.payload -> 'event' <> jsonb_build_array(
            jsonb_build_array(100, 1999999999000, 123456),
            jsonb_build_array(1000, 2000000000000, 100000)
       ) THEN
        RAISE EXCEPTION 'partial merge returned unexpected result: %', row_to_json(result);
    END IF;

    SELECT * INTO result
    FROM public.upsert_bandori_tracker_latest(
        'cn',
        'events',
        987654321,
        NULL,
        'cn:events:987654321:2000000000000',
        2000000000000,
        jsonb_build_object('event', jsonb_build_array(jsonb_build_array(2000, 2000000000000, 90000)))
    );
    IF result.status <> 'conflict' OR result.revision <> 2 THEN
        RAISE EXCEPTION 'same-sample partial retry returned unexpected result: %', row_to_json(result);
    END IF;

    SELECT * INTO result
    FROM public.upsert_bandori_tracker_latest(
        'cn',
        'events',
        987654321,
        NULL,
        'cn:events:987654321:1999999999500',
        1999999999500,
        jsonb_build_object('event', jsonb_build_array(jsonb_build_array(2000, 1999999999500, 90000)))
    );
    IF result.status <> 'written' OR result.revision <> 3
       OR result.payload ->> 'sampleId' <> 'cn:events:987654321:2000000000000'
       OR (result.payload ->> 'publishedAt')::bigint <> 2000000000000 THEN
        RAISE EXCEPTION 'older partial fill moved snapshot identity: %', row_to_json(result);
    END IF;

    BEGIN
        PERFORM public.upsert_bandori_tracker_latest(
            'cn',
            'events',
            987654322,
            NULL,
            'cn:events:987654322:2000000000000',
            2000000000000,
            jsonb_build_object('event', jsonb_build_array(jsonb_build_array(100.5, 2000000000000, 100000)))
        );
        RAISE EXCEPTION 'fractional point was unexpectedly accepted';
    EXCEPTION
        WHEN OTHERS THEN
            IF SQLERRM = 'fractional point was unexpectedly accepted' THEN
                RAISE;
            END IF;
    END;

    BEGIN
        PERFORM public.upsert_bandori_tracker_latest(
            'cn',
            'events',
            987654324,
            NULL,
            'cn:events:987654324:2000000000000',
            2000000000000,
            jsonb_build_object('event', jsonb_build_array(jsonb_build_array(100, 1999999999999, 100000)))
        );
        RAISE EXCEPTION 'mixed observation time was unexpectedly accepted';
    EXCEPTION
        WHEN OTHERS THEN
            IF SQLERRM = 'mixed observation time was unexpectedly accepted' THEN
                RAISE;
            END IF;
    END;

    BEGIN
        PERFORM public.upsert_bandori_tracker_latest(
            'cn',
            'events',
            987654323,
            NULL,
            'cn:events:987654323:2000000000000',
            2000000000000,
            jsonb_build_object('event', jsonb_build_array(jsonb_build_array(100, 2000000000001, 100000)))
        );
        RAISE EXCEPTION 'future point was unexpectedly accepted';
    EXCEPTION
        WHEN OTHERS THEN
            IF SQLERRM = 'future point was unexpectedly accepted' THEN
                RAISE;
            END IF;
    END;

    BEGIN
        PERFORM public.upsert_bandori_tracker_latest(
            'cn',
            'monthly',
            18,
            '2026-08',
            'cn:monthly:18:2000000000000',
            2000000000000,
            jsonb_build_object('monthly', jsonb_build_array(jsonb_build_array(100, 2000000000000, 100000)))
        );
        RAISE EXCEPTION 'mismatched monthly period was unexpectedly accepted';
    EXCEPTION
        WHEN OTHERS THEN
            IF SQLERRM = 'mismatched monthly period was unexpectedly accepted' THEN
                RAISE;
            END IF;
    END;
END;
$$;

RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config(
    'request.jwt.claims',
    '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated","is_anonymous":true}',
    true
);
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM public.bandori_tracker_latest
        WHERE server = 'cn' AND namespace = 'events' AND target_id = 987654321
    ) THEN
        RAISE EXCEPTION 'anonymous authenticated JWT unexpectedly read latest snapshot';
    END IF;
END;
$$;

SELECT set_config(
    'request.jwt.claims',
    '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated","is_anonymous":false}',
    true
);
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM public.bandori_tracker_latest
        WHERE server = 'cn' AND namespace = 'events' AND target_id = 987654321
    ) THEN
        RAISE EXCEPTION 'registered authenticated JWT could not read latest snapshot';
    END IF;
END;
$$;

RESET ROLE;
ROLLBACK;
